import { type FormEvent, Fragment, useState } from "react";
import { Link } from "react-router-dom";
import {
  CheckIcon,
  ClockIcon,
  EllipsisVerticalIcon,
  KeyRoundIcon,
  MailIcon,
  PencilIcon,
  SearchIcon,
  ShieldCheckIcon,
  UserCheckIcon,
  UserMinusIcon,
  UsersIcon,
} from "lucide-react";
import { toast } from "sonner";

import {
  EmptyState,
  Field,
  LoadingRows,
  Notice,
  PageContainer,
  PageHeader,
  Stat,
} from "@/components/app/page.tsx";
import { Pill, StatusPill } from "@/components/app/status-pill.tsx";
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
  SheetContent,
} from "@/components/ui/dialog.tsx";
import { Checkbox, Input, NativeSelect } from "@/components/ui/input.tsx";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/menu.tsx";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table.tsx";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs.tsx";
import { NoAccess } from "@/features/shell/NotFound.tsx";
import { useMembers } from "@/features/workspace/resources.ts";
import { useOrgMutation, useOrgQuery, useWorkspace } from "@/features/workspace/workspace.ts";
import {
  PERMISSION_GROUPS,
  ROLE_DESCRIPTIONS,
  ROLE_LABELS,
  ROLE_PERMISSIONS,
} from "@/shared/permissions.ts";
import { RECORD_STATUS, type Tone } from "@/shared/statuses.ts";
import type { Invitation, JoinRequest, Member, MemberStatus, Role } from "@/shared/types.ts";
import { useAction } from "@/shared/useAction.ts";

const ASSIGNABLE_ROLES: Role[] = ["OWNER", "ADMIN", "AGENT", "VIEWER", "CUSTOM"];

const ROLE_TONE: Record<Role, Tone> = {
  PRIME: "violet",
  OWNER: "violet",
  ADMIN: "info",
  AGENT: "success",
  VIEWER: "neutral",
  CUSTOM: "orange",
};

/* Layout from the ShadcnStore users page (MIT): metric cards, a search and
   filter bar, then the table with badges and row actions. */
export default function MembersPage() {
  const { membership, can } = useWorkspace();
  const canManage = can("organization.members.manage");
  const members = useMembers();
  const invitations = useOrgQuery<Invitation[]>(["invitations"], "/invitations", [], {
    enabled: canManage,
  });
  const requests = useOrgQuery<JoinRequest[]>(["joinRequests"], "/join-requests", [], {
    enabled: canManage,
  });
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [editing, setEditing] = useState<Member | null>(null);
  const [removing, setRemoving] = useState<Member | null>(null);

  if (!can("organization.members.view")) return <NoAccess what="members" />;

  const isPrime = membership.role === "PRIME";
  const list = members.data ?? [];
  const term = search.trim().toLowerCase();
  const rows = list.filter(
    (member) =>
      (!roleFilter || member.role === roleFilter) &&
      (!term || `${member.display_name ?? ""} ${member.email}`.toLowerCase().includes(term)),
  );
  const pendingCount = (requests.data ?? []).filter((item) => item.status === "PENDING").length;
  const managers = list.filter((member) => ["PRIME", "OWNER", "ADMIN"].includes(member.role));

  return (
    <PageContainer>
      <PageHeader
        title="Members"
        description="People in this organization and what they can do."
        actions={canManage && <InviteDialog isPrime={isPrime} />}
      />

      <dl className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Members" value={list.length} icon={UsersIcon} />
        <Stat
          label="Active"
          value={list.filter((member) => member.status === "ACTIVE").length}
          icon={UserCheckIcon}
        />
        <Stat label="Owners & admins" value={managers.length} icon={ShieldCheckIcon} />
        {canManage && (
          <Stat
            label="Waiting for access"
            value={pendingCount}
            icon={ClockIcon}
            hint={
              pendingCount > 0 ? (
                <Link to="/app/requests" className="font-medium text-primary hover:underline">
                  Review requests
                </Link>
              ) : (
                "No pending requests"
              )
            }
          />
        )}
      </dl>

      <Tabs defaultValue="members">
        <TabsList>
          <TabsTrigger value="members">Members</TabsTrigger>
          {canManage && <TabsTrigger value="invitations">Invitations</TabsTrigger>}
          <TabsTrigger value="roles">Roles & permissions</TabsTrigger>
        </TabsList>

        <TabsContent value="members">
          <Card>
            <div className="flex flex-wrap items-center gap-2 border-b p-4">
              <div className="relative w-full sm:max-w-xs">
                <SearchIcon
                  className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
                  aria-hidden="true"
                />
                <label htmlFor="member-search" className="sr-only">
                  Search members
                </label>
                <Input
                  id="member-search"
                  type="search"
                  placeholder="Search by name or email"
                  className="pl-9"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
              </div>
              <label htmlFor="member-role" className="sr-only">
                Filter by role
              </label>
              <NativeSelect
                id="member-role"
                className="w-40"
                value={roleFilter}
                onChange={(event) => setRoleFilter(event.target.value)}
              >
                <option value="">All roles</option>
                {(Object.keys(ROLE_LABELS) as Role[]).map((role) => (
                  <option key={role} value={role}>
                    {ROLE_LABELS[role]}
                  </option>
                ))}
              </NativeSelect>
              <span className="ml-auto text-sm text-muted-foreground tabular-nums">
                {rows.length} of {list.length}
              </span>
            </div>

            {members.isLoading ? (
              <LoadingRows />
            ) : rows.length === 0 ? (
              <EmptyState
                className="m-4 border-0"
                icon={UsersIcon}
                title={list.length ? "No members match" : "No members found"}
              />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Member</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((member) => (
                    <MemberRow
                      key={member.user_id}
                      member={member}
                      isPrime={isPrime}
                      canManage={canManage}
                      onEditPermissions={() => setEditing(member)}
                      onRemove={() => setRemoving(member)}
                    />
                  ))}
                </TableBody>
              </Table>
            )}
          </Card>
        </TabsContent>

        {canManage && (
          <TabsContent value="invitations">
            <InvitationsTable
              invitations={invitations.data ?? []}
              loading={invitations.isLoading}
            />
          </TabsContent>
        )}

        <TabsContent value="roles">
          <RolesMatrix />
        </TabsContent>
      </Tabs>

      {editing && (
        <PermissionsSheet key={editing.user_id} member={editing} onClose={() => setEditing(null)} />
      )}
      {removing && <RemoveMemberDialog member={removing} onClose={() => setRemoving(null)} />}
    </PageContainer>
  );
}

interface MemberRowProps {
  member: Member;
  isPrime: boolean;
  canManage: boolean;
  onEditPermissions: () => void;
  onRemove: () => void;
}

function MemberRow({ member, isPrime, canManage, onEditPermissions, onRemove }: MemberRowProps) {
  const { can } = useWorkspace();
  // The Prime user can't be changed, and only Prime can change an Owner.
  const immutable = member.role === "PRIME" || (!isPrime && member.role === "OWNER");
  const editable = canManage && !immutable;
  const name = member.display_name || member.email;

  return (
    <TableRow>
      <TableCell>
        <span className="flex items-center gap-3">
          <Avatar name={name} />
          <span className="grid min-w-0">
            <span className="truncate font-medium">{name}</span>
            <span className="truncate text-sm text-muted-foreground">{member.email}</span>
          </span>
        </span>
      </TableCell>
      <TableCell>
        <Pill tone={ROLE_TONE[member.role]}>{ROLE_LABELS[member.role]}</Pill>
      </TableCell>
      <TableCell>
        <StatusPill map={RECORD_STATUS} value={member.status} />
      </TableCell>
      <TableCell className="text-right">
        {editable && (
          <span className="inline-flex items-center gap-1">
            <EditAccessDialog member={member} isPrime={isPrime} />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon-sm" aria-label={`More actions for ${name}`}>
                  <EllipsisVerticalIcon />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  disabled={member.role !== "CUSTOM" || !can("organization.permissions.manage")}
                  onSelect={onEditPermissions}
                >
                  <KeyRoundIcon />
                  Edit custom permissions
                </DropdownMenuItem>
                <DropdownMenuItem className="text-danger" onSelect={onRemove}>
                  <UserMinusIcon />
                  Remove from organization
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </span>
        )}
      </TableCell>
    </TableRow>
  );
}

function EditAccessDialog({ member, isPrime }: { member: Member; isPrime: boolean }) {
  const { request, invalidate } = useOrgMutation();
  const [open, setOpen] = useState(false);
  const [role, setRole] = useState<Role>(member.role);
  const [status, setStatus] = useState<MemberStatus>(member.status);
  const roles = ASSIGNABLE_ROLES.filter((item) => isPrime || item !== "OWNER");
  const name = member.display_name || member.email;

  const save = useAction(async () => {
    await request(`/members/${member.user_id}`, { method: "PATCH", body: { role, status } });
    await invalidate("members");
    toast.success(`Updated ${name}`);
    setOpen(false);
  });

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void save.run();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={`Edit access for ${name}`}>
          <PencilIcon />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit access</DialogTitle>
          <DialogDescription>{name}</DialogDescription>
        </DialogHeader>
        <form className="grid gap-4" onSubmit={submit}>
          <Field label="Role" htmlFor={`role-${member.user_id}`} hint={ROLE_DESCRIPTIONS[role]}>
            <NativeSelect
              id={`role-${member.user_id}`}
              value={role}
              onChange={(event) => setRole(event.target.value as Role)}
            >
              {roles.map((item) => (
                <option key={item} value={item}>
                  {ROLE_LABELS[item]}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field
            label="Status"
            htmlFor={`status-${member.user_id}`}
            hint="Disabled members keep their account but can't open this organization."
          >
            <NativeSelect
              id={`status-${member.user_id}`}
              value={status}
              onChange={(event) => setStatus(event.target.value as MemberStatus)}
            >
              <option value="ACTIVE">Active</option>
              <option value="DISABLED">Disabled</option>
            </NativeSelect>
          </Field>
          {save.error && <Notice tone="error">{save.error}</Notice>}
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" disabled={save.busy}>
              {save.busy ? "Saving…" : "Save access"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function PermissionsSheet({ member, onClose }: { member: Member; onClose: () => void }) {
  const { request, invalidate } = useOrgMutation();
  const [selected, setSelected] = useState<string[]>(member.permissions ?? []);

  const save = useAction(async () => {
    await request(`/members/${member.user_id}/permissions`, {
      method: "PUT",
      body: { permissions: selected, denied_permissions: [] },
    });
    await invalidate("members");
    toast.success("Permissions saved");
    onClose();
  });

  function toggle(permission: string, checked: boolean) {
    setSelected((current) =>
      checked ? [...current, permission] : current.filter((item) => item !== permission),
    );
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-[min(28rem,100%)]" aria-describedby={undefined}>
        <div className="grid gap-1 border-b p-5 pr-12">
          <DialogTitle>Custom permissions</DialogTitle>
          <p className="text-sm text-muted-foreground">{member.display_name || member.email}</p>
        </div>
        <div className="grid flex-1 content-start gap-5 overflow-y-auto p-5">
          {PERMISSION_GROUPS.map((group) => (
            <fieldset key={group.label} className="grid gap-2">
              <legend className="mb-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                {group.label}
              </legend>
              {group.permissions.map((permission) => (
                <label key={permission.key} className="flex items-start gap-2 text-sm">
                  <Checkbox
                    className="mt-0.5"
                    checked={selected.includes(permission.key)}
                    onChange={(event) => toggle(permission.key, event.target.checked)}
                  />
                  <span>
                    {permission.label}
                    <code className="block font-mono text-xs text-muted-foreground">
                      {permission.key}
                    </code>
                  </span>
                </label>
              ))}
            </fieldset>
          ))}
        </div>
        <div className="grid gap-2 border-t p-4">
          {save.error && <Notice tone="error">{save.error}</Notice>}
          <Button onClick={() => save.run()} disabled={save.busy}>
            {save.busy ? "Saving…" : `Save ${selected.length} permissions`}
          </Button>
        </div>
      </SheetContent>
    </Dialog>
  );
}

function RemoveMemberDialog({ member, onClose }: { member: Member; onClose: () => void }) {
  const { membership } = useWorkspace();
  const { request, invalidate } = useOrgMutation();
  const name = member.display_name || member.email;
  const remove = useAction(async () => {
    await request(`/members/${member.user_id}`, { method: "DELETE" });
    await invalidate("members");
    toast.success(`${name} was removed`);
    onClose();
  });

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Remove {name}?</DialogTitle>
          <DialogDescription>
            They lose access to {membership.business_name} immediately. You can invite them again
            later.
          </DialogDescription>
        </DialogHeader>
        {remove.error && <Notice tone="error">{remove.error}</Notice>}
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Cancel</Button>
          </DialogClose>
          <Button variant="destructive" disabled={remove.busy} onClick={() => remove.run()}>
            {remove.busy ? "Removing…" : "Remove member"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function InviteDialog({ isPrime }: { isPrime: boolean }) {
  const { request, invalidate } = useOrgMutation();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("AGENT");
  const roles: Role[] = isPrime ? ["AGENT", "ADMIN", "OWNER"] : ["AGENT", "ADMIN"];

  const invite = useAction(async () => {
    await request("/invitations", { method: "POST", body: { email: email.trim(), role } });
    await invalidate("invitations");
    toast.success(`Invitation sent to ${email.trim()}`);
    setEmail("");
    setOpen(false);
  });

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void invite.run();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <MailIcon />
          Invite member
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Invite a member</DialogTitle>
          <DialogDescription>They join with this role once they accept.</DialogDescription>
        </DialogHeader>
        <form className="grid gap-4" onSubmit={submit}>
          <Field label="Email" htmlFor="invite-email">
            <Input
              id="invite-email"
              type="email"
              required
              placeholder="teammate@company.com"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </Field>
          <Field label="Role" htmlFor="invite-role" hint={ROLE_DESCRIPTIONS[role]}>
            <NativeSelect
              id="invite-role"
              value={role}
              onChange={(event) => setRole(event.target.value as Role)}
            >
              {roles.map((item) => (
                <option key={item} value={item}>
                  {ROLE_LABELS[item]}
                </option>
              ))}
            </NativeSelect>
          </Field>
          {invite.error && <Notice tone="error">{invite.error}</Notice>}
          <DialogFooter>
            <Button type="submit" disabled={invite.busy}>
              {invite.busy ? "Sending…" : "Send invitation"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function InvitationsTable({
  invitations,
  loading,
}: {
  invitations: Invitation[];
  loading: boolean;
}) {
  return (
    <Card>
      {loading ? (
        <LoadingRows />
      ) : invitations.length === 0 ? (
        <EmptyState className="m-4 border-0" icon={MailIcon} title="No invitations sent" />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Email</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {invitations.map((invitation) => (
              <TableRow key={invitation.id}>
                <TableCell className="font-medium">{invitation.email}</TableCell>
                <TableCell>
                  <Pill tone={ROLE_TONE[invitation.role] ?? "neutral"}>
                    {ROLE_LABELS[invitation.role] ?? invitation.role}
                  </Pill>
                </TableCell>
                <TableCell>
                  <StatusPill map={RECORD_STATUS} value={invitation.status} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </Card>
  );
}

const MATRIX_ROLES = ["OWNER", "ADMIN", "AGENT", "VIEWER"] as const;

/** Read-only: roles are defined by the platform. Custom covers exceptions. */
function RolesMatrix() {
  return (
    <div className="grid gap-4">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {[...MATRIX_ROLES, "CUSTOM" as const].map((role) => (
          <div key={role} className="grid gap-2 rounded-xl border bg-card p-5 shadow-xs">
            <Pill tone={ROLE_TONE[role]}>{ROLE_LABELS[role]}</Pill>
            <p className="text-sm text-muted-foreground">{ROLE_DESCRIPTIONS[role]}</p>
          </div>
        ))}
      </div>
      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Permission</TableHead>
              {MATRIX_ROLES.map((role) => (
                <TableHead key={role} className="text-center">
                  {ROLE_LABELS[role]}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {PERMISSION_GROUPS.map((group) => (
              <Fragment key={group.label}>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <TableCell colSpan={5} className="text-xs font-medium text-muted-foreground">
                    {group.label}
                  </TableCell>
                </TableRow>
                {group.permissions.map((permission) => (
                  <TableRow key={permission.key}>
                    <TableCell>
                      <span className="block">{permission.label}</span>
                      <code className="font-mono text-xs text-muted-foreground">
                        {permission.key}
                      </code>
                    </TableCell>
                    {MATRIX_ROLES.map((role) => (
                      <TableCell key={role} className="text-center">
                        {ROLE_PERMISSIONS[role].includes(permission.key) ? (
                          <>
                            <CheckIcon className="mx-auto size-4 text-success" aria-hidden="true" />
                            <span className="sr-only">Included</span>
                          </>
                        ) : (
                          <>
                            <span className="text-muted-foreground" aria-hidden="true">
                              –
                            </span>
                            <span className="sr-only">Not included</span>
                          </>
                        )}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </Fragment>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
