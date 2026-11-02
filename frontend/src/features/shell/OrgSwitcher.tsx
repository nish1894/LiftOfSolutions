import { useNavigate } from "react-router-dom";
import { CheckIcon, ChevronsUpDownIcon, PlusIcon, SettingsIcon } from "lucide-react";

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
import { cn } from "@/lib/utils.ts";
import { ROLE_LABELS } from "@/shared/permissions.ts";

/** The tenant pill in the top bar: "Organization / Project", and the switcher for both. */
export default function OrgSwitcher({ onNewProject }: { onNewProject: () => void }) {
  const { can, membership, memberships, projects, projectId, selectBusiness, selectProject } =
    useWorkspace();
  const { joinRequests } = useAuth();
  const navigate = useNavigate();
  const pending = joinRequests.filter((item) => item.status === "PENDING");
  const project = projects.find((item) => item.id === projectId);

  function switchTo(businessId: string) {
    selectBusiness(businessId);
    // Detail pages belong to the previous organization, so start fresh.
    navigate("/app/overview");
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="flex h-8 min-w-0 items-center gap-2 rounded-md border bg-card px-2 text-xs font-medium outline-none hover:border-input focus-visible:shadow-(--focus-glow) data-[state=open]:border-input"
        aria-label={`Organization ${membership.business_name}, project ${project?.name ?? "none"}. Switch`}
      >
        <span className="size-1.5 shrink-0 rounded-full bg-success-solid" aria-hidden="true" />
        <span className={cn("max-w-32 truncate font-medium", project && "hidden sm:inline")}>
          {membership.business_name}
        </span>
        {project && (
          <>
            <span className="hidden text-muted-foreground sm:inline" aria-hidden="true">
              /
            </span>
            <span className="max-w-32 truncate text-subtle-foreground">{project.name}</span>
          </>
        )}
        <ChevronsUpDownIcon
          className="size-3.5 shrink-0 text-muted-foreground"
          aria-hidden="true"
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent className="min-w-64" align="start">
        <DropdownMenuLabel>Organizations</DropdownMenuLabel>
        {memberships.map((item) => (
          <DropdownMenuItem key={item.business_id} onSelect={() => switchTo(item.business_id)}>
            <Avatar name={item.business_name} shape="square" className="size-6" />
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
        <DropdownMenuLabel>Projects</DropdownMenuLabel>
        {projects.map((item) => (
          <DropdownMenuItem
            key={item.id}
            onSelect={() => {
              selectProject(item.id);
              navigate("/app/overview");
            }}
          >
            <span className="flex-1 truncate">{item.name}</span>
            {item.id === projectId && <CheckIcon aria-label="Current project" />}
          </DropdownMenuItem>
        ))}
        {can("projects.create") && (
          <DropdownMenuItem onSelect={onNewProject}>
            <PlusIcon />
            New project
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => navigate("/app/settings")}>
          <SettingsIcon />
          Organization settings
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
