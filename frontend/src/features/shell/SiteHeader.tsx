import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { MenuIcon, SearchIcon } from "lucide-react";

import { Button } from "@/components/ui/button.tsx";
import { Kbd } from "@/components/ui/input.tsx";
import { useAuth } from "@/features/auth/AuthContext.ts";
import NotificationBell from "@/features/notifications/NotificationBell.tsx";
import CreateProjectDialog from "@/features/workspace/CreateProjectDialog.tsx";
import { useWorkspace } from "@/features/workspace/workspace.ts";
import BrandMark from "@/shared/ui/BrandMark.tsx";

import CommandSearch from "./CommandSearch.tsx";
import ModeToggle from "./ModeToggle.tsx";
import { pathForSection, sectionLabel } from "./navigation.ts";
import OrgSwitcher from "./OrgSwitcher.tsx";
import UserMenu from "./UserMenu.tsx";
import { badgeLabel, useNavCounts } from "./useNavCounts.ts";

/* Top bar from the design: brand, tenant pill, search, the amber escalations
   chip (conversations waiting for a person), notifications and the account. */
export default function SiteHeader({ onOpenMenu }: { onOpenMenu: () => void }) {
  const { can, membership, memberships, selectBusiness } = useWorkspace();
  const { refreshAuth } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [searchOpen, setSearchOpen] = useState(false);
  const [newProjectOpen, setNewProjectOpen] = useState(false);
  const counts = useNavCounts();
  const label = sectionLabel(pathname.split("/")[2]);

  // Browser tabs name the organization too, so two orgs in two tabs differ.
  useEffect(() => {
    document.title = `${label} · ${membership.business_name}`;
  }, [label, membership.business_name]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "k" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        setSearchOpen((open) => !open);
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  /* A notification can point at another organization, so switch first. */
  function openSection(section: string, organizationId: string | null) {
    if (organizationId && memberships.some((item) => item.business_id === organizationId)) {
      selectBusiness(organizationId);
    }
    navigate(`/app/${pathForSection(section)}`);
  }

  return (
    <>
      <header className="sticky top-0 z-40 flex h-14 shrink-0 items-center gap-2 border-b bg-card px-3 sm:gap-3 sm:px-4 lg:px-6">
        <Button
          variant="ghost"
          size="icon-sm"
          className="-ml-1 shrink-0 md:hidden"
          onClick={onOpenMenu}
          aria-label="Open menu"
        >
          <MenuIcon />
        </Button>
        <Link
          to="/app/overview"
          className="flex shrink-0 items-center gap-2"
          aria-label="LiftOffSol overview"
        >
          <BrandMark size={28} />
          <span className="hidden text-sm font-medium sm:inline">LiftOffSol</span>
        </Link>
        <OrgSwitcher onNewProject={() => setNewProjectOpen(true)} />

        <button
          type="button"
          onClick={() => setSearchOpen(true)}
          className="mx-auto hidden h-8 w-full max-w-sm items-center gap-2 rounded-md border bg-background px-3 text-sm text-muted-foreground transition-colors hover:text-foreground md:flex"
          aria-label="Search (Ctrl or Command + K)"
        >
          <SearchIcon className="size-4" aria-hidden="true" />
          <span className="flex-1 text-left">Search pages, projects…</span>
          <Kbd className="bg-card">⌘K</Kbd>
        </button>

        <div className="ml-auto flex shrink-0 items-center gap-1 sm:gap-2 md:ml-0">
          <Button
            variant="ghost"
            size="icon-sm"
            className="md:hidden"
            onClick={() => setSearchOpen(true)}
            aria-label="Search"
          >
            <SearchIcon />
          </Button>
          {can("conversations.view") && counts.waiting > 0 && (
            <Link
              to="/app/inbox"
              aria-label={`${badgeLabel("waiting", counts.waiting)} waiting for a teammate`}
              className="inline-flex h-7 items-center gap-1.5 rounded-md border border-warning-border bg-warning-bg px-2.5 text-xs font-medium text-warning transition-colors hover:bg-warning-border"
            >
              <span className="size-1.5 rounded-full bg-warning-solid" aria-hidden="true" />
              {badgeLabel("waiting", counts.waiting)}
              <span className="hidden sm:inline">
                {counts.waiting === 1 ? "Escalation" : "Escalations"}
              </span>
            </Link>
          )}
          <div className="flex items-center gap-0.5">
            <NotificationBell onOpenSection={openSection} onChanged={refreshAuth} />
            <span className="hidden sm:contents">
              <ModeToggle />
            </span>
          </div>
          <span className="mx-0.5 h-4 w-px bg-border" aria-hidden="true" />
          <UserMenu />
        </div>
      </header>
      <CommandSearch
        open={searchOpen}
        onOpenChange={setSearchOpen}
        onNewProject={() => setNewProjectOpen(true)}
      />
      <CreateProjectDialog open={newProjectOpen} onOpenChange={setNewProjectOpen} />
    </>
  );
}
