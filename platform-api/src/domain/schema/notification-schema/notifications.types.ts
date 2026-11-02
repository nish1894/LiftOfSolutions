// Generated from Schema_liftofsol; run npm run schema:sync. Do not edit by hand.
// notifications collection: the in-app bell. One document per notification per person.
// Connected to the User schema (user_id) and the Organization schema (org_id).
// Keys: PK = primary key, FK = foreign key, UNIQUE = no two documents share the value.
//
// Rules enforced in code:
// - One document per recipient. A notification for "everyone who can approve tools in this project"
//   is written once for each of those people (a project has a handful).
// - A notification is never edited except read_at. It is deleted automatically RETENTION_DAYS
//   after it is created (TTL on expires_at).
// - Text is written when the notification is created, so it reads the same later.
// - In-app only. Emails go out separately, only to users whose settings.notifications.email is on,
//   and are not stored here.
// - A person only sees their own: every read is filtered by user_id.
// - The same event notifies a person once: dedupe_key = dedupeKey(type, event_id, user_id) is UNIQUE.
//   event_id names one occurrence, not the record it is about, so a retry of the same event reuses
//   it and a later event of the same kind gets a new one. A conversation transferred A → B → A gives
//   A two notifications, because each transfer is its own system message:
//     conversation.handoff_requested  the "handoff_requested" system message id
//     conversation.assigned           the "assigned" or "transferred" system message id
//     tool_run.approval_needed        the tool run id (a run asks for approval once)
//     invitation.accepted             the invitation id
//     billing.payment_failed          the billing event id of that failure
//     billing.credits_low             `${org_id}:${credit_period}` (once per credit period)

export const RETENTION_DAYS = 90;

// Not limited to these; add types as features arrive.
export type NotificationType =
  | "conversation.handoff_requested"  // a conversation is waiting for a person
  | "conversation.assigned"           // a conversation was assigned or transferred to you
  | "tool_run.approval_needed"        // a tool call is waiting for approval
  | "invitation.accepted"             // someone you invited joined
  | "billing.payment_failed"          // the organization's payment failed
  | "billing.credits_low";            // the organization is running out of credits

export interface Notification {
  _id: string;                 // PK. UUID v4
  user_id: string;             // FK → users._id, who sees it
  org_id: string;              // FK → organizations._id
  type: NotificationType;
  title: string;               // e.g. "Priya Sharma is waiting for a person"
  body: string;                // e.g. "Asked for a refund over ₹5,000"
  section?: string;            // where clicking goes in the app, e.g. "inbox"
  resource_type?: string;      // e.g. "conversation", "tool_run", "invoice"
  resource_id?: string;        // its _id
  project_id?: string;         // FK → projects._id, when it belongs to a project
  actor_user_id?: string;      // FK → users._id, who caused it; missing = the system
  dedupe_key: string;          // UNIQUE. dedupeKey(type, event_id, user_id)
  read_at?: Date;              // missing = unread
  created_at: Date;
  expires_at: Date;            // TTL: created_at + RETENTION_DAYS
}

export function dedupeKey(type: NotificationType, eventId: string, userId: string): string {
  if (!eventId.trim()) throw new Error("eventId is empty");
  return `${type}:${eventId}:${userId}`;
}
