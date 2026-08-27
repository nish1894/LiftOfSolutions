/* The navigation model, shared by the router and the sidebar so a section
   cannot exist in one and not the other. `manageOnly` sections are hidden from
   members without organization.members.manage. */
export interface Section {
  id: string;
  label: string;
  /** Key into the NavIcon glyph set. */
  icon: string;
  /** Sidebar grouping. Eleven flat links is a wall; four groups is a menu. */
  group: SectionGroup;
  /** Hidden from members without organization.members.manage. */
  manageOnly?: boolean;
}

export type SectionGroup = "Workspace" | "Operations" | "Manage" | "Account";

export const SECTION_GROUPS: SectionGroup[] = ["Workspace", "Operations", "Manage", "Account"];

export const SECTIONS: Section[] = [
  { id: "overview", label: "Overview", icon: "overview", group: "Workspace" },
  { id: "chat", label: "Chat playground", icon: "chat", group: "Workspace" },
  { id: "assistants", label: "Assistants", icon: "assistants", group: "Workspace" },
  { id: "knowledge", label: "Knowledge", icon: "knowledge", group: "Workspace" },
  { id: "customers", label: "Customers", icon: "customers", group: "Operations" },
  { id: "conversations", label: "Conversations", icon: "conversations", group: "Operations" },
  { id: "channels", label: "Channels", icon: "channels", group: "Operations" },
  {
    id: "approvals",
    label: "Requests",
    icon: "approvals",
    group: "Manage",
    manageOnly: true,
  },
  { id: "team", label: "Team", icon: "team", group: "Manage" },
  { id: "organization", label: "Organization", icon: "organization", group: "Manage" },
  { id: "profile", label: "Profile & settings", icon: "profile", group: "Account" },
];

export const SECTION_IDS = SECTIONS.map((section) => section.id);

export const isSection = (value: string | undefined): boolean =>
  value !== undefined && SECTION_IDS.includes(value);
