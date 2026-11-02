import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { conflict, notFound } from "../common/errors.js";
import { parse } from "../common/schemas.js";
import { duplicate, type Tx } from "./database.js";
import { Platform, id, type Principal } from "./platform.js";
import {
  authentication,
  dto,
  p,
  uuidParam,
  type TokenVerifier,
} from "./http.js";
import { Inbox } from "./inbox.js";
import { projectPermissions } from "../domain/schema/project-schema/projects.types.js";
import {
  APPROVAL_TIMEOUT_HOURS,
  LEASE_SECONDS,
  canApprove,
  ownsClaim,
  recoveryStep,
  toolRunKey,
  type ToolRun,
} from "../domain/schema/tool-run-schema/tool_runs.types.js";

// Tool-run writes don't lock the organization document. Every change rewrites the run itself
// inside a transaction, so two workers or two approvers on the same run conflict on that run
// and one of them is rerun; runs in other conversations never wait for each other.

type EnqueueInput = {
  projectId: string;
  agentId: string;
  transactionId: string;
  nodeId: string;
  callIndex: number;
  toolName: string;
  arguments: Record<string, unknown>;
  requiresApproval: boolean;
  idempotent: boolean;
  retryWindowSeconds?: number;
  conversationId?: string;
};

type Outcome = {
  status: "succeeded" | "failed" | "needs_review";
  result?: Record<string, unknown>;
  error?: string;
};

export class ToolRuns {
  constructor(readonly platform: Platform) {}

  get db() {
    return this.platform.db;
  }

  // Internal runtime boundary. Never exposed as a browser endpoint.
  // The future agent runtime supplies trusted node metadata, not user-submitted capability claims.
  async enqueue(input: EnqueueInput): Promise<ToolRun> {
    const key = toolRunKey(input.transactionId, input.nodeId, input.callIndex);
    const window = input.retryWindowSeconds;
    if (window !== undefined && (!Number.isSafeInteger(window) || window < 1))
      throw new Error("Invalid retry window");
    try {
      return await this.db.transaction(async (tx) => {
        const previous = await this.runHolding(tx, key);
        if (previous) {
          if (
            previous.project_id !== input.projectId ||
            previous.agent_id !== input.agentId
          ) {
            throw conflict(
              "TOOL_RUN_MISMATCH",
              "The operation key belongs to another scope.",
            );
          }
          return previous;
        }

        const project = await tx.get("projects", input.projectId);
        if (!project || project.status !== "active")
          throw notFound("Active project");
        // transactions belong to the RAG's transactions schema; only these fields are read.
        const transaction = await tx.get("transactions", input.transactionId);
        if (
          !transaction ||
          transaction.project_id !== input.projectId ||
          transaction.agent_id !== input.agentId ||
          transaction.status !== "running"
        )
          throw notFound("Running agent transaction");
        if (input.conversationId) {
          const conversation = await tx.get(
            "conversations",
            input.conversationId,
          );
          if (
            !conversation ||
            conversation.project_id !== input.projectId ||
            conversation.agent_id !== input.agentId
          )
            throw notFound("Conversation");
        }

        const now = new Date();
        const run: ToolRun = {
          _id: id(),
          project_id: input.projectId,
          agent_id: input.agentId,
          transaction_id: input.transactionId,
          node_id: input.nodeId,
          tool_name: input.toolName,
          idempotent: input.idempotent,
          idempotency_key: key,
          arguments: input.arguments,
          ...(window !== undefined ? { retry_window_seconds: window } : {}),
          ...(input.conversationId
            ? { conversation_id: input.conversationId }
            : {}),
          ...(input.requiresApproval
            ? {
                approval_expires_at: new Date(
                  now.getTime() + APPROVAL_TIMEOUT_HOURS * 3_600_000,
                ),
              }
            : {}),
          status: input.requiresApproval ? "pending_approval" : "approved",
          attempts: 0,
          created_at: now,
          updated_at: now,
        };
        tx.create("tool_runs", run);
        tx.claim("tool_runs.idempotency_key", key, run._id);

        if (input.requiresApproval) {
          const inbox = new Inbox(this.platform);
          for (const user of await this.platform.orgUsers(tx, project.org_id)) {
            if (
              user.status !== "active" ||
              !projectPermissions(user.membership.role, project, user._id).has(
                "tools.approve",
              )
            )
              continue;
            await inbox.notify(
              tx,
              project.org_id,
              user._id,
              "tool_run.approval_needed",
              run._id,
              "A tool call needs approval",
              run._id,
              project._id,
            );
          }
        }
        this.platform.audit(
          tx,
          null,
          project.org_id,
          "tool_run.created",
          "tool_run",
          run._id,
          undefined,
          project._id,
        );
        return run;
      });
    } catch (error) {
      if (!duplicate(error)) throw error;
      // A concurrent enqueue of the same call won; return its run.
      const holder = await this.db.claimed("tool_runs.idempotency_key", key);
      const previous =
        holder && (await this.db.get("tool_runs", holder.owner_id));
      if (
        previous &&
        previous.project_id === input.projectId &&
        previous.agent_id === input.agentId
      )
        return previous;
      throw error;
    }
  }

  private async runHolding(tx: Tx, key: string) {
    const holder = await tx.claimed("tool_runs.idempotency_key", key);
    return holder && (await tx.get("tool_runs", holder.owner_id));
  }

  async decide(
    principal: Principal,
    projectId: string,
    runId: string,
    decision: "approved" | "rejected",
    note?: string,
    now = new Date(),
  ) {
    const result = await this.db.transaction(async (tx) => {
      const { org } = await this.platform.project(
        principal,
        projectId,
        "tools.approve",
        tx,
      );
      const run = await tx.get("tool_runs", runId);
      if (!run || run.project_id !== projectId) throw notFound("Tool run");
      if (run.status !== "pending_approval")
        throw conflict(
          "TOOL_ALREADY_DECIDED",
          "This tool run is no longer awaiting approval.",
        );

      const expired = !canApprove(run, now);
      run.status = expired ? "expired" : decision;
      run.updated_at = now;
      if (expired || decision === "rejected") run.finished_at = now;
      if (!expired) {
        run.decided_by = principal.userId;
        run.decided_at = now;
        if (note) run.decision_note = note;
      }
      tx.set("tool_runs", run);
      this.platform.audit(
        tx,
        principal,
        org._id,
        `tool_run.${run.status}`,
        "tool_run",
        runId,
        undefined,
        projectId,
      );
      return { run, expired };
    });
    // Throw only after committing expiry, otherwise the transaction would undo it.
    if (result.expired)
      throw conflict("APPROVAL_EXPIRED", "The approval deadline has passed.");
    return result.run;
  }

  // Claim and complete persist state only. They do not execute tools; the agent runtime owns that.
  async claim(runId: string, now = new Date()): Promise<ToolRun | null> {
    return this.db.transaction(async (tx) => {
      const run = await tx.get("tool_runs", runId);
      if (!run) return null;
      const project = await tx.get("projects", run.project_id);
      if (!project || project.status !== "active") return null;

      if (run.status === "running") {
        const leaseLive = !run.lease_until || run.lease_until > now;
        if (leaseLive) return null;
        if (recoveryStep(run, now) === "needs_review") {
          this.moveToReview(tx, run, project.org_id, now);
          return null;
        }
      } else if (run.status !== "approved") {
        return null;
      }

      run.attempts += 1;
      run.status = "running";
      run.first_attempt_at ??= now;
      run.lease_until = new Date(now.getTime() + LEASE_SECONDS * 1000);
      run.updated_at = now;
      delete run.finished_at;
      delete run.error;
      tx.set("tool_runs", run);
      return run;
    });
  }

  async complete(
    runId: string,
    claimNumber: number,
    outcome: Outcome,
    now = new Date(),
  ) {
    return this.db.transaction(async (tx) => {
      const run = await tx.get("tool_runs", runId);
      if (!run || !ownsClaim(run, claimNumber, now)) return false;
      const project = await tx.get("projects", run.project_id);
      run.status = outcome.status;
      run.updated_at = now;
      delete run.lease_until;
      if (outcome.result) run.result = outcome.result;
      if (outcome.error) run.error = outcome.error;
      if (outcome.status !== "needs_review") run.finished_at = now;
      tx.set("tool_runs", run);
      if (project)
        this.platform.audit(
          tx,
          null,
          project.org_id,
          `tool_run.${outcome.status}`,
          "tool_run",
          runId,
          undefined,
          project._id,
        );
      return true;
    });
  }

  // Scheduled job: a run whose worker lease ended and which may not be retried goes to review.
  // Runs that may still be retried are left for the runtime to claim again.
  async sweepStale(runId: string, now = new Date()): Promise<boolean> {
    return this.db.transaction(async (tx) => {
      const run = await tx.get("tool_runs", runId);
      if (
        !run ||
        run.status !== "running" ||
        !run.lease_until ||
        run.lease_until > now ||
        recoveryStep(run, now) !== "needs_review"
      )
        return false;
      const project = await tx.get("projects", run.project_id);
      if (!project) return false;
      this.moveToReview(tx, run, project.org_id, now);
      return true;
    });
  }

  private moveToReview(tx: Tx, run: ToolRun, orgId: string, now: Date) {
    run.status = "needs_review";
    delete run.lease_until;
    run.updated_at = now;
    tx.set("tool_runs", run);
    this.platform.audit(
      tx,
      null,
      orgId,
      "tool_run.needs_review",
      "tool_run",
      run._id,
      undefined,
      run.project_id,
    );
  }

  async review(
    principal: Principal,
    projectId: string,
    runId: string,
    status: "approved" | "succeeded" | "failed",
    note: string,
  ) {
    return this.db.transaction(async (tx) => {
      const { org } = await this.platform.project(
        principal,
        projectId,
        "tools.approve",
        tx,
      );
      const run = await tx.get("tool_runs", runId);
      if (!run || run.project_id !== projectId || run.status !== "needs_review")
        throw conflict(
          "NOT_AWAITING_REVIEW",
          "This run does not need manual review.",
        );
      const now = new Date();
      run.status = status;
      run.decided_by = principal.userId;
      run.decided_at = now;
      run.decision_note = note;
      run.updated_at = now;
      if (status === "approved") delete run.finished_at;
      else run.finished_at = now;
      tx.set("tool_runs", run);
      this.platform.audit(
        tx,
        principal,
        org._id,
        "tool_run.reviewed",
        "tool_run",
        runId,
        { after: { status, note } },
        projectId,
      );
      return run;
    });
  }
}

const RUN_STATUSES = [
  "pending_approval",
  "approved",
  "running",
  "succeeded",
  "failed",
  "expired",
  "rejected",
  "needs_review",
] as const;

// The runs page shows at most this many; the frontend marks a full list as "100+".
const RUN_LIMIT = 100;

export async function toolRoutes(
  app: FastifyInstance,
  platform: Platform,
  verify: TokenVerifier,
) {
  const { authenticated } = authentication(platform, verify);
  const service = new ToolRuns(platform);
  const root = "/projects/:projectId/tool-runs";

  app.get(root, { preHandler: authenticated }, async (request) => {
    const { project } = await platform.project(
      p(request),
      uuidParam(request, "projectId"),
      "tools.view",
    );
    const input = parse(
      z.object({ status: z.enum(RUN_STATUSES).optional() }),
      request.query,
    );
    // Indexes: tool_runs (project_id[, status], created_at desc).
    const runs = await platform.db.find("tool_runs", (q) => {
      let query = q.where("project_id", "==", project._id);
      if (input.status) query = query.where("status", "==", input.status);
      return query.orderBy("created_at", "desc").limit(RUN_LIMIT);
    });
    return runs.map(dto);
  });

  for (const [action, status] of [
    ["approve", "approved"],
    ["reject", "rejected"],
  ] as const) {
    app.post(
      `${root}/:runId/${action}`,
      { preHandler: authenticated },
      async (request) => {
        const input = parse(
          z.object({ note: z.string().max(2000).optional() }).strict(),
          request.body ?? {},
        );
        const run = await service.decide(
          p(request),
          uuidParam(request, "projectId"),
          uuidParam(request, "runId"),
          status,
          input.note,
        );
        return dto(run);
      },
    );
  }

  app.post(
    `${root}/:runId/review`,
    { preHandler: authenticated },
    async (request) => {
      const input = parse(
        z
          .object({
            status: z.enum(["approved", "succeeded", "failed"]),
            note: z.string().trim().min(10).max(2000),
          })
          .strict(),
        request.body,
      );
      const run = await service.review(
        p(request),
        uuidParam(request, "projectId"),
        uuidParam(request, "runId"),
        input.status,
        input.note,
      );
      return dto(run);
    },
  );
}
