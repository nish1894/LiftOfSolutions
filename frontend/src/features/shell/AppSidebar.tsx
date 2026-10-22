import { Link, useLocation } from "react-router-dom";

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar.tsx";
import { useSidebar } from "@/components/ui/sidebar-context.ts";
import { useWorkspace } from "@/features/workspace/workspace.ts";
import { cn } from "@/lib/utils.ts";

import { BADGE_TEXT, BADGE_TONE, NAV_GROUPS } from "./navigation.ts";
import OrgSwitcher from "./OrgSwitcher.tsx";
import UserMenu from "./UserMenu.tsx";
import { useNavCounts } from "./useNavCounts.ts";

/* Layout from the ShadcnStore template: organization on top, grouped
   navigation, signed-in user at the bottom — so "which tenant" and "who am I"
   are never in the same place. */
export default function AppSidebar() {
  const { can } = useWorkspace();
  const counts = useNavCounts();
  const { pathname } = useLocation();
  const { setOpenMobile } = useSidebar();

  return (
    <Sidebar variant="inset" collapsible="icon">
      <SidebarHeader>
        <OrgSwitcher />
      </SidebarHeader>

      <SidebarContent>
        {NAV_GROUPS.map((group) => {
          const items = group.items.filter((item) => !item.permission || can(item.permission));
          if (!items.length) return null;
          return (
            <SidebarGroup key={group.label}>
              <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
              <SidebarMenu>
                {items.map((item) => {
                  const to = `/app/${item.path}`;
                  const active = pathname === to || pathname.startsWith(`${to}/`);
                  const count = item.badge ? counts[item.badge] : 0;
                  return (
                    <SidebarMenuItem key={item.path}>
                      <SidebarMenuButton
                        asChild
                        isActive={active}
                        tooltip={item.label}
                        className={cn(count > 0 && "pr-8")}
                      >
                        <Link
                          to={to}
                          aria-current={active ? "page" : undefined}
                          onClick={() => setOpenMobile(false)}
                        >
                          <item.icon aria-hidden="true" />
                          <span>{item.label}</span>
                        </Link>
                      </SidebarMenuButton>
                      {item.badge && count > 0 && (
                        <SidebarMenuBadge className={BADGE_TONE[item.badge]}>
                          {count}
                          <span className="sr-only"> {BADGE_TEXT[item.badge]}</span>
                        </SidebarMenuBadge>
                      )}
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroup>
          );
        })}
      </SidebarContent>

      <SidebarFooter>
        <UserMenu />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
