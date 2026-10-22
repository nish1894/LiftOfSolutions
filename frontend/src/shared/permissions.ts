import type { Membership, Role } from "./types.ts";

export const PLATFORM_PERMISSIONS = [
  "organization.view",
  "organization.update",
  "organization.delete",
  "organization.members.view",
  "organization.members.manage",
  "organization.permissions.manage",
  "agents.view",
  "agents.create",
  "agents.update",
  "agents.publish",
  "agents.test",
  "agents.archive",
  "customers.view",
  "customers.manage",
  "conversations.view",
  "conversations.reply",
  "conversations.assign",
  "conversations.manage",
  "channels.view",
  "channels.manage",
  "knowledge.view",
  "knowledge.manage",
  "integrations.view",
  "integrations.manage",
  "tools.view",
  "tools.manage",
  "tools.approve",
  "analytics.view",
  "usage.view",
  "billing.view",
  "billing.manage",
  "audit.view",
] as const;

export type PlatformPermission = (typeof PLATFORM_PERMISSIONS)[number];

/** Owners and the Prime user can do everything; everyone else is checked. */
export function hasPermission(
  membership: Pick<Membership, "role" | "effective_permissions">,
  permission: PlatformPermission,
): boolean {
  if (membership.role === "PRIME" || membership.role === "OWNER") return true;
  const granted = membership.effective_permissions ?? [];
  return granted.includes(permission) || granted.includes("*");
}

export const ROLE_LABELS: Record<Role, string> = {
  PRIME: "Prime",
  OWNER: "Owner",
  ADMIN: "Admin",
  AGENT: "Agent",
  VIEWER: "Viewer",
  CUSTOM: "Custom",
};

export const ROLE_DESCRIPTIONS: Record<Role, string> = {
  PRIME: "Created the organization. Has every permission and can't be restricted.",
  OWNER: "Every permission. Only the Prime user can grant or change it.",
  ADMIN: "Everything except deleting the organization and managing billing.",
  AGENT: "Works the inbox and customers; can view assistants and knowledge.",
  VIEWER: "Read-only access across the workspace.",
  CUSTOM: "Only the permissions picked for this member.",
};

/* Mirrors platform-api/src/permissions/catalog.ts. The API is the authority —
   this copy only explains roles on screen. Change both files together. */
const ADMIN_EXCLUDED: PlatformPermission[] = ["organization.delete", "billing.manage"];

export const ROLE_PERMISSIONS: Record<"OWNER" | "ADMIN" | "AGENT" | "VIEWER", readonly string[]> = {
  OWNER: PLATFORM_PERMISSIONS,
  ADMIN: PLATFORM_PERMISSIONS.filter((permission) => !ADMIN_EXCLUDED.includes(permission)),
  AGENT: [
    "organization.view",
    "agents.view",
    "customers.view",
    "customers.manage",
    "conversations.view",
    "conversations.reply",
    "conversations.assign",
    "channels.view",
    "knowledge.view",
    "tools.view",
    "analytics.view",
    "usage.view",
  ],
  VIEWER: [
    "organization.view",
    "organization.members.view",
    "agents.view",
    "customers.view",
    "conversations.view",
    "channels.view",
    "knowledge.view",
    "integrations.view",
    "tools.view",
    "analytics.view",
    "usage.view",
    "billing.view",
    "audit.view",
  ],
};

interface PermissionGroup {
  label: string;
  permissions: Array<{ key: PlatformPermission; label: string }>;
}

export const PERMISSION_GROUPS: PermissionGroup[] = [
  {
    label: "Organization",
    permissions: [
      { key: "organization.view", label: "View organization" },
      { key: "organization.update", label: "Edit organization details" },
      { key: "organization.delete", label: "Delete organization" },
      { key: "organization.members.view", label: "View members" },
      { key: "organization.members.manage", label: "Manage members and requests" },
      { key: "organization.permissions.manage", label: "Manage custom permissions" },
    ],
  },
  {
    label: "Assistants",
    permissions: [
      { key: "agents.view", label: "View assistants" },
      { key: "agents.create", label: "Create assistants" },
      { key: "agents.update", label: "Edit assistants" },
      { key: "agents.publish", label: "Publish assistants" },
      { key: "agents.test", label: "Test assistants" },
      { key: "agents.archive", label: "Archive assistants" },
    ],
  },
  {
    label: "Customers",
    permissions: [
      { key: "customers.view", label: "View customers" },
      { key: "customers.manage", label: "Add and edit customers" },
    ],
  },
  {
    label: "Conversations",
    permissions: [
      { key: "conversations.view", label: "View conversations" },
      { key: "conversations.reply", label: "Reply to customers" },
      { key: "conversations.assign", label: "Claim and transfer conversations" },
      { key: "conversations.manage", label: "Resolve, reopen and hand back to AI" },
    ],
  },
  {
    label: "Channels",
    permissions: [
      { key: "channels.view", label: "View channels" },
      { key: "channels.manage", label: "Manage channels" },
    ],
  },
  {
    label: "Knowledge",
    permissions: [
      { key: "knowledge.view", label: "View knowledge" },
      { key: "knowledge.manage", label: "Upload and manage documents" },
    ],
  },
  {
    label: "Integrations",
    permissions: [
      { key: "integrations.view", label: "View integrations" },
      { key: "integrations.manage", label: "Manage integrations" },
    ],
  },
  {
    label: "Tools",
    permissions: [
      { key: "tools.view", label: "View tools" },
      { key: "tools.manage", label: "Manage tools" },
      { key: "tools.approve", label: "Approve tool runs" },
    ],
  },
  {
    label: "Analytics & usage",
    permissions: [
      { key: "analytics.view", label: "View analytics" },
      { key: "usage.view", label: "View usage and cost" },
    ],
  },
  {
    label: "Billing",
    permissions: [
      { key: "billing.view", label: "View billing" },
      { key: "billing.manage", label: "Manage billing details" },
    ],
  },
  {
    label: "Audit",
    permissions: [{ key: "audit.view", label: "View audit log" }],
  },
];
