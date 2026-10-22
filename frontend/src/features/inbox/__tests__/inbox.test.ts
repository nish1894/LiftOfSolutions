import { describe, expect, it } from "vitest";

import { describeCitation } from "@/shared/citations.ts";
import type { PlatformPermission } from "@/shared/permissions.ts";

import { conversationActions, conversationsQuery, replyBlockedReason } from "../inbox.ts";

const all = () => true;
const only =
  (...allowed: PlatformPermission[]) =>
  (permission: PlatformPermission) =>
    allowed.includes(permission);

describe("replyBlockedReason", () => {
  it("lets the assigned agent reply", () => {
    expect(replyBlockedReason({ status: "AGENT_ACTIVE", assigned_user_id: "me" }, "me", all)).toBe(
      null,
    );
  });

  it("lets anyone reply to an unassigned waiting conversation", () => {
    expect(replyBlockedReason({ status: "WAITING_FOR_AGENT" }, "me", all)).toBe(null);
  });

  it("explains why the composer is closed", () => {
    expect(replyBlockedReason({ status: "AI_ACTIVE" }, "me", all)).toMatch(/Take over/);
    expect(replyBlockedReason({ status: "RESOLVED" }, "me", all)).toMatch(/Reopen/);
    expect(
      replyBlockedReason({ status: "AGENT_ACTIVE", assigned_user_id: "someone" }, "me", all),
    ).toMatch(/Another agent/);
    expect(replyBlockedReason({ status: "WAITING_FOR_AGENT" }, "me", only())).toMatch(/permission/);
  });
});

describe("conversationActions", () => {
  it("offers take over while the AI is answering", () => {
    const actions = conversationActions({ status: "AI_ACTIVE" }, "me", all);
    expect(actions.takeOver).toBe(true);
    expect(actions.claim).toBe(false);
  });

  it("offers claim only on an unassigned human conversation", () => {
    expect(conversationActions({ status: "WAITING_FOR_AGENT" }, "me", all).claim).toBe(true);
    expect(
      conversationActions({ status: "AGENT_ACTIVE", assigned_user_id: "me" }, "me", all).claim,
    ).toBe(false);
  });

  it("hides resolve from someone who isn't the assignee", () => {
    const actions = conversationActions(
      { status: "AGENT_ACTIVE", assigned_user_id: "someone" },
      "me",
      all,
    );
    expect(actions.resolve).toBe(false);
    expect(actions.returnToAi).toBe(false);
  });

  it("offers reopen on closed conversations for managers only", () => {
    expect(conversationActions({ status: "CLOSED" }, "me", all).reopen).toBe(true);
    expect(conversationActions({ status: "CLOSED" }, "me", only("conversations.view")).reopen).toBe(
      false,
    );
  });
});

describe("conversationsQuery", () => {
  it("builds one key and URL per filter", () => {
    const query = conversationsQuery("WAITING_FOR_AGENT", "me");
    expect(query.key).toEqual(["conversations", "WAITING_FOR_AGENT", "me"]);
    expect(query.path).toBe(
      "/conversations?limit=50&conversation_status=WAITING_FOR_AGENT&assigned_agent_id=me",
    );
    expect(conversationsQuery("").path).toBe("/conversations?limit=50");
  });
});

describe("describeCitation", () => {
  it("reads common field names", () => {
    expect(
      describeCitation({ title: "Refund policy.pdf", page: 3, snippet: "Within 14 days" }, 0),
    ).toEqual({ title: "Refund policy.pdf", location: "Page 3", snippet: "Within 14 days" });
  });

  it("falls back to a numbered label", () => {
    expect(describeCitation({}, 1)).toEqual({ title: "Source 2", location: "", snippet: "" });
  });
});
