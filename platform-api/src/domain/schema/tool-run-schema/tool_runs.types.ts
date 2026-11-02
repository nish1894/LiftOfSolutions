// Generated from Schema_liftofsol; run npm run schema:sync. Do not edit by hand.
// tool_runs collection: one document per tool call an agent makes, so risky calls can wait for a
// person to approve them, and every call has a record. Tools themselves are tool nodes in the
// Agent schema (other team member); this is the platform side of running them.
// Connected to the Project schema (project_id), the Agent schema (agent_id, node_id),
// the Transactions schema (transaction_id) and the Inbox schema (conversation_id).
// Keys: PK = primary key, FK = foreign key, UNIQUE = no two documents share the value.
//
// Rules enforced in code:
// - A tool node whose config has requires_approval: true starts as "pending_approval", with
//   approval_expires_at = created_at + APPROVAL_TIMEOUT_HOURS. Any other starts as "approved".
//   (The agent side adds requires_approval and idempotent to tool node config.)
// - Status changes only along TOOL_RUN_TRANSITIONS (canMoveToolRun()):
//   pending_approval → approved | rejected | expired
//   approved → running
//   running → succeeded | failed | needs_review
//   needs_review → succeeded | failed | approved   (a person checked what happened)
// - Approving: in one transaction, the run must be "pending_approval" AND now < approval_expires_at
//   (canApprove()). A late approval is refused and the run becomes "expired". Approving or
//   rejecting needs the project permission "tools.approve"; decided_by, decided_at and
//   decision_note? are set with it. The scheduled expiry job only tidies up overdue runs; it never
//   decides whether a late approval counts.
// - Executing: a worker claims the run in one transaction: "approved" → "running", attempts + 1,
//   lease_until = now + LEASE_SECONDS, and first_attempt_at = now if it isn't set yet. The new
//   attempts value is the worker's claim number; it keeps it.
// - Saving the outcome: in one transaction, re-read the run and save "succeeded" or "failed" only if
//   ownsClaim() holds: status "running", attempts still equals the worker's claim number, and
//   now < lease_until. Otherwise another worker has reclaimed the run: the stale worker saves
//   nothing and only logs what it saw (the current owner's call, with the same idempotency_key,
//   or a person in needs_review settles it).
// - The tool is called with idempotency_key passed to the provider whenever the provider supports
//   it (e.g. Stripe's Idempotency-Key header). Such tools are marked idempotent: true on the node.
// - Crash recovery: a run still "running" after lease_until may or may not have done its action.
//   recoveryStep() decides:
//   - idempotent tool, still inside its retry window (first_attempt_at + retry_window_seconds) and
//     under MAX_ATTEMPTS: claim it again and repeat the call with the same idempotency_key; the
//     provider returns the first result instead of acting twice.
//   - after the window, or when the window is unknown: "needs_review". A provider only remembers
//     idempotency keys for a while (Stripe: 24 hours), after which the same key is a new request.
//     retry_window_seconds is set per tool node, safely shorter than the provider's retention.
//   - any other tool: never retried automatically. It becomes "needs_review", a person checks the
//     provider (did the refund happen?) and sets "succeeded", "failed", or "approved" to run it again.
// - The unique idempotency_key = toolRunKey(transaction_id, node_id, call_index) stops the same call
//   being recorded twice; together with the rules above it stops the action happening twice.
// - arguments and result are stored as the tool sent and returned them. Secrets never go in them:
//   credentials are referenced by the tool node, not copied.
// - tool_runs are kept; only status, attempts, lease_until, result, error and the decision fields change.

export const APPROVAL_TIMEOUT_HOURS = 24; // placeholder; see ../README.md section 15
export const LEASE_SECONDS = 120;          // longer than the slowest tool call is allowed to take
export const MAX_ATTEMPTS = 3;             // idempotent tools only

export type ToolRunStatus =
  | "pending_approval"
  | "approved"
  | "rejected"
  | "expired"
  | "running"
  | "succeeded"
  | "failed"
  | "needs_review";

export const TOOL_RUN_TRANSITIONS: Record<ToolRunStatus, readonly ToolRunStatus[]> = {
  pending_approval: ["approved", "rejected", "expired"],
  approved: ["running"],
  rejected: [],
  expired: [],
  running: ["succeeded", "failed", "needs_review", "running"], // running → running = reclaimed after a crash
  succeeded: [],
  failed: [],
  needs_review: ["succeeded", "failed", "approved"],
};

export interface ToolRun {
  _id: string;                 // PK. UUID v4
  project_id: string;          // FK → projects._id
  agent_id: string;            // FK → agents._id
  transaction_id: string;      // FK → transactions._id, the agent run that made the call
  conversation_id?: string;    // FK → conversations._id, when the run was answering a conversation
  node_id: string;             // → agent template nodes[].id (Agent schema)
  tool_name: string;           // copied from the node, so history reads correctly after edits
  idempotent: boolean;         // copied from the node: the provider honours idempotency_key
  retry_window_seconds?: number; // copied from the node: how long after first_attempt_at a retry is
                               // still safe (shorter than the provider's key retention); missing = unknown
  idempotency_key: string;     // UNIQUE. toolRunKey(); also sent to the provider
  arguments: Record<string, unknown>; // what the agent asked the tool to do
  result?: Record<string, unknown>;   // what the tool returned
  status: ToolRunStatus;
  attempts: number;            // how many times a worker has claimed it; also the current claim number
  first_attempt_at?: Date;     // when the tool was first called; anchors the retry window
  lease_until?: Date;          // while "running": the claiming worker's deadline
  approval_expires_at?: Date;  // runs that needed approval: no approval after this
  error?: string;              // with "failed" or "needs_review"
  decided_by?: string;         // FK → users._id, who approved, rejected or reviewed it
  decided_at?: Date;
  decision_note?: string;      // e.g. "Refund approved, order checked"
  created_at: Date;
  updated_at: Date;
  finished_at?: Date;          // with "succeeded", "failed", "rejected" or "expired"
}

// ---------- Helpers ----------

export function canMoveToolRun(from: ToolRunStatus, to: ToolRunStatus): boolean {
  return TOOL_RUN_TRANSITIONS[from].includes(to);
}

// Checked inside the approving transaction, against the run as read in that transaction.
export function canApprove(run: Pick<ToolRun, "status" | "approval_expires_at">, now: Date): boolean {
  return run.status === "pending_approval" && !!run.approval_expires_at && now < run.approval_expires_at;
}

// What to do with a run found "running" after its lease ended.
export function recoveryStep(
  run: Pick<ToolRun, "idempotent" | "attempts" | "first_attempt_at" | "retry_window_seconds">,
  now: Date,
): "retry" | "needs_review" {
  if (!run.idempotent || !run.first_attempt_at || !run.retry_window_seconds) return "needs_review";
  const windowEnds = run.first_attempt_at.getTime() + run.retry_window_seconds * 1000;
  return now.getTime() < windowEnds && run.attempts < MAX_ATTEMPTS ? "retry" : "needs_review";
}

// True only for the worker whose claim is still current. Checked inside the transaction that saves
// the outcome, against the run as read in that transaction.
export function ownsClaim(
  run: Pick<ToolRun, "status" | "attempts" | "lease_until">,
  claimNumber: number,
  now: Date,
): boolean {
  return run.status === "running" && run.attempts === claimNumber && !!run.lease_until && now < run.lease_until;
}

// The nth tool call (0, 1, 2 …) a given node makes within one agent run.
export function toolRunKey(transactionId: string, nodeId: string, callIndex: number): string {
  if (!Number.isInteger(callIndex) || callIndex < 0) throw new Error("callIndex must be a whole number of 0 or more");
  return `${transactionId}:${nodeId}:${callIndex}`;
}
