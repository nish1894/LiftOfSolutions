import { useNavigate } from "react-router-dom";
import { Command } from "cmdk";
import {
  Building2Icon,
  CircleUserIcon,
  MonitorIcon,
  MoonIcon,
  SearchIcon,
  SunIcon,
} from "lucide-react";

import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog.tsx";
import { useWorkspace } from "@/features/workspace/workspace.ts";
import { setTheme } from "@/shared/theme.ts";

import { NAV_GROUPS } from "./navigation.ts";

const groupClass =
  "[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground";
const itemClass =
  "flex h-10 cursor-pointer items-center gap-2 rounded-md px-2 text-sm data-[selected=true]:bg-muted [&_svg]:size-4 [&_svg]:text-muted-foreground";

interface CommandSearchProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** ⌘K: jump to a page, switch organization or change theme. */
export default function CommandSearch({ open, onOpenChange }: CommandSearchProps) {
  const { can, membership, memberships, selectBusiness } = useWorkspace();
  const navigate = useNavigate();

  const pages = NAV_GROUPS.flatMap((group) =>
    group.items
      .filter((item) => !item.permission || can(item.permission))
      .map((item) => ({ ...item, group: group.label })),
  );
  const otherOrganizations = memberships.filter(
    (item) => item.business_id !== membership.business_id,
  );

  function run(action: () => void) {
    onOpenChange(false);
    action();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl gap-0 overflow-hidden p-0" aria-describedby={undefined}>
        <DialogTitle className="sr-only">Search</DialogTitle>
        <Command loop>
          <div className="flex items-center gap-2 border-b px-4 pr-12">
            <SearchIcon className="size-4 text-muted-foreground" aria-hidden="true" />
            <Command.Input
              placeholder="Search pages, organizations…"
              className="h-12 flex-1 bg-transparent text-md outline-none placeholder:text-muted-foreground"
            />
          </div>
          <Command.List className="max-h-80 overflow-y-auto p-2">
            <Command.Empty className="py-6 text-center text-sm text-muted-foreground">
              No results.
            </Command.Empty>
            <Command.Group heading="Pages" className={groupClass}>
              {pages.map((page) => (
                <Command.Item
                  key={page.path}
                  value={`${page.label} ${page.group}`}
                  onSelect={() => run(() => navigate(`/app/${page.path}`))}
                  className={itemClass}
                >
                  <page.icon aria-hidden="true" />
                  {page.label}
                  <span className="ml-auto text-xs text-muted-foreground">{page.group}</span>
                </Command.Item>
              ))}
              <Command.Item
                value="Account settings profile"
                onSelect={() => run(() => navigate("/app/account"))}
                className={itemClass}
              >
                <CircleUserIcon aria-hidden="true" />
                Account settings
              </Command.Item>
            </Command.Group>

            {otherOrganizations.length > 0 && (
              <Command.Group heading="Switch organization" className={groupClass}>
                {otherOrganizations.map((item) => (
                  <Command.Item
                    key={item.business_id}
                    value={`Switch to ${item.business_name}`}
                    onSelect={() =>
                      run(() => {
                        selectBusiness(item.business_id);
                        navigate("/app/overview");
                      })
                    }
                    className={itemClass}
                  >
                    <Building2Icon aria-hidden="true" />
                    {item.business_name}
                  </Command.Item>
                ))}
              </Command.Group>
            )}

            <Command.Group heading="Theme" className={groupClass}>
              <Command.Item
                value="Light theme"
                onSelect={() => run(() => setTheme("light"))}
                className={itemClass}
              >
                <SunIcon aria-hidden="true" />
                Light theme
              </Command.Item>
              <Command.Item
                value="Dark theme"
                onSelect={() => run(() => setTheme("dark"))}
                className={itemClass}
              >
                <MoonIcon aria-hidden="true" />
                Dark theme
              </Command.Item>
              <Command.Item
                value="System theme"
                onSelect={() => run(() => setTheme("system"))}
                className={itemClass}
              >
                <MonitorIcon aria-hidden="true" />
                Match my device
              </Command.Item>
            </Command.Group>
          </Command.List>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
