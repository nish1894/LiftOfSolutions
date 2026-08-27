import { describe, expect, it } from "vitest";
import { canTransitionAgent } from "../src/modules/agents/routes.js";
import { privateAddress } from "../src/modules/tools/routes.js";
import { canClaimConversation } from "../src/modules/handoffs/routes.js";

describe("Agent lifecycle", () => {
  it("requires publish for ACTIVE", () => {
    expect(canTransitionAgent("DRAFT", "ACTIVE")).toBe(false);
    expect(canTransitionAgent("DRAFT", "TESTING")).toBe(true);
  });
  it("does not revive archived Agents", () =>
    expect(canTransitionAgent("ARCHIVED", "DRAFT")).toBe(false));
});

describe("tool SSRF address policy", () => {
  it.each([
    "127.0.0.1",
    "10.1.2.3",
    "172.16.1.2",
    "172.31.255.2",
    "192.168.1.1",
    "169.254.2.2",
    "::1",
    "fd00::1",
    "::ffff:127.0.0.1",
    "::ffff:10.0.0.1",
  ])("blocks %s", (address) => expect(privateAddress(address)).toBe(true));
  it.each(["8.8.8.8", "1.1.1.1", "172.32.0.1", "2001:4860:4860::8888"])(
    "permits public address %s",
    (address) => expect(privateAddress(address)).toBe(false),
  );
});

describe("atomic handoff claim policy", () => {
  it("allows the first claim and the same assignee retry", () => {
    expect(
      canClaimConversation(
        { status: "WAITING_FOR_AGENT", assignedUserId: null },
        "agent-a",
      ),
    ).toBe(true);
    expect(
      canClaimConversation(
        { status: "AGENT_ACTIVE", assignedUserId: "agent-a" },
        "agent-a",
      ),
    ).toBe(true);
  });
  it("rejects a competing agent", () => {
    expect(
      canClaimConversation(
        { status: "AGENT_ACTIVE", assignedUserId: "agent-a" },
        "agent-b",
      ),
    ).toBe(false);
  });
});
