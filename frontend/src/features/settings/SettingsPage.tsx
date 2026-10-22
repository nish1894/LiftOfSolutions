import { type FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Building2Icon, CopyIcon, KeyRoundIcon, LayersIcon } from "lucide-react";
import { toast } from "sonner";

import { Field, LoadingRows, Notice, PageContainer, PageHeader } from "@/components/app/page.tsx";
import { Avatar } from "@/components/ui/avatar.tsx";
import { Button } from "@/components/ui/button.tsx";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card.tsx";
import { SETTINGS_NAV, SETTINGS_TABS, SETTINGS_TRIGGER } from "@/components/app/settings-tabs.ts";
import { Input } from "@/components/ui/input.tsx";
import { Separator } from "@/components/ui/separator.tsx";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs.tsx";
import { useAuth } from "@/features/auth/AuthContext.ts";
import { NoAccess } from "@/features/shell/NotFound.tsx";
import { useOrganization } from "@/features/workspace/resources.ts";
import { useOrgMutation, useWorkspace } from "@/features/workspace/workspace.ts";
import { apiRequest } from "@/shared/api/client.ts";
import { copyText } from "@/shared/clipboard.ts";
import { ROLE_LABELS } from "@/shared/permissions.ts";
import type { Organization } from "@/shared/types.ts";
import { useAction } from "@/shared/useAction.ts";

export default function SettingsPage() {
  const { membership, can } = useWorkspace();
  const organization = useOrganization();

  if (!can("organization.view")) return <NoAccess what="organization settings" />;

  const joinCode = can("organization.members.manage") ? organization.data?.join_code : null;

  return (
    <PageContainer>
      <PageHeader
        title="Organization"
        description={`Settings for ${membership.business_name}. Your personal settings are under Account.`}
      />
      <Separator className="mb-6" />
      <Tabs defaultValue="general" orientation="vertical" className={SETTINGS_TABS}>
        <TabsList className={SETTINGS_NAV}>
          <TabsTrigger value="general" className={SETTINGS_TRIGGER}>
            <Building2Icon aria-hidden="true" />
            General
          </TabsTrigger>
          {joinCode && (
            <TabsTrigger value="join-code" className={SETTINGS_TRIGGER}>
              <KeyRoundIcon aria-hidden="true" />
              Join code
            </TabsTrigger>
          )}
          <TabsTrigger value="organizations" className={SETTINGS_TRIGGER}>
            <LayersIcon aria-hidden="true" />
            Your organizations
          </TabsTrigger>
        </TabsList>
        <TabsContent value="general">
          {organization.isLoading ? (
            <LoadingRows />
          ) : (
            <GeneralCard key={organization.data?.name} organization={organization.data ?? null} />
          )}
        </TabsContent>
        {joinCode && (
          <TabsContent value="join-code">
            <JoinCodeCard code={joinCode} />
          </TabsContent>
        )}
        <TabsContent value="organizations">
          <OrganizationsCard />
        </TabsContent>
      </Tabs>
    </PageContainer>
  );
}

function GeneralCard({ organization }: { organization: Organization | null }) {
  const { membership, can } = useWorkspace();
  const { refreshAuth } = useAuth();
  const { request, invalidate } = useOrgMutation();
  const editable = can("organization.update");
  const [name, setName] = useState(organization?.name ?? membership.business_name);

  const save = useAction(async () => {
    await request("", { method: "PATCH", body: { name: name.trim() } });
    await refreshAuth();
    await invalidate("organization");
    toast.success("Organization renamed");
  });

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void save.run();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>General</CardTitle>
      </CardHeader>
      <CardContent>
        <form className="grid gap-4" onSubmit={submit}>
          <Field label="Organization name" htmlFor="org-name">
            <Input
              id="org-name"
              required
              minLength={2}
              value={name}
              onChange={(event) => setName(event.target.value)}
              disabled={!editable}
            />
          </Field>
          {organization?.slug && (
            <p className="text-sm text-muted-foreground">
              Identifier: <code className="font-mono text-xs">{organization.slug}</code>
            </p>
          )}
          {save.error && <Notice tone="error">{save.error}</Notice>}
          {editable && (
            <Button type="submit" className="justify-self-start" disabled={save.busy}>
              {save.busy ? "Saving…" : "Save"}
            </Button>
          )}
        </form>
      </CardContent>
    </Card>
  );
}

function JoinCodeCard({ code }: { code: string }) {
  return (
    <Card>
      <CardHeader>
        <div className="grid gap-1">
          <CardTitle>Join code</CardTitle>
          <CardDescription>
            Anyone with this code can ask to join. You approve each request under Access requests.
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent className="flex flex-wrap items-center gap-3">
        <code className="rounded-md border bg-muted px-3 py-1.5 font-mono text-md tracking-widest">
          {code}
        </code>
        <Button variant="outline" onClick={() => copyText(code, "Join code copied")}>
          <CopyIcon />
          Copy
        </Button>
      </CardContent>
    </Card>
  );
}

function OrganizationsCard() {
  const { membership, memberships, selectBusiness } = useWorkspace();
  const { joinRequests, refreshAuth } = useAuth();
  const navigate = useNavigate();
  const [newName, setNewName] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const pending = joinRequests.filter((item) => item.status === "PENDING");

  const create = useAction(async () => {
    const created = await apiRequest<{ id: string }>("/api/v1/businesses", {
      method: "POST",
      body: { name: newName.trim() },
    });
    await refreshAuth();
    selectBusiness(created.id);
    toast.success(`Created ${newName.trim()}`);
    navigate("/app/overview");
  });
  const join = useAction(async () => {
    await apiRequest("/api/v1/businesses/join-requests", {
      method: "POST",
      body: { join_code: joinCode.trim() },
    });
    setJoinCode("");
    await refreshAuth();
    toast.success("Request sent. You'll be notified when it's approved.");
  });

  function switchTo(businessId: string) {
    selectBusiness(businessId);
    navigate("/app/overview");
  }

  return (
    <Card>
      <CardHeader>
        <div className="grid gap-1">
          <CardTitle>Your organizations</CardTitle>
          <CardDescription>
            Switch between organizations, create a new one, or ask to join another.
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent className="grid gap-6">
        <ul className="divide-y rounded-md border">
          {memberships.map((item) => (
            <li key={item.business_id} className="flex items-center gap-3 px-3 py-2">
              <Avatar name={item.business_name} shape="square" className="size-7" />
              <span className="grid min-w-0 flex-1">
                <span className="truncate font-medium">{item.business_name}</span>
                <span className="text-xs text-muted-foreground">{ROLE_LABELS[item.role]}</span>
              </span>
              {item.business_id === membership.business_id ? (
                <span className="text-xs text-muted-foreground">Current</span>
              ) : (
                <Button size="sm" variant="outline" onClick={() => switchTo(item.business_id)}>
                  Switch
                </Button>
              )}
            </li>
          ))}
          {pending.map((item) => (
            <li key={item.id} className="flex items-center gap-3 px-3 py-2 text-muted-foreground">
              <span className="flex-1 truncate">{item.organization_name}</span>
              <span className="text-xs">Awaiting approval</span>
            </li>
          ))}
        </ul>

        <div className="grid gap-6 sm:grid-cols-2">
          <form
            className="grid content-start gap-3"
            onSubmit={(event) => {
              event.preventDefault();
              void create.run();
            }}
          >
            <Field label="New organization" htmlFor="new-org-name" hint="You'll be its Prime user.">
              <Input
                id="new-org-name"
                required
                minLength={2}
                placeholder="New workspace"
                value={newName}
                onChange={(event) => setNewName(event.target.value)}
              />
            </Field>
            {create.error && <Notice tone="error">{create.error}</Notice>}
            <Button
              type="submit"
              variant="outline"
              className="justify-self-start"
              disabled={create.busy}
            >
              {create.busy ? "Creating…" : "Create organization"}
            </Button>
          </form>

          <form
            className="grid content-start gap-3"
            onSubmit={(event) => {
              event.preventDefault();
              void join.run();
            }}
          >
            <Field
              label="Join with a code"
              htmlFor="join-other-code"
              hint="An admin of that organization shares it."
            >
              <Input
                id="join-other-code"
                required
                minLength={6}
                className="font-mono uppercase"
                placeholder="A1B2C3D4E5"
                value={joinCode}
                onChange={(event) => setJoinCode(event.target.value.toUpperCase())}
              />
            </Field>
            {join.error && <Notice tone="error">{join.error}</Notice>}
            <Button
              type="submit"
              variant="outline"
              className="justify-self-start"
              disabled={join.busy}
            >
              {join.busy ? "Sending…" : "Request access"}
            </Button>
          </form>
        </div>
      </CardContent>
    </Card>
  );
}
