import { useNavigate } from "react-router-dom";
import { CircleUserIcon, CreditCardIcon, LogOutIcon } from "lucide-react";

import { Avatar } from "@/components/ui/avatar.tsx";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/menu.tsx";
import { useAuth } from "@/features/auth/AuthContext.ts";
import { useWorkspace } from "@/features/workspace/workspace.ts";

/** The avatar at the right of the top bar: who is signed in. */
export default function UserMenu() {
  const { user, signOut } = useAuth();
  const { can } = useWorkspace();
  const navigate = useNavigate();

  if (!user) return null;
  const name = user.display_name || "Your account";

  async function handleSignOut() {
    await signOut();
    navigate("/", { replace: true });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="rounded-full outline-none focus-visible:shadow-(--focus-glow)"
        aria-label="Account menu"
      >
        <Avatar
          name={user.display_name || user.email}
          src={user.photo_url}
          className="size-7 ring-1 ring-border hover:ring-primary"
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent className="min-w-56" align="end">
        <DropdownMenuLabel className="p-0 font-normal tracking-normal normal-case">
          <span className="flex items-center gap-2 px-2 py-1.5 text-left text-sm text-foreground">
            <Avatar name={user.display_name || user.email} src={user.photo_url} />
            <span className="grid flex-1 leading-tight">
              <span className="truncate font-medium">{name}</span>
              <span className="truncate text-xs text-muted-foreground">{user.email}</span>
            </span>
          </span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => navigate("/app/account")}>
          <CircleUserIcon />
          Account
        </DropdownMenuItem>
        {can("billing.view") && (
          <DropdownMenuItem onSelect={() => navigate("/app/billing")}>
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
  );
}
