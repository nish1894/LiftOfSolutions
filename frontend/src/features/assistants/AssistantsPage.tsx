import { type FormEvent, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { BotIcon, PlusIcon } from "lucide-react";

import {
  EmptyState,
  Field,
  LoadError,
  LoadingRows,
  Notice,
  PageContainer,
  PageHeader,
} from "@/components/app/page.tsx";
import { StatusPill } from "@/components/app/status-pill.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Card } from "@/components/ui/card.tsx";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog.tsx";
import { Input, Textarea } from "@/components/ui/input.tsx";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs.tsx";
import { NoAccess } from "@/features/shell/NotFound.tsx";
import { useAgents, useSources } from "@/features/workspace/resources.ts";
import { useOrgMutation, useWorkspace } from "@/features/workspace/workspace.ts";
import { timeAgo } from "@/lib/utils.ts";
import { AGENT_STATUS } from "@/shared/statuses.ts";
import type { Agent } from "@/shared/types.ts";
import { useAction } from "@/shared/useAction.ts";

import { AGENT_TEMPLATES } from "./presets.ts";

type Group = "published" | "drafts" | "all";

const GROUPS: { value: Group; label: string }[] = [
  { value: "all", label: "All" },
  { value: "published", label: "Published" },
  { value: "drafts", label: "Drafts" },
];

const inGroup = (agent: Agent, group: Group) =>
  group === "all" || (group === "published") === (agent.status === "live");

/* Agent roster from the design's studio: one card per agent with its state,
   model and knowledge, and a way into the studio. */
export default function AssistantsPage() {
  const { can } = useWorkspace();
  const agents = useAgents();
  const sources = useSources();
  const [group, setGroup] = useState<Group>("all");

  if (!can("agents.view")) return <NoAccess what="agents" />;
  const list = agents.data ?? [];
  const sourceName = (agent: Agent) =>
    sources.data?.find((source) => source.id === agent.draft.source_id)?.name;
  const shown = list.filter((agent) => inGroup(agent, group));

  return (
    <PageContainer>
      <PageHeader
        title="Agents"
        description="Each agent answers customers from the knowledge you give it. Changes stay a draft until you publish."
        actions={can("agents.create") && !agents.isError && <CreateAssistantDialog />}
      />
      {agents.isLoading ? (
        <LoadingRows />
      ) : agents.isError ? (
        <LoadError what="agents" query={agents} />
      ) : list.length === 0 ? (
        <EmptyState
          icon={BotIcon}
          title="No agents yet"
          description="Create one, give it knowledge, test it, then publish."
        />
      ) : (
        <Tabs value={group} onValueChange={(value) => setGroup(value as Group)}>
          <TabsList>
            {GROUPS.map((item) => (
              <TabsTrigger key={item.value} value={item.value}>
                {item.label} ({list.filter((agent) => inGroup(agent, item.value)).length})
              </TabsTrigger>
            ))}
          </TabsList>
          {shown.length === 0 ? (
            <EmptyState icon={BotIcon} title="No agents here" />
          ) : (
            <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {shown.map((agent) => (
                <li key={agent.id}>
                  <AgentCard agent={agent} sourceName={sourceName(agent)} />
                </li>
              ))}
            </ul>
          )}
        </Tabs>
      )}
    </PageContainer>
  );
}

function AgentCard({ agent, sourceName }: { agent: Agent; sourceName?: string }) {
  const live = agent.status === "live";
  return (
    <Card className="card-hover h-full gap-4 p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="truncate font-semibold">{agent.name}</h2>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span className="rounded-md border bg-background px-1.5 py-0.5 font-mono">
              {agent.draft.model}
            </span>
            <span className="truncate">
              {agent.draft.source_id ? (sourceName ?? "1 document") : "No knowledge"}
            </span>
          </p>
        </div>
        <StatusPill map={AGENT_STATUS} value={agent.status} />
      </div>
      {agent.description && (
        <p className="line-clamp-2 text-sm text-subtle-foreground">{agent.description}</p>
      )}
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <span
          className={
            live
              ? "size-1.5 rounded-full bg-success-solid"
              : "size-1.5 rounded-full bg-muted-foreground"
          }
          aria-hidden="true"
        />
        {live && agent.unpublished_changes ? "Unpublished changes · " : ""}
        Updated {timeAgo(agent.updated_at)}
      </p>
      <div className="mt-auto flex gap-2 border-t pt-4">
        <Button asChild className="flex-1">
          <Link to={`/app/assistants/${agent.id}`}>Open studio</Link>
        </Button>
      </div>
    </Card>
  );
}

const BLANK = "blank";

/* New agent: start from a template, or blank. A template fills the name, tone and instructions. */
function CreateAssistantDialog() {
  const { request, invalidate } = useOrgMutation();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [choice, setChoice] = useState(AGENT_TEMPLATES[0]!.id);
  const [name, setName] = useState(AGENT_TEMPLATES[0]!.name);
  const [description, setDescription] = useState(AGENT_TEMPLATES[0]!.summary);
  const template = AGENT_TEMPLATES.find((item) => item.id === choice);

  function choose(id: string) {
    const next = AGENT_TEMPLATES.find((item) => item.id === id);
    setChoice(id);
    setName(next?.name ?? "");
    setDescription(next?.summary ?? "");
  }

  const create = useAction(async () => {
    const agent = await request<Agent>("/assistants", {
      method: "POST",
      body: {
        name: name.trim(),
        description: description.trim() || null,
        ...(template ? { instructions: template.instructions, tone: template.tone } : {}),
      },
    });
    await invalidate("agents");
    navigate(`/app/assistants/${agent.id}`);
  });

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void create.run();
  }

  const options = [
    ...AGENT_TEMPLATES.map((item) => ({ id: item.id, title: item.title, summary: item.summary })),
    { id: BLANK, title: "Start blank", summary: "Write the instructions yourself." },
  ];

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <PlusIcon />
          New agent
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>New agent</DialogTitle>
          <DialogDescription>
            Start from a template or from blank. You can change everything in the studio, and test
            it before you publish.
          </DialogDescription>
        </DialogHeader>
        <form className="grid gap-4" onSubmit={submit}>
          <fieldset className="grid gap-2 sm:grid-cols-2">
            <legend className="mb-2 text-sm font-medium">Start from</legend>
            {options.map((option) => (
              <label
                key={option.id}
                className="flex cursor-pointer gap-3 rounded-lg border p-3 transition-colors hover:bg-background has-[:checked]:border-primary has-[:checked]:bg-accent"
              >
                <input
                  type="radio"
                  name="agent-template"
                  value={option.id}
                  className="mt-0.5 size-4 shrink-0 accent-primary"
                  checked={choice === option.id}
                  onChange={() => choose(option.id)}
                />
                <span className="grid gap-0.5">
                  <span className="text-sm font-medium">{option.title}</span>
                  <span className="text-xs text-muted-foreground">{option.summary}</span>
                </span>
              </label>
            ))}
          </fieldset>
          <Field label="Name" htmlFor="assistant-name">
            <Input
              id="assistant-name"
              required
              minLength={2}
              placeholder="Returns agent"
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </Field>
          <Field
            label="What it helps with"
            htmlFor="assistant-description"
            hint="Optional. Shown to your team only."
          >
            <Textarea
              id="assistant-description"
              rows={2}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
          </Field>
          {create.error && <Notice tone="error">{create.error}</Notice>}
          <DialogFooter>
            <Button type="submit" disabled={create.busy}>
              {create.busy ? "Creating…" : "Create agent"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
