// projects collection: groups of agents inside one organization, with per-project permissions.
// Connected to the Organization schema (org_id, users.membership.role) and the User schema (user_id).
// Agents, credentials, knowledge, transactions and agent memory all belong to a project (project_id).
// Keys: PK = primary key, FK = foreign key, UNIQUE = no two documents share the value.
//
// Rules enforced in code:
// - Every project belongs to exactly one organization. There are no personal projects.
// - Roles are fixed: the user's organization role (owner, admin, member). Projects don't define roles.
// - A person's permissions in a project come from projectPermissions():
//   owners get everything; members see only projects they are listed in; the role's list is the
//   project's role_permissions for that role, or DEFAULT_ROLE_PERMISSIONS; then the person's grants
//   are added and their denies removed.
// - Changing access (role_permissions, members, grants, denies) needs the organization action
//   "projects.manage_access" (owners and admins). On top of that:
//   - only owners change role_permissions.admin, so admins can't widen their own role;
//   - nobody changes their own entry in members;
//   - a person can only grant permissions they hold in that project themselves (owners hold all):
//     ungrantable() lists what they asked for but don't hold, and the change is refused if it isn't empty.
//   Every access change is written to the audit log.
// - Only people in the project's organization can be in members, each user at most once.
// - Someone leaving the organization is removed from every project in it, in the same transaction.
// - A project never changes organization; someone joining another one leaves their projects behind.
// - Creating a project needs the organization action "projects.create" (owners and admins); the
//   plan's limits.projects is checked first.
// - Archiving stops its agents answering; the data is kept. deleted_at is set with status "deleted".
// - project_members/{projectId}_{userId} is a copy only the RAG reads (README 6.5): one for each person whose
//   projectPermissions() isn't empty, rewritten in the same transaction as any change that can alter that.

import type { OrgRole } from "../shared.types";

// Everything a person can do inside a project. Organization-level actions are OrgAction (Organization schema).
export const ALL_PROJECT_PERMISSIONS = [
  "agents.view", "agents.create", "agents.update", "agents.publish", "agents.test", "agents.archive",
  "contacts.view", "contacts.manage",
  "conversations.view", "conversations.reply", "conversations.assign", "conversations.manage",
  "channels.view", "channels.manage",
  "knowledge.view", "knowledge.manage",
  "integrations.view", "integrations.manage",
  "tools.view", "tools.manage", "tools.approve",
  "analytics.view", "usage.view",
] as const;

export type ProjectPermission = (typeof ALL_PROJECT_PERMISSIONS)[number];

// Used when a project doesn't set role_permissions for that role. Owners always get everything.
// member = support staff: answer conversations, look things up, nothing that changes the agents.
export const DEFAULT_ROLE_PERMISSIONS: Record<Exclude<OrgRole, "owner">, readonly ProjectPermission[]> = {
  admin: ALL_PROJECT_PERMISSIONS,
  member: [
    "agents.view", "contacts.view", "contacts.manage",
    "conversations.view", "conversations.reply", "conversations.assign",
    "channels.view", "knowledge.view", "tools.view", "analytics.view", "usage.view",
  ],
};

export type ProjectStatus = "active" | "archived" | "deleted";

export interface ProjectMember {
  user_id: string;               // FK → users._id, in the same organization
  grants: ProjectPermission[];   // extra permissions for this person in this project
  denies: ProjectPermission[];   // removed permissions for this person in this project
  added_by: string;              // FK → users._id
  added_at: Date;
}

export interface Project {
  _id: string;                   // PK. UUID v4
  org_id: string;                // FK → organizations._id
  name: string;                  // e.g. "Support India"
  description?: string;
  status: ProjectStatus;
  role_permissions?: {           // role-based: replaces DEFAULT_ROLE_PERMISSIONS for that role here
    admin?: ProjectPermission[];
    member?: ProjectPermission[];
  };
  members: ProjectMember[];      // individual-based, embedded (a project has a handful of people)
  created_by: string;            // FK → users._id
  created_at: Date;
  updated_at: Date;
  deleted_at?: Date;             // with status "deleted"
}

// project_members collection: the RAG's access check. The RAG only checks that the document exists.
export interface ProjectMemberCopy {
  _id: string;                   // PK. `${project_id}_${user_id}`
  project_id: string;            // FK → projects._id
  user_id: string;               // FK → users._id
  updated_at: Date;              // when the platform last wrote it
}

// ---------- Helpers ----------

// Permissions in `requested` that the person granting them doesn't hold. Empty = allowed.
export function ungrantable(granter: Set<ProjectPermission>, requested: readonly ProjectPermission[]): ProjectPermission[] {
  return requested.filter((p) => !granter.has(p));
}

export function projectPermissions(role: OrgRole, project: Project, userId: string): Set<ProjectPermission> {
  if (role === "owner") return new Set(ALL_PROJECT_PERMISSIONS);
  const member = project.members.find((m) => m.user_id === userId);
  if (role === "member" && !member) return new Set();
  const result = new Set<ProjectPermission>(project.role_permissions?.[role] ?? DEFAULT_ROLE_PERMISSIONS[role]);
  member?.grants.forEach((p) => result.add(p));
  member?.denies.forEach((p) => result.delete(p));
  return result;
}
