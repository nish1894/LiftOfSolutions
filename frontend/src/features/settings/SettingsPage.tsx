import { type FormEvent, useState } from "react";
import { Navigate } from "react-router-dom";
import { Building2Icon, LayersIcon } from "lucide-react";
import { toast } from "sonner";

import { Field, LoadingRows, Notice, PageContainer } from "@/components/app/page.tsx";
import { Avatar } from "@/components/ui/avatar.tsx";
import { Button } from "@/components/ui/button.tsx";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card.tsx";
import {
  SETTINGS_NAV,
  SETTINGS_TABS,
  SETTINGS_TRIGGER,
  useTabParam,
} from "@/components/app/settings-tabs.ts";
import { Input } from "@/components/ui/input.tsx";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs.tsx";
import { useAuth } from "@/features/auth/AuthContext.ts";
import SettingsHeader from "./SettingsHeader.tsx";
import { useOrganization } from "@/features/workspace/resources.ts";
import { useOrgMutation, useWorkspace } from "@/features/workspace/workspace.ts";
import { ROLE_LABELS } from "@/shared/permissions.ts";
import type { Organization } from "@/shared/types.ts";
import { ApiError } from "@/shared/api/client.ts";
import { useAction } from "@/shared/useAction.ts";

const GENERAL_TABS = ["general", "organizations"] as const;

export default function SettingsPage() {
  const { membership, can } = useWorkspace();
  const [tab, setTab] = useTabParam(GENERAL_TABS);
  const organization = useOrganization();

  // Settings is one sidebar entry; people without org access land on their own account.
  if (!can("organization.view")) return <Navigate to="/app/account" replace />;

  return (
    <PageContainer>
      <SettingsHeader description={`Organization settings for ${membership.business_name}.`} />
      <Tabs value={tab} onValueChange={setTab} className={SETTINGS_TABS}>
        <TabsList className={SETTINGS_NAV}>
          <TabsTrigger value="general" className={SETTINGS_TRIGGER}>
            <Building2Icon aria-hidden="true" />
            General
          </TabsTrigger>
          <TabsTrigger value="organizations" className={SETTINGS_TRIGGER}>
            <LayersIcon aria-hidden="true" />
            Membership
          </TabsTrigger>
        </TabsList>
        <TabsContent value="general">
          {organization.isLoading ? (
            <LoadingRows />
          ) : (
            <GeneralCard key={organization.data?.name} organization={organization.data ?? null} />
          )}
        </TabsContent>
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
  // Only owners change the URL name: it appears in links people may have saved.
  const slugEditable = membership.role === "OWNER" || membership.role === "PRIME";
  const [name, setName] = useState(organization?.name ?? membership.business_name);
  const [slug, setSlug] = useState(organization?.slug ?? "");

  const save = useAction(async () => {
    const changes = {
      name: name.trim(),
      ...(slugEditable && slug && slug !== organization?.slug ? { slug } : {}),
    };
    try {
      await request("", { method: "PATCH", body: changes });
    } catch (error) {
      // A taken slug is the only unique value this form can collide on.
      if (error instanceof ApiError && error.status === 409)
        throw new Error("That URL name is already taken. Try another.", { cause: error });
      throw error;
    }
    await refreshAuth();
    await invalidate("organization");
    toast.success("Organization settings saved");
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
            <Field
              label="URL name"
              htmlFor="org-slug"
              hint={
                slugEditable
                  ? "Lowercase letters, numbers and hyphens, e.g. acme-support."
                  : "Only an owner can change this."
              }
            >
              <Input
                id="org-slug"
                className="font-mono"
                value={slug}
                onChange={(event) => setSlug(event.target.value.toLowerCase())}
                pattern="[a-z0-9]+(-[a-z0-9]+)*"
                title="Lowercase letters and numbers, with single hyphens between words"
                minLength={2}
                maxLength={80}
                required
                disabled={!slugEditable}
              />
            </Field>
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

function OrganizationsCard() {
  const { membership } = useWorkspace();

  return (
    <Card>
      <CardHeader>
        <div className="grid gap-1">
          <CardTitle>Membership</CardTitle>
          <CardDescription>
            One account belongs to one organization. To move, accept an invitation from another
            organization.
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent className="grid gap-4">
        <ul className="divide-y rounded-md border">
          <li className="flex items-center gap-3 px-3 py-2">
            <Avatar name={membership.business_name} shape="square" className="size-7" />
            <span className="grid min-w-0 flex-1">
              <span className="truncate font-medium">{membership.business_name}</span>
              <span className="text-xs text-muted-foreground">{ROLE_LABELS[membership.role]}</span>
            </span>
            <span className="text-xs text-muted-foreground">Current</span>
          </li>
        </ul>
      </CardContent>
    </Card>
  );
}
