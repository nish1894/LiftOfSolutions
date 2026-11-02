import { type FormEvent, useState } from "react";
import {
  ClockIcon,
  CopyIcon,
  EllipsisVerticalIcon,
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
  LoadError,
  LoadingRows,
  Notice,
  PageContainer,
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
} from "@/components/ui/dialog.tsx";
import { Input, NativeSelect } from "@/components/ui/input.tsx";
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
import { useTabParam } from "@/components/app/settings-tabs.ts";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs.tsx";
import SettingsHeader from "@/features/settings/SettingsHeader.tsx";
import { NoAccess } from "@/features/shell/NotFound.tsx";
import { useMembers } from "@/features/workspace/resources.ts";
import { useOrgMutation, useOrgQuery, useWorkspace } from "@/features/workspace/workspace.ts";
import { copyText } from "@/shared/clipboard.ts";
import { ROLE_DESCRIPTIONS, ROLE_LABELS } from "@/shared/permissions.ts";
import { RECORD_STATUS, type Tone } from "@/shared/statuses.ts";
import type { Invitation, Member, Role } from "@/shared/types.ts";
import { useAction } from "@/shared/useAction.ts";

const ASSIGNABLE_ROLES: Role[] = ["OWNER", "ADMIN", "AGENT"];
const MEMBER_TABS = ["members", "invitations"] as const;

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
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [removing, setRemoving] = useState<Member | null>(null);
  const [tab, setTab] = useTabParam(canManage ? MEMBER_TABS : MEMBER_TABS.slice(0, 1));

  if (!can("organization.members.view")) return <NoAccess what="members" />;

  const isPrime = membership.role === "OWNER";
  const list = members.data ?? [];
  const term = search.trim().toLowerCase();
  const rows = list.filter(
    (member) =>
      (!roleFilter || member.role === roleFilter) &&
      (!term || `${member.display_name ?? ""} ${member.email}`.toLowerCase().includes(term)),
  );
  const pendingCount = (invitations.data ?? []).filter((item) => item.status === "PENDING").length;
  const managers = list.filter((member) => ["PRIME", "OWNER", "ADMIN"].includes(member.role));

  return (
    <PageContainer>
      <SettingsHeader
        description="People in this organization and what they can do."
        actions={canManage && <InviteDialog isPrime={isPrime} />}
      />

      {/* On phones the counts follow the list, so people and search come first. */}
      <div className="flex flex-col">
        {!members.isError && (
          <dl className="order-last mt-6 grid gap-4 sm:order-none sm:mt-0 sm:mb-6 sm:grid-cols-2 xl:grid-cols-4">
            <Stat label="Members" value={list.length} icon={UsersIcon} />
            <Stat
              label="Active"
              value={list.filter((member) => member.status === "ACTIVE").length}
              icon={UserCheckIcon}
            />
            <Stat label="Owners & admins" value={managers.length} icon={ShieldCheckIcon} />
            {canManage && !invitations.isError && (
              <Stat
                label="Pending invitations"
                value={pendingCount}
                icon={ClockIcon}
                hint={pendingCount > 0 ? "Awaiting acceptance" : "No pending invitations"}
              />
            )}
          </dl>
        )}

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="members">Members</TabsTrigger>
            {canManage && (
              <TabsTrigger value="invitations">Invitations ({pendingCount})</TabsTrigger>
            )}
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
                  {ASSIGNABLE_ROLES.map((role) => (
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
              ) : members.isError ? (
                <LoadError className="m-4" what="members" query={members} />
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
              {invitations.isError ? (
                <LoadError what="invitations" query={invitations} />
              ) : (
                <InvitationsTable
                  invitations={invitations.data ?? []}
                  loading={invitations.isLoading}
                  isPrime={isPrime}
                />
              )}
            </TabsContent>
          )}
        </Tabs>
      </div>

      {removing && <RemoveMemberDialog member={removing} onClose={() => setRemoving(null)} />}
    </PageContainer>
  );
}
interface MemberRowProps {
  member: Member;
  isPrime: boolean;
  canManage: boolean;
  onRemove: () => void;
}

function MemberRow({ member, isPrime, canManage, onRemove }: MemberRowProps) {
  const { user } = useWorkspace();
  // A person cannot change their own role; only an owner can change another owner's role.
  const immutable = member.user_id === user.id || (!isPrime && member.role === "OWNER");
  const editable = canManage && !immutable;
  const name = member.display_name || member.email;

  return (
    <TableRow>
      <TableCell>
        <span className="flex items-center gap-3">
          <Avatar name={name} />
          {/* A usable width for name and email; on a narrow screen the table scrolls sideways instead. */}
          <span className="grid w-max max-w-64 min-w-36">
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
  const roles = ASSIGNABLE_ROLES.filter((item) => isPrime || item !== "OWNER");
  const name = member.display_name || member.email;

  const save = useAction(async () => {
    await request(`/members/${member.user_id}`, { method: "PATCH", body: { role } });
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
  // The last link created, and who it is for. Cleared as soon as the next email is typed.
  const [created, setCreated] = useState<{ email: string; url: string } | null>(null);
  const [role, setRole] = useState<Role>("AGENT");
  const roles: Role[] = isPrime ? ["AGENT", "ADMIN", "OWNER"] : ["AGENT", "ADMIN"];

  const invite = useAction(async () => {
    const invitation = await request<{ invitation_url: string }>("/invitations", {
      method: "POST",
      body: { email: email.trim(), role },
    });
    await invalidate("invitations");
    setCreated({ email: email.trim(), url: invitation.invitation_url });
    toast.success("Invitation created. Share the link with the recipient.");
    setEmail("");
  });

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void invite.run();
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setCreated(null);
      }}
    >
      <DialogTrigger asChild>
        <Button>
          <MailIcon />
          Invite member
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Invite a member</DialogTitle>
          <DialogDescription>
            Create a link to share with this person. Email delivery is not configured yet.
          </DialogDescription>
        </DialogHeader>
        <form className="grid gap-4" onSubmit={submit}>
          <Field label="Email" htmlFor="invite-email">
            <Input
              id="invite-email"
              type="email"
              required
              placeholder="teammate@company.com"
              value={email}
              onChange={(event) => {
                setEmail(event.target.value);
                setCreated(null);
              }}
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
          {created && (
            <Field
              label={`Invitation link for ${created.email}`}
              htmlFor="invitation-link"
              hint="Copy this link now; it is only shown once."
            >
              <div className="flex gap-2">
                <Input
                  id="invitation-link"
                  readOnly
                  value={created.url}
                  onFocus={(event) => event.target.select()}
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => copyText(created.url, "Invitation link copied")}
                >
                  <CopyIcon />
                  Copy
                </Button>
              </div>
            </Field>
          )}
          <DialogFooter>
            <Button type="submit" disabled={invite.busy}>
              {invite.busy ? "Creating…" : "Create invitation"}
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
  isPrime,
}: {
  invitations: Invitation[];
  loading: boolean;
  isPrime: boolean;
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
              <TableHead className="w-28 text-right">Actions</TableHead>
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
                <TableCell className="text-right">
                  {/* Only owners can revoke an invitation to become an owner. */}
                  {invitation.status === "PENDING" && (isPrime || invitation.role !== "OWNER") && (
                    <RevokeInvitationButton invitation={invitation} />
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </Card>
  );
}

function RevokeInvitationButton({ invitation }: { invitation: Invitation }) {
  const { request, invalidate } = useOrgMutation();
  const [open, setOpen] = useState(false);
  const revoke = useAction(async () => {
    await request(`/invitations/${invitation.id}`, { method: "DELETE" });
    await invalidate("invitations");
    toast.success(`Invitation for ${invitation.email} revoked`);
    setOpen(false);
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) revoke.clearError();
      }}
    >
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="text-danger"
          aria-label={`Revoke invitation for ${invitation.email}`}
        >
          Revoke
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Revoke the invitation for {invitation.email}?</DialogTitle>
          <DialogDescription>
            Their link stops working straight away. You can invite them again later.
          </DialogDescription>
        </DialogHeader>
        {revoke.error && <Notice tone="error">{revoke.error}</Notice>}
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Cancel</Button>
          </DialogClose>
          <Button variant="destructive" disabled={revoke.busy} onClick={() => revoke.run()}>
            {revoke.busy ? "Revoking…" : "Revoke invitation"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
