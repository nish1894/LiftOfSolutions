import {
  BarChart3Icon,
  BookOpenIcon,
  BotIcon,
  Building2Icon,
  ContactIcon,
  CreditCardIcon,
  FlaskConicalIcon,
  InboxIcon,
  LayoutDashboardIcon,
  type LucideIcon,
  PlugIcon,
  UserCheckIcon,
  UsersIcon,
} from "lucide-react";

import type { PlatformPermission } from "@/shared/permissions.ts";

export type NavBadge = "waiting" | "requests" | "failedKnowledge";

/** What a badge number means, for screen readers. */
export const BADGE_TEXT: Record<NavBadge, string> = {
  waiting: "conversations waiting",
  requests: "pending requests",
  failedKnowledge: "sources failed",
};

export const BADGE_TONE: Record<NavBadge, string> = {
  waiting: "bg-(--orange-bg) text-(--orange)",
  requests: "bg-(--orange-bg) text-(--orange)",
  failedKnowledge: "bg-danger-bg text-danger",
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

export interface NavGroup {
  label: string;
  items: NavItem[];
}

/* Shared by the sidebar, the ⌘K search, the tab bar and the breadcrumb, so a
   section cannot exist in one and not the others. */
export const NAV_GROUPS: NavGroup[] = [
  {
    label: "Workspace",
    items: [
      { path: "overview", label: "Overview", icon: LayoutDashboardIcon },
      {
        path: "inbox",
        label: "Inbox",
        icon: InboxIcon,
        permission: "conversations.view",
        badge: "waiting",
        mobile: true,
      },
      { path: "customers", label: "Customers", icon: ContactIcon, permission: "customers.view" },
    ],
  },
  {
    label: "AI",
    items: [
      {
        path: "assistants",
        label: "Assistants",
        icon: BotIcon,
        permission: "agents.view",
        mobile: true,
      },
      {
        path: "knowledge",
        label: "Knowledge",
        icon: BookOpenIcon,
        permission: "knowledge.view",
        badge: "failedKnowledge",
        mobile: true,
      },
      {
        path: "playground",
        label: "Playground",
        icon: FlaskConicalIcon,
        permission: "agents.test",
      },
      { path: "analytics", label: "Analytics", icon: BarChart3Icon, permission: "analytics.view" },
    ],
  },
  {
    label: "Settings",
    items: [
      { path: "integrations", label: "Integrations", icon: PlugIcon, permission: "channels.view" },
      {
        path: "members",
        label: "Members",
        icon: UsersIcon,
        permission: "organization.members.view",
      },
      {
        path: "requests",
        label: "Access requests",
        icon: UserCheckIcon,
        permission: "organization.members.manage",
        badge: "requests",
      },
      { path: "billing", label: "Billing", icon: CreditCardIcon, permission: "billing.view" },
      {
        path: "settings",
        label: "Organization",
        icon: Building2Icon,
        permission: "organization.view",
      },
    ],
  },
];

const LABELS: Record<string, string> = Object.fromEntries(
  NAV_GROUPS.flatMap((group) => group.items.map((item) => [item.path, item.label])),
);

export function sectionLabel(path: string | undefined): string {
  if (path === "account") return "Account";
  return LABELS[path ?? ""] ?? "Overview";
}

/* Section ids from the previous single-route app. Notifications from the API
   and old bookmarks still use them. */
const LEGACY_SECTIONS: Record<string, string> = {
  chat: "playground",
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
