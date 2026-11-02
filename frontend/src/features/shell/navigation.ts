import {
  BarChart3Icon,
  BotIcon,
  ContactIcon,
  InboxIcon,
  LayoutDashboardIcon,
  type LucideIcon,
  NetworkIcon,
  SettingsIcon,
  ShieldCheckIcon,
} from "lucide-react";

import type { PlatformPermission } from "@/shared/permissions.ts";

export type NavBadge = "waiting" | "requests";

/** What a badge number means, for screen readers. */
export const BADGE_TEXT: Record<NavBadge, string> = {
  waiting: "conversations waiting",
  requests: "tool calls waiting for approval",
};

/* Amber for people waiting, indigo for approvals (as in the design). */
export const BADGE_TONE: Record<NavBadge, string> = {
  waiting: "bg-warning-bg text-warning",
  requests: "bg-accent text-accent-foreground",
};

export interface NavItem {
  path: string;
  label: string;
  icon: LucideIcon;
  /** Hidden from members who lack it. */
  permission?: PlatformPermission;
  badge?: NavBadge;
  /** Shown in the bottom tab bar on phones. */
  mobile?: boolean;
}

/* The sidebar from the design: one flat "Workspace" list. Shared by the sidebar,
   the ⌘K search, the phone tab bar and the page titles, so a section cannot
   exist in one and not the others. */
export const NAV_ITEMS: NavItem[] = [
  { path: "overview", label: "Overview", icon: LayoutDashboardIcon },
  {
    path: "inbox",
    label: "Inbox",
    icon: InboxIcon,
    permission: "conversations.view",
    badge: "waiting",
    mobile: true,
  },
  { path: "assistants", label: "Agents", icon: BotIcon, permission: "agents.view", mobile: true },
  {
    path: "requests",
    label: "Approvals",
    icon: ShieldCheckIcon,
    permission: "tools.view",
    badge: "requests",
    mobile: true,
  },
  { path: "integrations", label: "Channels", icon: NetworkIcon, permission: "channels.view" },
  { path: "customers", label: "Contacts", icon: ContactIcon, permission: "customers.view" },
  { path: "analytics", label: "Analytics", icon: BarChart3Icon, permission: "analytics.view" },
  { path: "settings", label: "Settings", icon: SettingsIcon },
];

/* Settings is one sidebar entry with underline tabs on top, like the design.
   Each tab is still its own route, so old links keep working. */
export const SETTINGS_SECTIONS: { path: string; label: string; permission?: PlatformPermission }[] =
  [
    { path: "settings", label: "General", permission: "organization.view" },
    { path: "projects", label: "Projects", permission: "organization.permissions.manage" },
    { path: "members", label: "Team", permission: "organization.members.view" },
    { path: "billing", label: "Billing", permission: "billing.view" },
    { path: "account", label: "Account" },
  ];

const SETTINGS_PATHS = SETTINGS_SECTIONS.map((section) => section.path);

/** The sidebar entry that should look active for a route section. */
export function navPathFor(section: string | undefined): string {
  return SETTINGS_PATHS.includes(section ?? "") ? "settings" : (section ?? "overview");
}

// Page names for the browser title. The Settings tabs are pages too; "settings" itself keeps its sidebar name.
const LABELS: Record<string, string> = Object.fromEntries([
  ...SETTINGS_SECTIONS.map((section) => [section.path, section.label]),
  ...NAV_ITEMS.map((item) => [item.path, item.label]),
]);

export function sectionLabel(path: string | undefined): string {
  if (!path) return "Overview";
  return LABELS[path] ?? "Page not found";
}

/* Section ids from the previous single-route app. Notifications from the API
   and old bookmarks still use them. */
const LEGACY_SECTIONS: Record<string, string> = {
  chat: "assistants",
  conversations: "inbox",
  channels: "integrations",
  approvals: "requests",
  team: "members",
  organization: "settings",
  profile: "account",
};

export function pathForSection(section: string): string {
  return LEGACY_SECTIONS[section] ?? section;
}
