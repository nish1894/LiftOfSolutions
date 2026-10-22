import { type FormEvent, useState } from "react";
import { PlugIcon, PlusIcon } from "lucide-react";
import { toast } from "sonner";

import {
  EmptyState,
  Field,
  LoadingRows,
  Notice,
  PageContainer,
  PageHeader,
} from "@/components/app/page.tsx";
import { StatusPill } from "@/components/app/status-pill.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Switch } from "@/components/ui/switch.tsx";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs.tsx";
import { NoAccess } from "@/features/shell/NotFound.tsx";
import { useOrgMutation, useOrgQuery, useWorkspace } from "@/features/workspace/workspace.ts";
import { sentenceCase } from "@/lib/utils.ts";
import { RECORD_STATUS } from "@/shared/statuses.ts";
import type { Integration } from "@/shared/types.ts";
import { useAction } from "@/shared/useAction.ts";

import { ChannelList } from "./channels.tsx";

export default function IntegrationsPage() {
  const { can } = useWorkspace();
  const canChannels = can("channels.view");
  const canIntegrations = can("integrations.view");

  if (!canChannels && !canIntegrations) return <NoAccess what="channels or integrations" />;

  return (
    <PageContainer>
      <PageHeader
        title="Integrations"
        description="Where customers reach your assistants, and the outside systems this organization connects to."
      />
      <Tabs defaultValue={canChannels ? "channels" : "integrations"}>
        <TabsList>
          {canChannels && <TabsTrigger value="channels">Channels</TabsTrigger>}
          {canIntegrations && <TabsTrigger value="integrations">Connected systems</TabsTrigger>}
        </TabsList>
        {canChannels && (
          <TabsContent value="channels">
            <ChannelList />
          </TabsContent>
        )}
        {canIntegrations && (
          <TabsContent value="integrations">
            <IntegrationsList />
          </TabsContent>
        )}
      </Tabs>
    </PageContainer>
  );
}

/* Rows with a switch, as on the template's Connections page (MIT). */
function IntegrationsList() {
  const { can } = useWorkspace();
  const manage = can("integrations.manage");
  const integrations = useOrgQuery<Integration[]>(["integrations"], "/integrations", []);
  const list = integrations.data ?? [];

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="grid gap-1">
          <CardTitle>Connected systems</CardTitle>
          <CardDescription>
            Credentials are stored on the server, never in the browser. New integrations start
            turned off.
          </CardDescription>
        </div>
        {manage && <AddIntegrationDialog />}
      </CardHeader>
      {integrations.isLoading ? (
        <LoadingRows />
      ) : list.length === 0 ? (
        <EmptyState className="m-6 mt-4" icon={PlugIcon} title="No integrations yet" />
      ) : (
        <ul className="divide-y px-6 pb-2">
          {list.map((integration) => (
            <IntegrationRow key={integration.id} integration={integration} manage={manage} />
          ))}
        </ul>
      )}
    </Card>
  );
}

function IntegrationRow({ integration, manage }: { integration: Integration; manage: boolean }) {
  const { request, invalidate } = useOrgMutation();
  const active = integration.status === "ACTIVE";
  const toggle = useAction(async (next: boolean) => {
    await request(`/integrations/${integration.id}`, {
      method: "PATCH",
      body: { status: next ? "ACTIVE" : "DISABLED" },
    });
    await invalidate("integrations");
    toast.success(next ? "Integration turned on" : "Integration turned off");
  });

  return (
    <li className="grid gap-2 py-4">
      <div className="flex flex-wrap items-center gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-lg border bg-background shadow-xs">
          <PlugIcon className="size-5 text-muted-foreground" aria-hidden="true" />
        </span>
        <div className="grid min-w-0 flex-1">
          <span className="truncate font-medium">{integration.display_name}</span>
          <span className="text-sm text-muted-foreground">
            {sentenceCase(integration.integration_type)}
          </span>
        </div>
        {(integration.status === "ERROR" || !manage) && (
          <StatusPill map={RECORD_STATUS} value={integration.status} />
        )}
        {manage && (
          <Switch
            checked={active}
            disabled={toggle.busy}
            onCheckedChange={(next) => toggle.run(next)}
            aria-label={`Turn ${integration.display_name} ${active ? "off" : "on"}`}
          />
        )}
      </div>
      {toggle.error && (
        <p className="text-sm text-danger" role="alert">
          {toggle.error}
        </p>
      )}
    </li>
  );
}

function AddIntegrationDialog() {
  const { request, invalidate } = useOrgMutation();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [type, setType] = useState("");

  const add = useAction(async () => {
    await request("/integrations", {
      method: "POST",
      body: { display_name: name.trim(), integration_type: type.trim().toLowerCase() },
    });
    await invalidate("integrations");
    toast.success("Integration added. Turn it on when it's configured.");
    setName("");
    setType("");
    setOpen(false);
  });

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void add.run();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <PlusIcon />
          Add integration
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add an integration</DialogTitle>
          <DialogDescription>New integrations start turned off.</DialogDescription>
        </DialogHeader>
        <form className="grid gap-4" onSubmit={submit}>
          <Field label="Name" htmlFor="integration-name">
            <Input
              id="integration-name"
              required
              placeholder="Support Slack"
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </Field>
          <Field
            label="Type"
            htmlFor="integration-type"
            hint="The system it connects to, e.g. slack."
          >
            <Input
              id="integration-type"
              required
              value={type}
              onChange={(event) => setType(event.target.value)}
            />
          </Field>
          {add.error && <Notice tone="error">{add.error}</Notice>}
          <DialogFooter>
            <Button type="submit" disabled={add.busy}>
              {add.busy ? "Adding…" : "Add integration"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
