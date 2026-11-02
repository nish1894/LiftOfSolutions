import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { loadConfig } from "../config.js";
import { createFirebaseServices } from "../firebase/admin.js";
import { AppError } from "../common/errors.js";
import { Database, type Name } from "./database.js";
import { Platform } from "./platform.js";
import { Billing } from "./billing.js";
import { Inbox } from "./inbox.js";
import { ToolRuns } from "./tools.js";
import { deleteUploadIfDone } from "./knowledge.js";
import { CLOSE_AFTER_DAYS } from "../domain/schema/inbox-schema/inbox.types.js";
import { EXPIRED_INVITE_RETENTION_DAYS } from "../domain/schema/organization-schema/organizations.types.js";

// The scheduled work, run once a minute: roll due free-plan credit periods, expire overdue approvals,
// close old resolved conversations, settle finished runs, send stale tool runs to review, delete
// expired records, and delete knowledge uploads the RAG has finished with. The free Firestore plan has no TTL policies, so this job does what MongoDB's TTL
// indexes did. Each step handles at most BATCH items a minute.

const BATCH = 100;
const DAY_MS = 86_400_000;
const PENDING_CHARGE_GRACE_MS = 10 * 60_000; // give a finishing run time to settle itself

export async function sweep(platform: Platform, now = new Date()) {
  return {
    periods: await rollDuePeriods(platform, now),
    approvals: await expireApprovals(platform, now),
    closed: await closeResolvedConversations(platform, now),
    settled: await settlePendingCharges(platform, now),
    reviews: await sweepStaleToolRuns(platform, now),
    deleted: await deleteExpired(platform.db, now),
    uploads: await cleanUpUploads(platform.db, now),
  };
}

async function rollDuePeriods(platform: Platform, now: Date) {
  const due = await platform.db.find("billing_accounts", (q) =>
    q
      .where("credits_reset_at", "<=", now)
      .orderBy("credits_reset_at")
      .limit(BATCH),
  );
  const billing = new Billing(platform);
  let periods = 0;
  for (const account of due) {
    // A paid subscription renews through its provider; a closed workspace keeps its history only.
    if (account.subscription && !account.subscription.cancelled_at) continue;
    const org = await platform.db.get("organizations", account._id);
    if (org?.status !== "active") continue;
    const updated = await billing.rollDefaultPeriod(account._id, now);
    if (updated.credit_period > account.credit_period) periods++;
  }
  return periods;
}

async function expireApprovals(platform: Platform, now: Date) {
  // Index: tool_runs (status, approval_expires_at).
  const overdue = await platform.db.find("tool_runs", (q) =>
    q
      .where("status", "==", "pending_approval")
      .where("approval_expires_at", "<=", now)
      .orderBy("approval_expires_at")
      .limit(BATCH),
  );
  let expired = 0;
  for (const { _id } of overdue) {
    const changed = await platform.db.transaction(async (tx) => {
      const run = await tx.get("tool_runs", _id);
      if (
        !run ||
        run.status !== "pending_approval" ||
        !run.approval_expires_at ||
        run.approval_expires_at > now
      )
        return false;
      const project = await tx.get("projects", run.project_id);
      run.status = "expired";
      run.finished_at = now;
      run.updated_at = now;
      tx.set("tool_runs", run);
      if (project)
        platform.audit(
          tx,
          null,
          project.org_id,
          "tool_run.expired",
          "tool_run",
          _id,
          undefined,
          project._id,
        );
      return true;
    });
    if (changed) expired++;
  }
  return expired;
}

// Resolved conversations close CLOSE_AFTER_DAYS after resolved_at.
async function closeResolvedConversations(platform: Platform, now: Date) {
  const cutoff = new Date(now.getTime() - CLOSE_AFTER_DAYS * DAY_MS);
  // Index: conversations (status, resolved_at).
  const due = await platform.db.find("conversations", (q) =>
    q
      .where("status", "==", "resolved")
      .where("resolved_at", "<=", cutoff)
      .orderBy("resolved_at")
      .limit(BATCH),
  );
  const inbox = new Inbox(platform);
  let closed = 0;
  for (const conversation of due)
    if (await inbox.closeResolved(conversation._id, now)) closed++;
  return closed;
}

// A usage charge left pending after its agent run finished is settled with that run's cost.
// Runs that haven't finished yet (RUN_NOT_FINISHED) are left for the next sweep.
async function settlePendingCharges(platform: Platform, now: Date) {
  const before = new Date(now.getTime() - PENDING_CHARGE_GRACE_MS);
  // Index: usage_charges (status, created_at).
  const pending = await platform.db.find("usage_charges", (q) =>
    q
      .where("status", "==", "pending")
      .where("created_at", "<=", before)
      .orderBy("created_at")
      .limit(BATCH),
  );
  const billing = new Billing(platform);
  let settled = 0;
  for (const charge of pending) {
    try {
      await billing.settleRun(charge._id, now);
      settled++;
    } catch (error) {
      if (!(error instanceof AppError && error.code === "RUN_NOT_FINISHED"))
        throw error;
    }
  }
  return settled;
}

// Tool runs whose worker lease ended and which may not be retried go to needs_review.
async function sweepStaleToolRuns(platform: Platform, now: Date) {
  // Index: tool_runs (status, lease_until).
  const stale = await platform.db.find("tool_runs", (q) =>
    q
      .where("status", "==", "running")
      .where("lease_until", "<=", now)
      .orderBy("lease_until")
      .limit(BATCH),
  );
  const toolRuns = new ToolRuns(platform);
  let reviews = 0;
  for (const run of stale)
    if (await toolRuns.sweepStale(run._id, now)) reviews++;
  return reviews;
}

// Knowledge uploads the RAG has finished with (or that are a day old) are deleted from disk.
async function cleanUpUploads(db: Database, now: Date) {
  const waiting = await db.find("knowledge_sources", (q) =>
    q.where("file_path", "!=", null).limit(BATCH),
  );
  let removed = 0;
  for (const source of waiting)
    if (await deleteUploadIfDone(db, source, now)) removed++;
  return removed;
}

// Records past their expires_at (plus a retention period for invitations), as MongoDB's TTL
// indexes used to remove. A deleted notification also frees its claimed dedupe key.
async function deleteExpired(db: Database, now: Date) {
  const inviteCutoff = new Date(
    now.getTime() - EXPIRED_INVITE_RETENTION_DAYS * DAY_MS,
  );
  const targets: [Name, Date][] = [
    ["invitations", inviteCutoff],
    ["notifications", now],
    ["audit_events", now],
    ["billing_events", now],
  ];
  let deleted = 0;
  for (const [name, cutoff] of targets) {
    const expired = await db.find(name, (q) =>
      q.where("expires_at", "<=", cutoff).limit(BATCH),
    );
    if (!expired.length) continue;
    await db.transaction(async (tx) => {
      for (const record of expired) {
        tx.delete(name, record._id);
        if (name === "notifications" && "dedupe_key" in record)
          tx.release("notifications.dedupe_key", record.dedupe_key);
      }
    });
    deleted += expired.length;
  }
  return deleted;
}

// Run as its own process: node dist/firestore/maintenance.js. Locally it is limited to the emulator.
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const config = loadConfig();
  if (config.APP_ENV !== "development" || !process.env.FIRESTORE_EMULATOR_HOST)
    throw new Error(
      "This maintenance process runs only in development against the Firestore emulator.",
    );
  const db = new Database(createFirebaseServices(config).firestore);
  const platform = new Platform(db, config);
  const abort = new AbortController();
  for (const signal of ["SIGINT", "SIGTERM"] as const)
    process.once(signal, () => abort.abort());
  try {
    while (!abort.signal.aborted) {
      try {
        const result = await sweep(platform);
        if (Object.values(result).some(Boolean))
          console.log("Maintenance sweep", result);
      } catch (error) {
        console.error("Maintenance sweep failed", error);
      }
      try {
        await sleep(60_000, undefined, { signal: abort.signal });
      } catch {
        break;
      }
    }
  } finally {
    await db.close();
  }
}
