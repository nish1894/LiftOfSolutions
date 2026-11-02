import { Link, useLocation } from "react-router-dom";

import { useWorkspace } from "@/features/workspace/workspace.ts";
import { cn } from "@/lib/utils.ts";
import { ROLE_LABELS } from "@/shared/permissions.ts";

import { BADGE_TEXT, BADGE_TONE, NAV_ITEMS, navPathFor } from "./navigation.ts";
import { badgeLabel, useNavCounts } from "./useNavCounts.ts";

/* Sidebar from the design: the current project on top, one flat list of
   sections with waiting-work counts, and who you are at the bottom. */
export default function AppSidebar({ onNavigate }: { onNavigate?: () => void }) {
  const { can, membership, projects, projectId, user } = useWorkspace();
  const counts = useNavCounts();
  const { pathname } = useLocation();
  const activePath = navPathFor(pathname.split("/")[2]);
  const project = projects.find((item) => item.id === projectId);
  const items = NAV_ITEMS.filter((item) => !item.permission || can(item.permission));

  return (
    <div className="flex w-full flex-col justify-between gap-6 p-3">
      <div className="flex flex-col gap-6">
        <div className="flex items-center justify-between gap-3 border-b px-3 py-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">
              {project?.name ?? membership.business_name}
            </p>
            <p className="truncate text-2xs text-muted-foreground">
              {ROLE_LABELS[membership.role]}
            </p>
          </div>
          <span className="size-2 shrink-0 rounded-full bg-success-solid" aria-hidden="true" />
        </div>

        <nav aria-label="Workspace" className="flex flex-col gap-0.5">
          <p className="label-caps px-3 pb-1">Workspace</p>
          {items.map((item) => {
            const active = item.path === activePath;
            const count = item.badge ? counts[item.badge] : 0;
            return (
              <Link
                key={item.path}
                to={`/app/${item.path}`}
                aria-current={active ? "page" : undefined}
                onClick={onNavigate}
                className={cn(
                  "flex h-9 items-center gap-3 rounded-md px-3 text-sm font-medium transition-colors",
                  active
                    ? "bg-sidebar-accent text-sidebar-accent-foreground ring-1 ring-inset ring-border"
                    : "text-sidebar-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                <item.icon
                  className={cn("size-4", active ? "text-primary" : "text-muted-foreground")}
                  aria-hidden="true"
                />
                <span className="flex-1">{item.label}</span>
                {item.badge && count > 0 && (
                  <span
                    className={cn(
                      "rounded-full px-1.5 text-2xs font-semibold tabular-nums",
                      BADGE_TONE[item.badge],
                    )}
                  >
                    {badgeLabel(item.badge, count)}
                    <span className="sr-only"> {BADGE_TEXT[item.badge]}</span>
                  </span>
                )}
              </Link>
            );
          })}
        </nav>
      </div>

      <div className="flex items-center gap-1.5 border-t px-2.5 pt-3 text-2xs text-muted-foreground">
        <span className="size-1.5 rounded-full bg-success-solid" aria-hidden="true" />
        <span className="truncate">Signed in as {user.email}</span>
      </div>
    </div>
  );
}
