import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Billing } from "../../src/firestore/billing.js";
import { Inbox } from "../../src/firestore/inbox.js";
import { ToolRuns } from "../../src/firestore/tools.js";
import { sweep } from "../../src/firestore/maintenance.js";
import { createHarness, emulator } from "./harness.js";

describe.skipIf(!emulator)(
  "Firestore tool runs and billing (emulator)",
  { timeout: 20_000 },
  () => {
    const h = createHarness();
    const { tokens, request, onboard, newProject, activeAgent } = h;
    beforeAll(() => h.start(), 30000);
    afterAll(() => h.stop());

    // An agent run as the RAG's transactions schema records it.
    const agentRun = (fields: Record<string, unknown>) => {
      const transactionId = randomUUID();
      return h.db
        .collection("transactions")
        .doc(transactionId)
        .set({ _id: transactionId, ...fields })
        .then(() => transactionId);
    };

    it("enforces approval deadlines and rejects stale claims after recovery", async () => {
      const owner = await onboard("tool-owner");
      const projectId = await newProject("tool-owner", owner.org);
      const agentId = randomUUID(),
        nodeId = randomUUID();
      const transactionId = await agentRun({
        project_id: projectId,
        agent_id: agentId,
        status: "running",
      });
      const tools = new ToolRuns(h.platform);
      const call = (callIndex: number, requiresApproval: boolean) =>
        tools.enqueue({
          projectId,
          agentId,
          transactionId,
          nodeId,
          callIndex,
          toolName: "refund",
          arguments: { order: String(100 + callIndex) },
          requiresApproval,
          idempotent: true,
          retryWindowSeconds: 3600,
        });

      const pending = await call(0, true);
      expect((await call(0, true))._id).toBe(pending._id);
      const principal = { userId: owner.id, token: tokens.get("tool-owner")! };
      await expect(
        tools.decide(
          principal,
          projectId,
          pending._id,
          "approved",
          undefined,
          new Date(pending.approval_expires_at!.getTime() + 1),
        ),
      ).rejects.toMatchObject({ code: "APPROVAL_EXPIRED" });
      expect((await h.db.get("tool_runs", pending._id))?.status).toBe(
        "expired",
      );

      const runnable = await call(1, false);
      const first = await tools.claim(
        runnable._id,
        new Date("2026-10-25T10:00:00Z"),
      );
      const second = await tools.claim(
        runnable._id,
        new Date("2026-10-25T10:02:01Z"),
      );
      expect(first?.attempts).toBe(1);
      expect(second?.attempts).toBe(2);
      const done = new Date("2026-10-25T10:02:02Z");
      expect(
        await tools.complete(runnable._id, 1, { status: "succeeded" }, done),
      ).toBe(false);
      expect(
        await tools.complete(
          runnable._id,
          2,
          { status: "succeeded", result: { id: "rf-1" } },
          done,
        ),
      ).toBe(true);
      expect((await h.db.get("tool_runs", runnable._id))?.result).toEqual({
        id: "rf-1",
      });

      // The approvals page lists the project's runs.
      const listed = await request(
        "GET",
        `/projects/${projectId}/tool-runs`,
        "tool-owner",
      );
      expect(listed.statusCode, listed.body).toBe(200);
      expect(listed.json()).toHaveLength(2);
    });

    it("settles usage against the organization pinned at admission exactly once", async () => {
      const owner = await onboard("billing-owner");
      const projectId = await newProject("billing-owner", owner.org);
      const agentId = await activeAgent(projectId);
      const billing = new Billing(h.platform);
      const transactionId = randomUUID();
      await billing.admitRun(projectId, agentId, transactionId);
      await h.db.collection("transactions").doc(transactionId).set({
        _id: transactionId,
        project_id: projectId,
        agent_id: agentId,
        status: "succeeded",
        total_micros: 2500,
      });
      const settled = await billing.settleRun(transactionId);
      expect(settled.org_id).toBe(owner.org);
      expect(settled.credits).toBe(3);
      expect(settled.status).toBe("settled");
      expect((await billing.settleRun(transactionId)).credits).toBe(3);
      expect(
        (await h.db.get("billing_accounts", owner.org))?.included_credits_left,
      ).toBe(997);
    });

    it("rolls a due default credit period once and keeps a cause-based grant key", async () => {
      const owner = await onboard("period-owner");
      await h.db
        .collection("billing_accounts")
        .doc(owner.org)
        .update({ credits_reset_at: new Date("2026-01-01T00:00:00.000Z") });
      const billing = new Billing(h.platform);
      const now = new Date("2026-01-02T00:00:00.000Z");
      const rolled = await billing.rollDefaultPeriod(owner.org, now);
      expect(rolled.credit_period).toBe(2);
      expect(rolled.credits_reset_at.toISOString()).toBe(
        "2026-02-01T00:00:00.000Z",
      );
      expect(
        (await billing.rollDefaultPeriod(owner.org, now)).credit_period,
      ).toBe(2);
      const grants = (
        await h.db.find("credit_ledger", (q) =>
          q.where("org_id", "==", owner.org),
        )
      ).filter((entry) => entry.type === "grant");
      expect(grants).toHaveLength(2);
    });

    it("never writes when the billing page is viewed, even when a period is due", async () => {
      const owner = await onboard("bill-owner");
      await h.db
        .collection("billing_accounts")
        .doc(owner.org)
        .update({
          credits_reset_at: new Date(Date.now() - 60_000),
          included_credits_left: 5,
        });
      const view = await request(
        "GET",
        `/organizations/${owner.org}/billing/account`,
        "bill-owner",
      );
      expect(view.statusCode, view.body).toBe(200);
      const unchanged = await h.db.get("billing_accounts", owner.org);
      expect(unchanged!.credit_period).toBe(1);
      expect(unchanged!.included_credits_left).toBe(5);
      expect(
        (await new Billing(h.platform).rollDefaultPeriod(owner.org))
          .credit_period,
      ).toBe(2);
    });

    it("updates and clears the billing profile through the owner-only API", async () => {
      const owner = await onboard("profile-owner");
      const url = `/organizations/${owner.org}/billing/profile`;
      const changed = await request("PATCH", url, "profile-owner", {
        legal_name: "Example Ltd",
        email: "billing@example.test",
      });
      expect(changed.statusCode, changed.body).toBe(200);
      expect((await request("GET", url, "profile-owner")).json().email).toBe(
        "billing@example.test",
      );
      const cleared = await request("PATCH", url, "profile-owner", {
        email: null,
      });
      expect(cleared.statusCode, cleared.body).toBe(200);
      expect((await request("GET", url, "profile-owner")).json()).toEqual({
        legal_name: "Example Ltd",
      });
    });

    it("closes old resolved conversations and reviews runs that can't be retried", async () => {
      const owner = await onboard("sweep-owner");
      const projectId = await newProject("sweep-owner", owner.org);
      const agentId = await activeAgent(projectId);
      const inbox = new Inbox(h.platform);
      const received = await inbox.receive({
        projectId,
        agentId,
        connectionId: "widget-A",
        channel: "web_widget",
        externalId: "old-visitor",
        providerMessageId: "old-1",
        content: "Hello",
      });
      if (received.ignored) throw new Error("ignored");
      await h.db
        .collection("conversations")
        .doc(received.conversation_id)
        .update({
          status: "resolved",
          resolved_at: new Date(Date.now() - 8 * 86_400_000),
        });
      expect(await inbox.closeResolved(received.conversation_id)).toBe(true);
      const closed = await h.db.get("conversations", received.conversation_id);
      expect(closed!.status).toBe("closed");
      expect(closed!.open_key).toBeUndefined();
      expect(await inbox.closeResolved(received.conversation_id)).toBe(false);
      // Its open key is free again: the same visitor's next message opens a new conversation.
      const next = await inbox.receive({
        projectId,
        agentId,
        connectionId: "widget-A",
        channel: "web_widget",
        externalId: "old-visitor",
        providerMessageId: "old-2",
        content: "Back again",
      });
      if (next.ignored) throw new Error("ignored");
      expect(next.conversation_id).not.toBe(received.conversation_id);

      const now = new Date();
      const stale = {
        project_id: projectId,
        agent_id: agentId,
        transaction_id: randomUUID(),
        node_id: randomUUID(),
        tool_name: "refund_order",
        arguments: {},
        status: "running",
        attempts: 1,
        first_attempt_at: new Date(now.getTime() - 60_000),
        lease_until: new Date(now.getTime() - 1_000),
        created_at: now,
        updated_at: now,
      };
      const unsafe = {
        ...stale,
        _id: randomUUID(),
        idempotent: false,
        idempotency_key: randomUUID(),
      };
      const retryable = {
        ...stale,
        _id: randomUUID(),
        idempotent: true,
        retry_window_seconds: 3600,
        idempotency_key: randomUUID(),
      };
      for (const run of [unsafe, retryable])
        await h.db.collection("tool_runs").doc(run._id).set(run);
      const runs = new ToolRuns(h.platform);
      expect(await runs.sweepStale(unsafe._id, now)).toBe(true);
      expect((await h.db.get("tool_runs", unsafe._id))!.status).toBe(
        "needs_review",
      );
      expect(await runs.sweepStale(retryable._id, now)).toBe(false);
      expect((await h.db.get("tool_runs", retryable._id))!.status).toBe(
        "running",
      );
    });

    it("the maintenance sweep expires approvals and deletes expired records", async () => {
      const owner = await onboard("maint-owner");
      const projectId = await newProject("maint-owner", owner.org);
      const agentId = randomUUID();
      const transactionId = await agentRun({
        project_id: projectId,
        agent_id: agentId,
        status: "running",
      });
      const pending = await new ToolRuns(h.platform).enqueue({
        projectId,
        agentId,
        transactionId,
        nodeId: randomUUID(),
        callIndex: 0,
        toolName: "refund",
        arguments: {},
        requiresApproval: true,
        idempotent: true,
      });
      const later = new Date(pending.approval_expires_at!.getTime() + 1);
      const notified = (
        await h.db.find("notifications", (q) =>
          q.where("project_id", "==", projectId),
        )
      ).length;
      expect(notified).toBeGreaterThan(0);

      // A year and a day on, the approval has expired and every dated record is past its expiry.
      const result = await sweep(
        h.platform,
        new Date(later.getTime() + 366 * 86_400_000),
      );
      expect(result.approvals).toBe(1);
      expect((await h.db.get("tool_runs", pending._id))?.status).toBe(
        "expired",
      );
      expect(result.deleted).toBeGreaterThan(0);
      expect(
        (
          await h.db.find("notifications", (q) =>
            q.where("project_id", "==", projectId),
          )
        ).length,
      ).toBe(0);
    });
  },
);
