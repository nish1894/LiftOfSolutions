import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { SearchIcon } from "lucide-react";

import { Separator } from "@/components/ui/separator.tsx";
import { SidebarTrigger } from "@/components/ui/sidebar.tsx";
import { useAuth } from "@/features/auth/AuthContext.ts";
import NotificationBell from "@/features/notifications/NotificationBell.tsx";
import { useWorkspace } from "@/features/workspace/workspace.ts";

import CommandSearch from "./CommandSearch.tsx";
import ModeToggle from "./ModeToggle.tsx";
import { pathForSection, sectionLabel } from "./navigation.ts";

export default function SiteHeader() {
  const { membership, memberships, selectBusiness } = useWorkspace();
  const { refreshAuth } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [searchOpen, setSearchOpen] = useState(false);
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
      <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-2 border-b bg-background px-4 md:rounded-t-xl lg:px-6">
        <SidebarTrigger className="-ml-1" />
        <Separator orientation="vertical" className="mx-1 h-4" />
        <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1.5 text-sm">
          <span className="truncate text-muted-foreground">{membership.business_name}</span>
          <span className="text-muted-foreground" aria-hidden="true">
            /
          </span>
          <span className="truncate font-medium" aria-current="page">
            {label}
          </span>
        </nav>
        <div className="ml-auto flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setSearchOpen(true)}
            className="relative inline-flex h-8 w-8 items-center justify-center gap-2 rounded-md border bg-background text-sm text-muted-foreground shadow-xs hover:bg-muted sm:w-44 sm:justify-start sm:px-3 lg:w-56"
            aria-label="Search (Ctrl or Command + K)"
          >
            <SearchIcon className="size-3.5" aria-hidden="true" />
            <span className="hidden sm:inline">Search…</span>
            <kbd className="pointer-events-none absolute top-1.5 right-1.5 hidden h-5 items-center gap-0.5 rounded border bg-muted px-1.5 font-mono text-xs sm:flex">
              ⌘K
            </kbd>
          </button>
          <NotificationBell onOpenSection={openSection} onChanged={refreshAuth} />
          <ModeToggle />
        </div>
      </header>
      <CommandSearch open={searchOpen} onOpenChange={setSearchOpen} />
    </>
  );
}
