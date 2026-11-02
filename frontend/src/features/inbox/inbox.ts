import type { PlatformPermission } from "@/shared/permissions.ts";
import type { Conversation } from "@/shared/types.ts";

export const INBOX_FILTERS = [
  { value: "WAITING_FOR_AGENT", label: "Waiting" },
  { value: "AGENT_ACTIVE", label: "With a teammate" },
  { value: "AI_ACTIVE", label: "AI active" },
  { value: "RESOLVED", label: "Resolved" },
  { value: "", label: "All" },
];

/** The API returns at most this many conversations per list; there's no paging yet. */
export const CONVERSATION_LIMIT = 50;

/** One key and URL per filter, shared by the inbox, overview and sidebar. */
export function conversationsQuery(status: string, assigneeId?: string) {
  const params = new URLSearchParams({ limit: String(CONVERSATION_LIMIT) });
  if (status) params.set("conversation_status", status);
  if (assigneeId) params.set("assigned_agent_id", assigneeId);
  return {
    key: ["conversations", status || "all", assigneeId || "anyone"],
    path: `/conversations?${params.toString()}`,
  };
}

type Can = (permission: PlatformPermission) => boolean;
type ConversationState = Pick<Conversation, "status" | "assigned_user_id">;

const isHumanState = (status: string) =>
  status === "WAITING_FOR_AGENT" || status === "AGENT_ACTIVE";
const isClosedState = (status: string) => status === "RESOLVED" || status === "CLOSED";

/**
 * Why the composer is disabled, or null when the agent can reply. Mirrors the
 * API: a reply needs a human state and no other assignee.
 */
export function replyBlockedReason(conversation: ConversationState, uid: string, can: Can) {
  const status = conversation.status ?? "";
  const assignee = conversation.assigned_user_id;
  if (!can("conversations.reply")) return "You don't have permission to reply to customers.";
  if (status === "AI_ACTIVE") return "The AI is answering this conversation. Take over to reply.";
  if (isClosedState(status)) return "This conversation is closed. Reopen it to reply.";
  if (assignee && assignee !== uid) return "Another agent is handling this conversation.";
  return null;
}

/** Which buttons the state bar shows. Each flag matches one API rule. */
export function conversationActions(conversation: ConversationState, uid: string, can: Can) {
  const status = conversation.status ?? "";
  const assignee = conversation.assigned_user_id ?? null;
  const free = !assignee || assignee === uid;
  const manage = can("conversations.manage");

  return {
    takeOver: status === "AI_ACTIVE" && manage && can("conversations.assign"),
    claim: isHumanState(status) && !assignee && can("conversations.assign"),
    returnToAi: isHumanState(status) && free && manage,
    resolve: !isClosedState(status) && free && manage,
    reopen: isClosedState(status) && manage,
    transfer: !isClosedState(status) && can("conversations.assign"),
  };
}
