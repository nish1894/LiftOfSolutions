// Generated from Schema_liftofsol; run npm run schema:sync. Do not edit by hand.
// conversations and messages collections: the inbox. Handoffs (take over, transfer, return to AI)
// live here too: the current state on the conversation, each step as a "system" message.
// Connected to the Project schema (project_id), the Contact schema (contact_id, identity_id),
// the Agent schema (agent_id) and the Transactions schema (messages.transaction_id).
// Keys: PK = primary key, FK = foreign key, UNIQUE = no two documents share the value.
//
// Rules enforced in code:
// - One open conversation per agent, connected account and contact identity:
//   open_key = openKey(agent_id, connection_id, identity_id) is UNIQUE and set while the conversation
//   isn't "closed". An incoming message finds its conversation by open_key; none means a new one.
//   The same contact writing to two connected inboxes gets two conversations, each replying through
//   its own connection_id and external_thread_id.
// - Status changes only along CONVERSATION_TRANSITIONS (canMoveConversation()):
//   ai_active          the agent answers
//   waiting_for_agent  the AI, the contact or a teammate asked for a person; nobody has it yet
//   agent_active       a teammate (assigned_user_id) has it; the AI stays silent
//   resolved           done; a new message from the contact reopens it as ai_active
//   closed             final; open_key is removed, so the next message starts a new conversation
// - assigned_user_id is set only while "agent_active".
// - Only the assigned teammate can reply while "agent_active". The AI only replies while "ai_active".
//   Replying needs the project permission "conversations.reply"; assigning someone else or
//   transferring needs "conversations.assign". The assigned teammate can resolve, hand back to the
//   AI or ask for help on their own conversation with "conversations.reply"; any other status change
//   needs "conversations.manage".
// - Every status change, assignment or transfer adds a "system" message with the matching event,
//   in the same transaction as the conversation update. That is the handoff history.
// - Writing a message and updating the conversation's last_message_at and last_message_preview
//   happen in one transaction (2 writes per message).
// - Messages from a provider carry external_key = externalKey(project_id, connection_id, provider
//   message id), UNIQUE, so a webhook delivered twice stores the message once. The key is scoped to
//   the project and the connected account, because a provider's message ids are only guaranteed
//   unique within one account (two email inboxes can both report message "123").
// - Messages are not edited, except delivery (sent → delivered → read, or failed) and erasure.
// - A "resolved" conversation becomes "closed" CLOSE_AFTER_DAYS after resolved_at (a scheduled job).
// - AI messages record the transaction_id of the agent run that wrote them, and their citations.

import type { Channel } from "../shared.types.js";

export const CLOSE_AFTER_DAYS = 7; // placeholder; see ../README.md section 15
export const PREVIEW_LENGTH = 140;

// ---------- conversations ----------

export type ConversationStatus = "ai_active" | "waiting_for_agent" | "agent_active" | "resolved" | "closed";

export const CONVERSATION_TRANSITIONS: Record<ConversationStatus, readonly ConversationStatus[]> = {
  ai_active: ["waiting_for_agent", "agent_active", "resolved"],
  waiting_for_agent: ["agent_active", "ai_active", "resolved"],
  agent_active: ["agent_active", "ai_active", "resolved"], // agent_active → agent_active is a transfer
  resolved: ["ai_active", "waiting_for_agent", "closed"],
  closed: [],
};

export interface Conversation {
  _id: string;                 // PK. UUID v4
  project_id: string;          // FK → projects._id
  agent_id: string;            // FK → agents._id, the agent answering this conversation
  contact_id: string;          // FK → contacts._id
  identity_id: string;         // FK → contact_identities._id, where replies are sent
  channel: Channel;            // copied from the identity
  connection_id: string;       // the connected account it came through: the credential id
                               // (Agent schema) for WhatsApp, email and LINE; the widget id for web chat
  open_key?: string;           // UNIQUE. openKey(agent_id, connection_id, identity_id) while not "closed"
  external_thread_id?: string; // the provider's thread, e.g. an email thread id
  status: ConversationStatus;
  assigned_user_id?: string;   // FK → users._id, only while "agent_active"
  handoff_reason?: string;     // why a person was asked for, e.g. "Asked for a refund over ₹5,000"
  summary?: string;            // short summary, e.g. written by the AI at handoff
  last_message_at: Date;       // sorts the inbox
  last_message_preview?: string; // first PREVIEW_LENGTH characters of the last message
  created_at: Date;
  updated_at: Date;
  resolved_at?: Date;          // with status "resolved" or "closed"
  closed_at?: Date;            // with status "closed"
}

// ---------- messages ----------

export type SenderType = "contact" | "ai" | "agent" | "system"; // "agent" = a teammate (support agent)
export type ContentType = "text" | "image" | "file";
export type Delivery = "sent" | "delivered" | "read" | "failed";

export type ConversationEvent =
  | "handoff_requested"  // to waiting_for_agent
  | "assigned"           // to agent_active (taken or assigned)
  | "transferred"        // agent_active, to another teammate
  | "returned_to_ai"     // to ai_active
  | "resolved"
  | "reopened"
  | "closed";

export interface Attachment {
  url: string;                 // storage path or provider media URL
  mime_type: string;
  name?: string;
  size_bytes?: number;
}

export interface Citation {
  rag_id: string;              // FK → rags._id (Knowledge schema)
  document_id: string;         // FK → rag_documents._id
  title: string;               // copied, so the citation reads correctly after the document changes
  url?: string;
  snippet?: string;            // the part of the document the answer used
}

export interface Message {
  _id: string;                 // PK. UUID v4
  conversation_id: string;     // FK → conversations._id
  project_id: string;          // FK → projects._id, copied for queries and erasure
  sender_type: SenderType;
  sender_user_id?: string;     // FK → users._id, for "agent" messages and teammate-triggered events
  content_type: ContentType;
  content: string;             // the text; a caption for an image or file; empty for some events
  attachments?: Attachment[];
  citations?: Citation[];      // "ai" messages
  transaction_id?: string;     // FK → transactions._id, the agent run that wrote an "ai" message
  event?: ConversationEvent;   // "system" messages
  event_data?: {               // "system" messages
    from_user_id?: string;
    to_user_id?: string;
    reason?: string;
  };
  external_key?: string;       // UNIQUE. externalKey(project_id, connection_id, provider message id)
  delivery?: Delivery;         // outgoing messages on WhatsApp, LINE, email
  created_at: Date;
}

// ---------- Helpers ----------

export function canMoveConversation(from: ConversationStatus, to: ConversationStatus): boolean {
  return CONVERSATION_TRANSITIONS[from].includes(to);
}

export function openKey(agentId: string, connectionId: string, identityId: string): string {
  return `${agentId}:${connectionId}:${identityId}`;
}

export function externalKey(projectId: string, connectionId: string, providerMessageId: string): string {
  if (!providerMessageId.trim()) throw new Error("providerMessageId is empty");
  return `${projectId}:${connectionId}:${providerMessageId}`;
}

export function previewOf(content: string): string {
  const flat = content.replace(/\s+/g, " ").trim();
  return flat.length > PREVIEW_LENGTH ? `${flat.slice(0, PREVIEW_LENGTH - 1)}…` : flat;
}
