import type { ReactNode } from "react";
import { NavLink } from "react-router-dom";

import { PageHeader } from "@/components/app/page.tsx";
import { SETTINGS_LINK, SETTINGS_LINKS } from "@/components/app/settings-tabs.ts";
import { SETTINGS_SECTIONS } from "@/features/shell/navigation.ts";
import { useWorkspace } from "@/features/workspace/workspace.ts";

/* "Settings" title plus the design's underline tabs. Each tab is its own route
   (General, Team, Billing, Account), so links and the back button work. */
export default function SettingsHeader({
  description,
  actions,
}: {
  description?: ReactNode;
  actions?: ReactNode;
}) {
  const { can, membership } = useWorkspace();
  const sections = SETTINGS_SECTIONS.filter((item) => !item.permission || can(item.permission));

  return (
    <>
      <PageHeader
        eyebrow={membership.business_name}
        title="Settings"
        description={description}
        actions={actions}
      />
      <nav aria-label="Settings sections" className={SETTINGS_LINKS}>
        {sections.map((section) => (
          <NavLink key={section.path} to={`/app/${section.path}`} className={SETTINGS_LINK} end>
            {section.label}
          </NavLink>
        ))}
      </nav>
    </>
  );
}
