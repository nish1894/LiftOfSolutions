import { useNavigate } from "react-router-dom";
import { CircleUserIcon, CreditCardIcon, EllipsisVerticalIcon, LogOutIcon } from "lucide-react";

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

/** Bottom of the sidebar: who is signed in (the template's NavUser). */
export default function UserMenu() {
  const { user, signOut } = useAuth();
  const { can } = useWorkspace();
  const { isMobile, setOpenMobile } = useSidebar();
  const navigate = useNavigate();

  if (!user) return null;
  const name = user.display_name || "Your account";

  function go(path: string) {
    setOpenMobile(false);
    navigate(path);
  }

  async function handleSignOut() {
    await signOut();
    navigate("/", { replace: true });
  }

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton size="lg" className="data-[state=open]:bg-muted">
              <Avatar
                name={user.display_name || user.email}
                src={user.photo_url}
                className="rounded-lg"
              />
              <span className="grid flex-1 text-left leading-tight">
                <span className="truncate text-sm font-medium">{name}</span>
                <span className="truncate text-xs text-muted-foreground">{user.email}</span>
              </span>
              <EllipsisVerticalIcon className="ml-auto text-muted-foreground" aria-hidden="true" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="w-(--radix-dropdown-menu-trigger-width) min-w-56"
            side={isMobile ? "bottom" : "right"}
            align="end"
          >
            <DropdownMenuLabel className="p-0 font-normal text-foreground">
              <span className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
                <Avatar
                  name={user.display_name || user.email}
                  src={user.photo_url}
                  className="rounded-lg"
                />
                <span className="grid flex-1 leading-tight">
                  <span className="truncate font-medium">{name}</span>
                  <span className="truncate text-xs text-muted-foreground">{user.email}</span>
                </span>
              </span>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => go("/app/account")}>
              <CircleUserIcon />
              Account
            </DropdownMenuItem>
            {can("billing.view") && (
              <DropdownMenuItem onSelect={() => go("/app/billing")}>
                <CreditCardIcon />
                Billing
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={handleSignOut}>
              <LogOutIcon />
              Log out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
