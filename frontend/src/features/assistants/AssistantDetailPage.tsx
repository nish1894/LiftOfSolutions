import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeftIcon, BookOpenIcon, MoreHorizontalIcon } from "lucide-react";
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
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card.tsx";
import { Checkbox, Input, Textarea } from "@/components/ui/input.tsx";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/menu.tsx";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs.tsx";
import ChatTester from "@/features/chat/ChatTester.tsx";
import { ChannelList } from "@/features/integrations/channels.tsx";
import { NoAccess } from "@/features/shell/NotFound.tsx";
import { useSources } from "@/features/workspace/resources.ts";
import { useOrgMutation, useOrgQuery, useWorkspace } from "@/features/workspace/workspace.ts";
import { AGENT_LIFECYCLE, INGESTION_STATUS } from "@/shared/statuses.ts";
import type { Agent } from "@/shared/types.ts";
import { useAction } from "@/shared/useAction.ts";

import { hasUnpublishedChanges } from "./agentState.ts";

interface AgentForm {
  name: string;
  description: string;
  tone: string;
  languages: string;
  instructions: string;
  knowledgeEnabled: boolean;
  sourceIds: string[];
}

const formFrom = (agent: Agent): AgentForm => ({
  name: agent.name,
  description: agent.description ?? "",
  tone: agent.tone ?? "",
  languages: (agent.languages ?? ["en"]).join(", "),
  instructions: agent.instructions ?? "",
  knowledgeEnabled: agent.knowledge_enabled ?? true,
  sourceIds: agent.knowledge_source_ids ?? [],
});

function toPayload(form: AgentForm) {
  const languages = form.languages
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  return {
    name: form.name.trim(),
    description: form.description.trim() || null,
    tone: form.tone.trim() || null,
    languages: languages.length ? languages : ["en"],
    instructions: form.instructions,
    knowledge_enabled: form.knowledgeEnabled,
    knowledge_source_ids: form.sourceIds,
  };
}

export default function AssistantDetailPage() {
  const { agentId = "" } = useParams();
  const { can } = useWorkspace();
  // Kept here so the chosen tab survives the editor remounting after a save.
  const [tab, setTab] = useState("setup");
  const agent = useOrgQuery<Agent | null>(["agent", agentId], `/assistants/${agentId}`, null, {
    enabled: can("agents.view"),
  });

  if (!can("agents.view")) return <NoAccess what="assistants" />;
  if (agent.isLoading) return <LoadingRows />;
  if (!agent.data) {
    return (
      <PageContainer size="narrow">
        <EmptyState
          className="mt-10"
          title="Assistant not found"
          description="It may have been archived."
        />
      </PageContainer>
    );
  }

  // A new version remounts the editor, so the form always starts from saved data.
  return (
    <AgentEditor
      key={`${agent.data.id}:${agent.data.version}`}
      agent={agent.data}
      tab={tab}
      onTabChange={setTab}
    />
  );
}

interface AgentEditorProps {
  agent: Agent;
  tab: string;
  onTabChange: (tab: string) => void;
}

function AgentEditor({ agent, tab, onTabChange }: AgentEditorProps) {
  const { can } = useWorkspace();
  const { request, invalidate } = useOrgMutation();
  const sources = useSources();
  const [form, setForm] = useState(() => formFrom(agent));

  const editable = can("agents.update");
  const dirty = JSON.stringify(form) !== JSON.stringify(formFrom(agent));
  const unpublished = hasUnpublishedChanges(agent);

  const refresh = () => Promise.all([invalidate("agent", agent.id), invalidate("agents")]);

  const save = useAction(async () => {
    await request(`/assistants/${agent.id}`, {
      method: "PATCH",
      body: { ...toPayload(form), expected_version: agent.version },
    });
    await refresh();
    toast.success("Draft saved");
  });
  const publish = useAction(async () => {
    await request(`/assistants/${agent.id}/publish`, { method: "POST" });
    await refresh();
    toast.success("Published. Customers now get this version.");
  });
  const lifecycle = useAction(async (status: "PAUSED" | "DRAFT") => {
    await request(`/assistants/${agent.id}/lifecycle`, { method: "POST", body: { status } });
    await refresh();
    toast.success(status === "PAUSED" ? "Assistant paused" : "Assistant moved to draft");
  });
  const archive = useAction(async () => {
    await request(`/assistants/${agent.id}`, { method: "DELETE" });
    await refresh();
    toast.success("Assistant archived");
  });

  const set = <K extends keyof AgentForm>(key: K, value: AgentForm[K]) =>
    setForm((current) => ({ ...current, [key]: value }));

  function toggleSource(sourceId: string, checked: boolean) {
    set(
      "sourceIds",
      checked ? [...form.sourceIds, sourceId] : form.sourceIds.filter((id) => id !== sourceId),
    );
  }

  const error = save.error || publish.error || lifecycle.error || archive.error;
  const activeSources = (sources.data ?? []).filter((source) => source.status !== "ARCHIVED");
  const canPause = agent.lifecycle_status === "ACTIVE" || agent.lifecycle_status === "TESTING";

  return (
    <PageContainer>
      <Link
        to="/app/assistants"
        className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeftIcon className="size-4" aria-hidden="true" />
        Assistants
      </Link>

      <PageHeader
        title={agent.name}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <StatusPill map={AGENT_LIFECYCLE} value={agent.lifecycle_status} />
            <span>Version {agent.version}</span>
          </span>
        }
        actions={
          <>
            {can("agents.publish") && (
              <Button
                onClick={() => publish.run()}
                disabled={publish.busy || dirty || !unpublished}
              >
                {publish.busy ? "Publishing…" : unpublished ? "Publish" : "Published"}
              </Button>
            )}
            {editable && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="icon" aria-label="More actions">
                    <MoreHorizontalIcon />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {canPause && (
                    <DropdownMenuItem onSelect={() => lifecycle.run("PAUSED")}>
                      Pause assistant
                    </DropdownMenuItem>
                  )}
                  {agent.lifecycle_status === "PAUSED" && (
                    <DropdownMenuItem onSelect={() => lifecycle.run("DRAFT")}>
                      Move back to draft
                    </DropdownMenuItem>
                  )}
                  {can("agents.archive") && (
                    <DropdownMenuItem className="text-danger" onSelect={() => archive.run()}>
                      Archive assistant
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </>
        }
      />

      {error && (
        <Notice tone="error" className="mb-4">
          {error}
        </Notice>
      )}
      {unpublished && !dirty && can("agents.publish") && (
        <Notice tone="warning" className="mb-4">
          Customers don't see the latest saved draft yet. Test it, then publish.
        </Notice>
      )}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_24rem]">
        <Tabs value={tab} onValueChange={onTabChange}>
          {dirty && (
            <div className="sticky top-14 z-20 flex flex-wrap items-center justify-between gap-2 rounded-md border bg-card px-3 py-2 shadow-sm">
              <span className="text-sm font-medium">Unsaved changes</span>
              <div className="flex gap-2">
                <Button size="sm" variant="ghost" onClick={() => setForm(formFrom(agent))}>
                  Discard
                </Button>
                <Button size="sm" onClick={() => save.run()} disabled={save.busy}>
                  {save.busy ? "Saving…" : "Save draft"}
                </Button>
              </div>
            </div>
          )}

          <TabsList>
            <TabsTrigger value="setup">Setup</TabsTrigger>
            <TabsTrigger value="knowledge">Knowledge</TabsTrigger>
            <TabsTrigger value="channels">Channels</TabsTrigger>
          </TabsList>

          <TabsContent value="setup">
            <Card>
              <CardContent className="grid gap-4">
                <Field label="Name" htmlFor="agent-name">
                  <Input
                    id="agent-name"
                    value={form.name}
                    onChange={(event) => set("name", event.target.value)}
                    disabled={!editable}
                  />
                </Field>
                <Field
                  label="What it helps with"
                  htmlFor="agent-description"
                  hint="Shown to your team only."
                >
                  <Input
                    id="agent-description"
                    value={form.description}
                    onChange={(event) => set("description", event.target.value)}
                    disabled={!editable}
                  />
                </Field>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Tone" htmlFor="agent-tone" hint="For example: friendly, concise.">
                    <Input
                      id="agent-tone"
                      value={form.tone}
                      onChange={(event) => set("tone", event.target.value)}
                      disabled={!editable}
                    />
                  </Field>
                  <Field
                    label="Languages"
                    htmlFor="agent-languages"
                    hint="Language codes, comma separated."
                  >
                    <Input
                      id="agent-languages"
                      value={form.languages}
                      onChange={(event) => set("languages", event.target.value)}
                      disabled={!editable}
                    />
                  </Field>
                </div>
                <Field
                  label="Instructions"
                  htmlFor="agent-instructions"
                  hint={`${form.instructions.length.toLocaleString()} characters. Tell the assistant how to behave and what it must not do.`}
                >
                  <Textarea
                    id="agent-instructions"
                    rows={10}
                    value={form.instructions}
                    onChange={(event) => set("instructions", event.target.value)}
                    disabled={!editable}
                  />
                </Field>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="knowledge">
            <Card>
              <CardHeader>
                <div className="grid gap-1">
                  <CardTitle>Knowledge sources</CardTitle>
                  <CardDescription>
                    The assistant only answers from sources you select here.
                  </CardDescription>
                </div>
              </CardHeader>
              <CardContent className="grid gap-4">
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={form.knowledgeEnabled}
                    onChange={(event) => set("knowledgeEnabled", event.target.checked)}
                    disabled={!editable}
                  />
                  Answer from knowledge sources
                </label>
                {activeSources.length === 0 ? (
                  <EmptyState
                    icon={BookOpenIcon}
                    title="No knowledge sources yet"
                    action={
                      <Button asChild variant="outline" size="sm">
                        <Link to="/app/knowledge">Add knowledge</Link>
                      </Button>
                    }
                  />
                ) : (
                  <ul className="divide-y rounded-md border">
                    {activeSources.map((source) => (
                      <li key={source.id} className="flex items-center gap-3 px-3 py-2">
                        <Checkbox
                          id={`source-${source.id}`}
                          checked={form.sourceIds.includes(source.id)}
                          onChange={(event) => toggleSource(source.id, event.target.checked)}
                          disabled={!editable || !form.knowledgeEnabled}
                        />
                        <label htmlFor={`source-${source.id}`} className="flex-1 truncate text-sm">
                          {source.name}
                        </label>
                        <StatusPill map={INGESTION_STATUS} value={source.processing_status} />
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="channels">
            {can("channels.view") ? (
              <ChannelList assistantId={agent.id} />
            ) : (
              <Notice tone="info">You don't have permission to view channels.</Notice>
            )}
          </TabsContent>
        </Tabs>

        {can("agents.test") && (
          <aside className="xl:sticky xl:top-16 xl:self-start">
            <Card>
              <CardHeader>
                <div className="grid gap-1">
                  <CardTitle>Test</CardTitle>
                  <CardDescription>
                    Runs the saved draft. Unsaved edits aren't included.
                  </CardDescription>
                </div>
              </CardHeader>
              <CardContent>
                <ChatTester agentId={agent.id} className="h-112" />
              </CardContent>
            </Card>
          </aside>
        )}
      </div>
    </PageContainer>
  );
}
