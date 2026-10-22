import { NavLink } from "react-router-dom";
import { MenuIcon } from "lucide-react";

import { useSidebar } from "@/components/ui/sidebar-context.ts";
import { useWorkspace } from "@/features/workspace/workspace.ts";
import { cn } from "@/lib/utils.ts";

import { BADGE_TEXT, NAV_GROUPS } from "./navigation.ts";
import { useNavCounts } from "./useNavCounts.ts";

/** Phones only: the three busiest sections, plus "More" for the full menu. */
export default function MobileTabBar() {
  const { can } = useWorkspace();
  const { setOpenMobile } = useSidebar();
  const counts = useNavCounts();
  const tabs = NAV_GROUPS.flatMap((group) => group.items).filter(
    (item) => item.mobile && (!item.permission || can(item.permission)),
  );

  const tabClass =
    "relative flex h-14 flex-col items-center justify-center gap-0.5 text-xs text-muted-foreground";

  return (
    <nav
      aria-label="Quick navigation"
      className="fixed inset-x-0 bottom-0 z-40 grid border-t bg-background pb-[env(safe-area-inset-bottom)] md:hidden"
      style={{ gridTemplateColumns: `repeat(${tabs.length + 1}, minmax(0, 1fr))` }}
    >
      {tabs.map((tab) => {
        const count = tab.badge ? counts[tab.badge] : 0;
        return (
          <NavLink
            key={tab.path}
            to={`/app/${tab.path}`}
            className={({ isActive }) => cn(tabClass, isActive && "font-medium text-primary")}
          >
            <tab.icon className="size-5" aria-hidden="true" />
            {tab.label}
            {tab.badge && count > 0 && (
              <span className="absolute top-1.5 left-1/2 ml-2 min-w-4 rounded-full bg-primary px-1 text-xs leading-4 font-medium text-primary-foreground tabular-nums">
                {count}
                <span className="sr-only"> {BADGE_TEXT[tab.badge]}</span>
              </span>
            )}
          </NavLink>
        );
      })}
      <button type="button" onClick={() => setOpenMobile(true)} className={tabClass}>
        <MenuIcon className="size-5" aria-hidden="true" />
        More
      </button>
    </nav>
  );
}
