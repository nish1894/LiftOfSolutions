import { useNavigate } from "react-router-dom";
import { CheckIcon, ChevronsUpDownIcon, PlusIcon } from "lucide-react";

import { Avatar } from "@/components/ui/avatar.tsx";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/menu.tsx";
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem } from "@/components/ui/sidebar.tsx";
import { useSidebar } from "@/components/ui/sidebar-context.ts";
import { useAuth } from "@/features/auth/AuthContext.ts";
import { useWorkspace } from "@/features/workspace/workspace.ts";
import { ROLE_LABELS } from "@/shared/permissions.ts";

/** Top of the sidebar: which organization you're in and your role in it. */
export default function OrgSwitcher() {
  const { membership, memberships, selectBusiness } = useWorkspace();
  const { joinRequests } = useAuth();
  const { isMobile, setOpenMobile } = useSidebar();
  const navigate = useNavigate();
  const pending = joinRequests.filter((item) => item.status === "PENDING");

  function go(path: string) {
    setOpenMobile(false);
    navigate(path);
  }

  function switchTo(businessId: string) {
    selectBusiness(businessId);
    // Detail pages belong to the previous organization, so start fresh.
    go("/app/overview");
  }

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton size="lg" className="data-[state=open]:bg-muted">
              <Avatar name={membership.business_name} shape="square" className="rounded-lg" />
              <span className="grid flex-1 text-left leading-tight">
                <span className="truncate text-sm font-semibold">{membership.business_name}</span>
                <span className="truncate text-xs text-muted-foreground">
                  {ROLE_LABELS[membership.role]}
                </span>
              </span>
              <ChevronsUpDownIcon className="ml-auto text-muted-foreground" aria-hidden="true" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="w-(--radix-dropdown-menu-trigger-width) min-w-64"
            align="start"
            side={isMobile ? "bottom" : "right"}
          >
            <DropdownMenuLabel>Organizations</DropdownMenuLabel>
            {memberships.map((item) => (
              <DropdownMenuItem key={item.business_id} onSelect={() => switchTo(item.business_id)}>
                <Avatar name={item.business_name} shape="square" className="size-6 rounded-md" />
                <span className="flex-1 truncate">{item.business_name}</span>
                <span className="text-xs text-muted-foreground">{ROLE_LABELS[item.role]}</span>
                {item.business_id === membership.business_id && (
                  <CheckIcon aria-label="Current organization" />
                )}
              </DropdownMenuItem>
            ))}
            {pending.map((item) => (
              <DropdownMenuItem key={item.id} disabled>
                <span className="flex-1 truncate">{item.organization_name}</span>
                <span className="text-xs">Awaiting approval</span>
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => go("/app/settings")}>
              <PlusIcon />
              Create or join an organization
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
