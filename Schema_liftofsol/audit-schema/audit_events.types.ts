// audit_events collection: who did what, and when, in an organization. A security record, not a
// feature log: sign-ins, member and role changes, agent and knowledge changes, credentials, billing,
// tool approvals.
// Connected to the Organization schema (org_id), the Project schema (project_id) and the User schema.
// Keys: PK = primary key, FK = foreign key, UNIQUE = no two documents share the value.
//
// Rules enforced in code:
// - Written in the same transaction as the change it records, so a change can't happen unrecorded.
// - Append-only: never edited. Deleted automatically RETENTION_DAYS after it is created (TTL).
// - changes holds only the fields that changed, before and after. Secrets (credential values,
//   tokens, password hashes) are never written, only that they changed: { secret_values: "changed" }.
// - Reading the log needs the organization action "audit.view" (owners and admins).
// - The platform team acting inside a customer's organization is recorded with actor_type
//   "platform" and their user id.

export const RETENTION_DAYS = 365; // placeholder; see ../README.md section 15

export type ActorType = "user" | "system" | "platform"; // platform = our own staff

export interface AuditEvent {
  _id: string;                 // PK. UUID v4
  org_id: string;              // FK → organizations._id
  project_id?: string;         // FK → projects._id, when the change is inside a project
  actor_type: ActorType;
  actor_user_id?: string;      // FK → users._id; missing for "system"
  action: string;              // "<resource>.<verb>", e.g. "member.invited", "agent.published", "plan.changed"
  resource_type: string;       // e.g. "invitation", "agent", "credential", "billing_account"
  resource_id?: string;        // its _id
  changes?: {                  // only the fields that changed
    before?: Record<string, unknown>;
    after?: Record<string, unknown>;
  };
  request_id?: string;         // the API request, to match server logs
  ip_address?: string;
  user_agent?: string;
  created_at: Date;
  expires_at: Date;            // TTL: created_at + RETENTION_DAYS
}
