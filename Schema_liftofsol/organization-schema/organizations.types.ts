// organizations and invitations collections.
// Separate from the User schema (connected through users.membership, defined there)
// and from the Billing schema (connected through organizations.plan_id).
// Keys: PK = primary key, FK = foreign key, UNIQUE = no two documents share the value.
//
// Rules enforced in code:
// - An organization always has at least one owner. When the last owner leaves or deletes
//   their account, the organization is closed.
// - Closing: status "deleted" and deleted_at are set together. A closed organization is kept,
//   never purged. A paid plan must be cancelled first.
// - A member who leaves, is removed, or whose organization is closed gets a new organization
//   of their own on the default plan. Their work stays with the old organization.
// - Only owners can invite owners.
// - Only the platform team can suspend an organization. While suspended, its members are
//   refused and its data is kept.
// - A new organization starts with DEFAULT_ORG_SETTINGS.

import type { AuthProvider, OrgRole } from "../shared.types";

export const INVITE_VALID_HOURS = 24;
export const EXPIRED_INVITE_RETENTION_DAYS = 7;

// ---------- organizations ----------

export type OrgStatus = "active" | "suspended" | "deleted";

export interface OrgSettings {
  default_role: Exclude<OrgRole, "owner">; // role given to new members
  invite_only: boolean;                    // true = people join only by invitation
  allowed_providers: AuthProvider[];       // sign-in methods members may use
}

export const DEFAULT_ORG_SETTINGS: OrgSettings = {
  default_role: "member",
  invite_only: true,
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
// UNIQUE together: org_id + email, while status is "pending"
// (one open invite per person per organization).

export type InvitationStatus = "pending" | "accepted" | "revoked" | "expired";

export interface Invitation {
  _id: string;          // PK. UUID v4
  org_id: string;       // FK → organizations._id
  email: string;        // lowercase; must match the signed-in user's email on accept
  role: OrgRole;        // copied into users.membership.role on accept
  token_hash: string;   // UNIQUE. SHA-256 hex of the invite token; the token itself is never stored
  invited_by: string;   // FK → users._id
  status: InvitationStatus;
  expires_at: Date;     // INVITE_VALID_HOURS after created_at; deleted EXPIRED_INVITE_RETENTION_DAYS after this
  created_at: Date;
  updated_at: Date;
}
