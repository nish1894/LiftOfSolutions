import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Inbox } from "../../src/firestore/inbox.js";
import { createHarness, emulator } from "./harness.js";

describe.skipIf(!emulator)(
  "Firestore inbox (emulator)",
  { timeout: 20_000 },
  () => {
    const h = createHarness();
    const { tokens, request, onboard, join, newProject, activeAgent } = h;
    let inbox: Inbox;
    beforeAll(async () => {
      await h.start();
      inbox = new Inbox(h.platform);
    }, 30000);
    afterAll(() => h.stop());

    const contactMessages = async (projectId: string) =>
      (
        await h.db.find("messages", (q) =>
          q.where("project_id", "==", projectId),
        )
      ).filter((m) => m.sender_type === "contact").length;

    it("deduplicates incoming messages per connected account and stops blocked contacts", async () => {
      const owner = await onboard("inbox-owner");
      const projectId = await newProject("inbox-owner", owner.org);
      const agentId = await activeAgent(projectId);
      const base = {
        projectId,
        agentId,
        channel: "email" as const,
        externalId: "Customer@Example.test",
        content: "Hello",
        providerMessageId: "123",
      };
      const first = await inbox.receive({ ...base, connectionId: "mail-A" });
      const again = await inbox.receive({ ...base, connectionId: "mail-A" });
      const second = await inbox.receive({ ...base, connectionId: "mail-B" });
      expect(first.duplicate).toBe(false);
      expect(again.duplicate).toBe(true);
      if (first.ignored || second.ignored) throw new Error("ignored");
      expect(second.conversation_id).not.toBe(first.conversation_id);
      expect(await contactMessages(projectId)).toBe(2);

      const identity = (
        await h.db.find("contact_identities", (q) =>
          q.where("project_id", "==", projectId),
        )
      ).find((item) => item.external_id === "customer@example.test");
      expect(identity).toBeTruthy();
      const history = await request(
        "GET",
        `/projects/${projectId}/customers/${identity!.contact_id}/history`,
        "inbox-owner",
      );
      expect(history.statusCode, history.body).toBe(200);
      expect(history.json()).toHaveLength(2);
      expect(history.json()[0].status).toBe("AI_ACTIVE");

      await h.db
        .collection("contacts")
        .doc(identity!.contact_id)
        .update({ status: "blocked" });
      const blocked = await inbox.receive({
        ...base,
        connectionId: "mail-A",
        providerMessageId: "124",
      });
      expect(blocked.ignored).toBe(true);
      expect(await contactMessages(projectId)).toBe(2);
    });

    it("persists handoff history and one notification for each assignment occurrence", async () => {
      const owner = await onboard("handoff-owner");
      const projectId = await newProject("handoff-owner", owner.org);
      const agentId = await activeAgent(projectId);
      const received = await inbox.receive({
        projectId,
        agentId,
        connectionId: "widget-A",
        channel: "web_widget",
        externalId: "visitor-A",
        providerMessageId: "w1",
        content: "Help",
      });
      if (received.ignored) throw new Error("ignored");
      const principal = {
        userId: owner.id,
        token: tokens.get("handoff-owner")!,
      };
      const id = received.conversation_id;
      await inbox.transition(principal, projectId, id, "waiting_for_agent");
      await inbox.transition(
        principal,
        projectId,
        id,
        "agent_active",
        owner.id,
      );
      await inbox.transition(principal, projectId, id, "ai_active");
      await inbox.transition(
        principal,
        projectId,
        id,
        "agent_active",
        owner.id,
      );

      const notifications = await h.db.find("notifications", (q) =>
        q.where("project_id", "==", projectId),
      );
      expect(
        notifications.filter((n) => n.type === "conversation.assigned"),
      ).toHaveLength(2);
      const system = (
        await h.db.find("messages", (q) => q.where("conversation_id", "==", id))
      ).filter((m) => m.sender_type === "system");
      expect(system).toHaveLength(4);
      const shown = await request(
        "GET",
        `/projects/${projectId}/conversations/${id}`,
        "handoff-owner",
      );
      expect(shown.json().status).toBe("AGENT_ACTIVE");

      // The bell: unread count, then "mark all as read".
      const bell = await request("GET", "/notifications", "handoff-owner");
      expect(bell.json().unread_count).toBeGreaterThanOrEqual(3);
      expect(
        (await request("POST", "/notifications/read-all", "handoff-owner"))
          .statusCode,
      ).toBe(200);
      expect(
        (await request("GET", "/notifications", "handoff-owner")).json()
          .unread_count,
      ).toBe(0);
    });

    it("lets the assigned teammate resolve their own conversation, but not someone else's", async () => {
      const boss = await onboard("fix-owner");
      const staffId = await join("fix-owner", boss.org, "fix-staff");
      const projectId = await newProject("fix-owner", boss.org);
      const agentId = await activeAgent(projectId);
      const access = await request(
        "PUT",
        `/projects/${projectId}/access`,
        "fix-owner",
        {
          member: { user_id: staffId, grants: [], denies: [] },
        },
      );
      expect(access.statusCode, access.body).toBe(200);
      const visitor = (name: string) => ({
        projectId,
        agentId,
        connectionId: "widget-A",
        channel: "web_widget" as const,
        externalId: name,
        providerMessageId: `msg-${name}`,
        content: "Hello",
      });
      const base = `/projects/${projectId}/conversations`;

      const mine = await inbox.receive(visitor("visitor-1"));
      if (mine.ignored) throw new Error("ignored");
      expect(
        (
          await request(
            "POST",
            `${base}/${mine.conversation_id}/claim`,
            "fix-staff",
            {},
          )
        ).statusCode,
      ).toBe(200);
      const resolved = await request(
        "POST",
        `${base}/${mine.conversation_id}/resolve`,
        "fix-staff",
        {},
      );
      expect(resolved.statusCode, resolved.body).toBe(200);
      expect(resolved.json().status).toBe("RESOLVED");

      const theirs = await inbox.receive(visitor("visitor-2"));
      if (theirs.ignored) throw new Error("ignored");
      expect(
        (
          await request(
            "POST",
            `${base}/${theirs.conversation_id}/claim`,
            "fix-owner",
            {},
          )
        ).statusCode,
      ).toBe(200);
      expect(
        (
          await request(
            "POST",
            `${base}/${theirs.conversation_id}/resolve`,
            "fix-staff",
            {},
          )
        ).statusCode,
      ).toBe(403);
    });

    it("writes inbound messages without touching the organization document", async () => {
      const boss = await onboard("busy-owner");
      const projectId = await newProject("busy-owner", boss.org);
      const agentId = await activeAgent(projectId);
      const before = (await h.db.get("organizations", boss.org))!.updated_at;
      const results = await Promise.all(
        Array.from({ length: 10 }, (_, i) =>
          inbox.receive({
            projectId,
            agentId,
            connectionId: "widget-A",
            channel: "web_widget",
            externalId: `crowd-${i}`,
            providerMessageId: `msg-crowd-${i}`,
            content: "Hello",
          }),
        ),
      );
      expect(results.every((result) => !result.ignored)).toBe(true);
      expect(await contactMessages(projectId)).toBe(10);
      const after = (await h.db.get("organizations", boss.org))!.updated_at;
      expect(after.getTime()).toBe(before.getTime());
    });

    it("reads a long conversation back to its start, a page at a time", async () => {
      const owner = await onboard("history-owner");
      const projectId = await newProject("history-owner", owner.org);
      const agentId = await activeAgent(projectId);
      let conversationId = "";
      for (let i = 1; i <= 7; i++) {
        const result = await inbox.receive({
          projectId,
          agentId,
          connectionId: "widget-A",
          channel: "web_widget",
          externalId: "long-talker",
          providerMessageId: `long-${i}`,
          content: `Message ${i}`,
        });
        if (result.ignored) throw new Error("ignored");
        conversationId = result.conversation_id;
      }
      const page = (before?: string) =>
        request(
          "GET",
          `/projects/${projectId}/conversations/${conversationId}/messages?limit=3${before ? `&before=${before}` : ""}`,
          "history-owner",
        ).then(
          (response) =>
            response.json() as {
              items: { content: string }[];
              next_cursor: string | null;
            },
        );

      const latest = await page();
      expect(latest.items.map((m) => m.content)).toEqual([
        "Message 5",
        "Message 6",
        "Message 7",
      ]);
      expect(latest.next_cursor).toBeTruthy();
      const middle = await page(latest.next_cursor!);
      expect(middle.items.map((m) => m.content)).toEqual([
        "Message 2",
        "Message 3",
        "Message 4",
      ]);
      const first = await page(middle.next_cursor!);
      expect(first.items.map((m) => m.content)).toEqual(["Message 1"]);
      expect(first.next_cursor).toBeNull();
    });
  },
);
