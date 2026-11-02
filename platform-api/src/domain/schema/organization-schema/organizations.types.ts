// Generated from Schema_liftofsol; run npm run schema:sync. Do not edit by hand.
// organizations and invitations collections.
// Separate from the User schema (connected through users.membership, defined there)
// and from the Billing schema (connected through organizations.plan_id).
// Keys: PK = primary key, FK = foreign key, UNIQUE = no two documents share the value.
//
// Rules enforced in code:
// - People join an organization only by invitation. There are no join codes or join requests.
// - Every organization request first checks that the user and the organization are both active,
//   then canOrg(users.membership.role, action).
// - An organization always has at least one owner. The last owner can't be demoted or removed;
//   when they leave or delete their account, the organization is closed.
// - Closing: status "deleted" and deleted_at are set together. A closed organization is kept,
//   never purged. A paid plan must be cancelled first.
// - A member who leaves, is removed, or whose organization is closed gets a new organization
//   of their own on the default plan. Their work stays with the old organization.
// - Inviting, removing or changing the role of an owner needs "owners.manage" (owners only),
//   so an admin can never change an owner.
// - Only the platform team can suspend an organization. While suspended, its members are
//   refused and its data is kept.
// - A new organization starts with DEFAULT_ORG_SETTINGS.
// - Slug: an organization created for a new user gets defaultSlug(name, _id). Owners can change
//   it later if the new one is still unique. Renaming the organization doesn't change the slug.
// - Accepting an invite: it must be pending and not past expires_at, and the signed-in email
//   must match the invite's email and be verified.
// - Inviting someone who already has a pending invite replaces it: the old one is revoked and
//   the new one created in one transaction.

import type { AuthProvider, OrgRole } from "../shared.types.js";

export const INVITE_VALID_HOURS = 24;
export const EXPIRED_INVITE_RETENTION_DAYS = 7;

// ---------- organizations ----------

export type OrgStatus = "active" | "suspended" | "deleted";

// What each organization role may do. Work inside a project (agents, inbox, knowledge) is
// controlled by project roles (Project schema), checked after this.
export type OrgAction =
  | "org.edit"          // name, logo, settings
  | "members.manage"    // invite and remove members and admins
  | "owners.manage"     // invite, remove or change owners
  | "billing.manage"    // plan and payments
  | "org.close"
  | "projects.view_all" // see every project in the organization
  | "projects.create"
  | "projects.manage_access" // change who can do what in a project (Project schema)
  | "audit.view";       // read the organization's audit log (Audit schema)

export const ORG_ROLE_ACTIONS: Record<OrgRole, readonly OrgAction[]> = {
  owner: [
    "org.edit", "members.manage", "owners.manage", "billing.manage",
    "org.close", "projects.view_all", "projects.create", "projects.manage_access", "audit.view",
  ],
  admin: ["org.edit", "members.manage", "projects.view_all", "projects.create", "projects.manage_access", "audit.view"],
  member: [],
};

export function canOrg(role: OrgRole, action: OrgAction): boolean {
  return ORG_ROLE_ACTIONS[role].includes(action);
}

export interface OrgSettings {
  default_role: Exclude<OrgRole, "owner">; // role pre-selected when inviting someone
  allowed_providers: AuthProvider[];       // sign-in methods members may use
}

export const DEFAULT_ORG_SETTINGS: OrgSettings = {
  default_role: "member",
  allowed_providers: ["google", "email", "github"],
};

export interface Organization {
  _id: string;          // PK. UUID v4
  name: string;         // company name
  slug: string;         // UNIQUE. lowercase, used in URLs, e.g. "acme-robotics"
  logo_url?: string;
  plan_id: string;      // FK → plans._id (Billing schema). The default plan when created for a new user
  status: OrgStatus;
  created_by: string;   // FK → users._id
  created_at: Date;
  updated_at: Date;
  deleted_at?: Date;    // with status "deleted"; the organization is kept, never purged
  settings: OrgSettings;
}

// ---------- invitations ----------
// One open invite per person per organization: pending_key is UNIQUE and exists only while pending.

export type InvitationStatus = "pending" | "accepted" | "revoked" | "expired";

export interface Invitation {
  _id: string;          // PK. UUID v4
  org_id: string;       // FK → organizations._id
  email: string;        // lowercase; must match the signed-in user's verified email on accept
  role: OrgRole;        // copied into users.membership.role on accept
  token_hash: string;   // UNIQUE. SHA-256 hex of the invite token; the token itself is never stored
  pending_key?: string; // UNIQUE. pendingKey(org_id, email) while status is "pending"; removed otherwise
  invited_by: string;   // FK → users._id
  status: InvitationStatus;
  expires_at: Date;     // INVITE_VALID_HOURS after created_at; deleted EXPIRED_INVITE_RETENTION_DAYS after this
  created_at: Date;
  updated_at: Date;
}

// ---------- Helpers ----------

// Slug for an organization created automatically, e.g. "Asha's workspace" → "ashas-workspace-3b9e7c".
export function defaultSlug(name: string, id: string): string {
  const base = name
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .slice(0, 41)
    .replace(/^-+|-+$/g, "");
  return `${base || "org"}-${id.slice(0, 6)}`;
}

export function pendingKey(org_id: string, email: string): string {
  return `${org_id}:${email.toLowerCase()}`;
}
