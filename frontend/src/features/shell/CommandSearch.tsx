import { useNavigate } from "react-router-dom";
import { Command } from "cmdk";
import {
  Building2Icon,
  FolderIcon,
  MonitorIcon,
  MoonIcon,
  PlusIcon,
  SearchIcon,
  SettingsIcon,
  SunIcon,
} from "lucide-react";

import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog.tsx";
import { useReturnFocus } from "@/hooks/use-return-focus.ts";
import { useWorkspace } from "@/features/workspace/workspace.ts";
import { setTheme } from "@/shared/theme.ts";

import { NAV_ITEMS, SETTINGS_SECTIONS } from "./navigation.ts";

const groupClass =
  "[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:label-caps";
const itemClass =
  "flex h-10 cursor-pointer items-center gap-2 rounded-md px-2 text-sm data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground [&_svg]:size-4 [&_svg]:text-muted-foreground";

interface CommandSearchProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onNewProject: () => void;
}

/** ⌘K: jump to a page, switch project or organization, start a project, or change theme. */
export default function CommandSearch({ open, onOpenChange, onNewProject }: CommandSearchProps) {
  const { can, membership, memberships, projects, projectId, selectBusiness, selectProject } =
    useWorkspace();
  const navigate = useNavigate();

  const allowed = (item: { permission?: Parameters<typeof can>[0] }) =>
    !item.permission || can(item.permission);
  const pages = NAV_ITEMS.filter((item) => item.path !== "settings" && allowed(item));
  const settings = SETTINGS_SECTIONS.filter(allowed);
  const otherOrganizations = memberships.filter(
    (item) => item.business_id !== membership.business_id,
  );

  const returnFocus = useReturnFocus();

  function run(action: () => void) {
    onOpenChange(false);
    action();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-xl gap-0 overflow-hidden p-0"
        aria-describedby={undefined}
        {...returnFocus}
      >
        <DialogTitle className="sr-only">Search</DialogTitle>
        {/* label names the search input for screen readers. */}
        <Command loop label="Search pages, projects and organizations">
          <div className="flex items-center gap-2 border-b px-4 pr-12">
            <SearchIcon className="size-4 text-muted-foreground" aria-hidden="true" />
            <Command.Input
              placeholder="Search pages, projects, organizations…"
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
                  value={page.label}
                  onSelect={() => run(() => navigate(`/app/${page.path}`))}
                  className={itemClass}
                >
                  <page.icon aria-hidden="true" />
                  {page.label}
                </Command.Item>
              ))}
              {settings.map((section) => (
                <Command.Item
                  key={section.path}
                  value={`Settings ${section.label}`}
                  onSelect={() => run(() => navigate(`/app/${section.path}`))}
                  className={itemClass}
                >
                  <SettingsIcon aria-hidden="true" />
                  {section.label}
                  <span className="ml-auto text-xs text-muted-foreground">Settings</span>
                </Command.Item>
              ))}
            </Command.Group>

            <Command.Group heading="Projects" className={groupClass}>
              {projects.map((project) => (
                <Command.Item
                  key={project.id}
                  value={`Project ${project.name}`}
                  onSelect={() =>
                    run(() => {
                      selectProject(project.id);
                      navigate("/app/overview");
                    })
                  }
                  className={itemClass}
                >
                  <FolderIcon aria-hidden="true" />
                  {project.name}
                  {project.id === projectId && (
                    <span className="ml-auto text-xs text-muted-foreground">Current</span>
                  )}
                </Command.Item>
              ))}
              {can("projects.create") && (
                <Command.Item
                  value="New project"
                  onSelect={() => run(onNewProject)}
                  className={itemClass}
                >
                  <PlusIcon aria-hidden="true" />
                  New project
                </Command.Item>
              )}
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
