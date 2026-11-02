import { type FormEvent, useState } from "react";
import { ArchiveIcon, ArchiveRestoreIcon, FolderIcon, PencilIcon, UsersIcon } from "lucide-react";
import { toast } from "sonner";

import {
  EmptyState,
  Field,
  LoadError,
  LoadingRows,
  Notice,
  PageContainer,
} from "@/components/app/page.tsx";
import { Pill } from "@/components/app/status-pill.tsx";
import { Avatar } from "@/components/ui/avatar.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Card } from "@/components/ui/card.tsx";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Switch } from "@/components/ui/switch.tsx";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table.tsx";
import { useAuth } from "@/features/auth/AuthContext.ts";
import SettingsHeader from "@/features/settings/SettingsHeader.tsx";
import { NoAccess } from "@/features/shell/NotFound.tsx";
import { useMembers } from "@/features/workspace/resources.ts";
import { useOrgMutation, useOrgQuery, useWorkspace } from "@/features/workspace/workspace.ts";
import { apiRequest } from "@/shared/api/client.ts";
import { ROLE_LABELS } from "@/shared/permissions.ts";
import type { Member } from "@/shared/types.ts";
import { useAction } from "@/shared/useAction.ts";

/** A project as GET /organizations/:id/projects returns it, with the people added to it. */
interface ProjectRow {
  id: string;
  name: string;
  status: "active" | "archived";
  members: { user_id: string }[];
}

// Owners and admins reach every project; Members only the projects they are added to.
const reachesAll = (member: Member) =>
  member.role === "OWNER" || member.role === "ADMIN" || member.role === "PRIME";

/* Settings → Projects: the organization's projects, renaming and archiving them, and choosing which
   Members work in each. Owners and admins only (organization.permissions.manage). */
export default function ProjectsPage() {
  const { can } = useWorkspace();
  const allowed = can("organization.permissions.manage");
  const projects = useOrgQuery<ProjectRow[]>(["projects"], "/projects", [], { enabled: allowed });
  const members = useMembers();

  if (!allowed) return <NoAccess what="project settings" />;
  const list = projects.data ?? [];
  const people = members.data ?? [];

  return (
    <PageContainer>
      <SettingsHeader description="Your organization's projects, and which Members work in each." />
      <Card>
        {projects.isLoading ? (
          <LoadingRows />
        ) : projects.isError ? (
          <LoadError className="m-4" what="projects" query={projects} />
        ) : list.length === 0 ? (
          <EmptyState className="m-4 border-0" icon={FolderIcon} title="No projects yet" />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Project</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Members added</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.map((project) => (
                <TableRow key={project.id}>
                  <TableCell className="font-medium">{project.name}</TableCell>
                  <TableCell>
                    <Pill tone={project.status === "active" ? "success" : "neutral"}>
                      {project.status === "active" ? "Active" : "Archived"}
                    </Pill>
                  </TableCell>
                  <TableCell className="tabular-nums">
                    {
                      people.filter(
                        (person) =>
                          !reachesAll(person) &&
                          project.members.some((m) => m.user_id === person.user_id),
                      ).length
                    }
                  </TableCell>
                  <TableCell className="text-right">
                    <span className="inline-flex items-center gap-1">
                      <AccessDialog project={project} people={people} />
                      <RenameDialog project={project} />
                      <ArchiveButton project={project} />
                    </span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>
    </PageContainer>
  );
}

/** Saves a change to one project, then refreshes the list and the project switcher. */
function useProjectChange() {
  const { invalidate } = useOrgMutation();
  const { refreshAuth } = useAuth();
  return async (projectId: string, path: string, method: "PATCH" | "PUT", body: unknown) => {
    await apiRequest(`/api/v1/projects/${projectId}${path}`, { method, body });
    await Promise.all([invalidate("projects"), refreshAuth()]);
  };
}

function AccessDialog({ project, people }: { project: ProjectRow; people: Member[] }) {
  const { user } = useWorkspace();
  const change = useProjectChange();
  const [busyId, setBusyId] = useState<string | null>(null);

  async function toggle(person: Member, add: boolean) {
    setBusyId(person.user_id);
    try {
      await change(
        project.id,
        "/access",
        "PUT",
        add
          ? { member: { user_id: person.user_id, grants: [], denies: [] } }
          : { remove_user_id: person.user_id },
      );
      toast.success(
        `${person.display_name || person.email} ${add ? "added to" : "removed from"} ${project.name}`,
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Access couldn't be changed.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" aria-label={`Manage access to ${project.name}`}>
          <UsersIcon />
          Access
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Who works in {project.name}</DialogTitle>
          <DialogDescription>
            Owners and admins reach every project. Choose which Members work in this one.
          </DialogDescription>
        </DialogHeader>
        <ul className="grid max-h-96 gap-1 overflow-y-auto">
          {people.map((person) => {
            const name = person.display_name || person.email;
            const added = project.members.some((m) => m.user_id === person.user_id);
            return (
              <li key={person.user_id} className="flex items-center gap-3 rounded-lg px-2 py-2">
                <Avatar name={name} />
                <span className="grid min-w-0 flex-1">
                  <span className="truncate text-sm font-medium">{name}</span>
                  <span className="truncate text-xs text-muted-foreground">
                    {ROLE_LABELS[person.role]}
                  </span>
                </span>
                {reachesAll(person) ? (
                  <span className="text-xs text-muted-foreground">All projects</span>
                ) : person.user_id === user.id ? (
                  <span className="text-xs text-muted-foreground">You</span>
                ) : (
                  <Switch
                    checked={added}
                    disabled={busyId !== null}
                    onCheckedChange={(next) => void toggle(person, next)}
                    aria-label={`${name} works in ${project.name}`}
                  />
                )}
              </li>
            );
          })}
        </ul>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Done</Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RenameDialog({ project }: { project: ProjectRow }) {
  const change = useProjectChange();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(project.name);
  const save = useAction(async () => {
    await change(project.id, "", "PATCH", { name: name.trim() });
    toast.success("Project renamed");
    setOpen(false);
  });

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void save.run();
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setName(project.name);
        else save.clearError();
      }}
    >
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={`Rename ${project.name}`}>
          <PencilIcon />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Rename project</DialogTitle>
        </DialogHeader>
        <form className="grid gap-4" onSubmit={submit}>
          <Field label="Project name" htmlFor={`rename-${project.id}`}>
            <Input
              id={`rename-${project.id}`}
              value={name}
              onChange={(event) => setName(event.target.value)}
              minLength={2}
              maxLength={200}
              required
            />
          </Field>
          {save.error && <Notice tone="error">{save.error}</Notice>}
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" disabled={save.busy}>
              {save.busy ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// Archiving keeps everything but stops the project's agents answering; it can be undone.
function ArchiveButton({ project }: { project: ProjectRow }) {
  const change = useProjectChange();
  const archived = project.status === "archived";
  const [open, setOpen] = useState(false);
  const save = useAction(async () => {
    await change(project.id, "", "PATCH", { status: archived ? "active" : "archived" });
    toast.success(archived ? `${project.name} is active again` : `${project.name} archived`);
    setOpen(false);
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) save.clearError();
      }}
    >
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={`${archived ? "Unarchive" : "Archive"} ${project.name}`}
        >
          {archived ? <ArchiveRestoreIcon /> : <ArchiveIcon />}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {archived ? `Make ${project.name} active again?` : `Archive ${project.name}?`}
          </DialogTitle>
          <DialogDescription>
            {archived
              ? "Its agents can answer customers again."
              : "Its agents stop answering customers. Conversations, contacts and knowledge are kept, and you can undo this."}
          </DialogDescription>
        </DialogHeader>
        {save.error && <Notice tone="error">{save.error}</Notice>}
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Cancel</Button>
          </DialogClose>
          <Button disabled={save.busy} onClick={() => save.run()}>
            {save.busy ? "Saving…" : archived ? "Make active" : "Archive project"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
