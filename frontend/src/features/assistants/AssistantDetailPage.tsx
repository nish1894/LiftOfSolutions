import { type FormEvent, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeftIcon,
  CircleCheckIcon,
  ContactIcon,
  type LucideIcon,
  MoreHorizontalIcon,
  PencilIcon,
  TagIcon,
  UsersIcon,
} from "lucide-react";
import { toast } from "sonner";

import { EmptyState, Field, LoadError, LoadingRows, Notice } from "@/components/app/page.tsx";
import { Pill, StatusPill } from "@/components/app/status-pill.tsx";
import { Button } from "@/components/ui/button.tsx";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card.tsx";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog.tsx";
import { Input, NativeSelect, Textarea } from "@/components/ui/input.tsx";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/menu.tsx";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs.tsx";
import ChatTester from "@/features/chat/ChatTester.tsx";
import { AddKnowledgeDialog, DeleteSourceDialog } from "@/features/knowledge/sources.tsx";
import { NoAccess } from "@/features/shell/NotFound.tsx";
import { useSources } from "@/features/workspace/resources.ts";
import { useOrgMutation, useOrgQuery, useWorkspace } from "@/features/workspace/workspace.ts";
import { cn, formatBytes, timeAgo } from "@/lib/utils.ts";
import { AGENT_STATUS, INGESTION_STATUS } from "@/shared/statuses.ts";
import type { Agent, AgentSettings } from "@/shared/types.ts";
import { useAction } from "@/shared/useAction.ts";

import { canCheck, MODEL_GROUPS } from "./presets.ts";

interface AgentForm {
  name: string;
  description: string;
  tone: string;
  languages: string;
  instructions: string;
  sourceId: string | null;
  model: string;
  flow: AgentSettings["flow"];
}

type SetField = <K extends keyof AgentForm>(key: K, value: AgentForm[K]) => void;

const formFrom = (agent: Agent): AgentForm => ({
  name: agent.name,
  description: agent.description ?? "",
  tone: agent.draft.tone ?? "",
  languages: agent.draft.languages.join(", "),
  instructions: agent.draft.instructions,
  sourceId: agent.draft.source_id,
  model: agent.draft.model,
  flow: agent.draft.flow,
});

const sameForm = (a: AgentForm, b: AgentForm) => JSON.stringify(a) === JSON.stringify(b);

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
    source_id: form.sourceId,
    model: form.model,
    flow: form.flow,
  };
}

/* The studio is a full page of its own, outside the app's sidebar. */
export default function AssistantDetailPage() {
  const { agentId = "" } = useParams();
  const { can } = useWorkspace();
  const agent = useOrgQuery<Agent | null>(["agent", agentId], `/assistants/${agentId}`, null, {
    enabled: can("agents.view"),
  });

  if (!can("agents.view")) return <NoAccess what="assistants" />;
  if (agent.isLoading) return <LoadingRows />;
  if (!agent.data) {
    return (
      <div className="mx-auto max-w-lg px-4 py-10">
        <EmptyState
          title="Agent not found"
          description="It may have been archived."
          action={
            <Button asChild variant="outline">
              <Link to="/app/assistants">Back to agents</Link>
            </Button>
          }
        />
      </div>
    );
  }
  // Only another agent remounts the studio, so a save keeps the test chat's conversation.
  return <AgentStudio key={agent.data.id} agent={agent.data} />;
}

/* 60/40: the agent's setup on the left, its test chat on the right. On narrow screens the two
   sides become tabs. */
function AgentStudio({ agent }: { agent: Agent }) {
  const { can } = useWorkspace();
  const { request, invalidate } = useOrgMutation();
  const navigate = useNavigate();
  // The saved version the form started from. Someone else's save resets an untouched form.
  const [base, setBase] = useState(agent);
  const [form, setForm] = useState(() => formFrom(agent));
  const [pane, setPane] = useState("edit");

  const dirty = !sameForm(form, formFrom(base));
  if (agent.version !== base.version && !dirty) {
    setBase(agent);
    setForm(formFrom(agent));
  }

  const editable = can("agents.update");
  const canTest = can("agents.test");
  const canPublish = can("agents.publish");
  const unpublished = agent.unpublished_changes;

  const refresh = () => Promise.all([invalidate("agent", agent.id), invalidate("agents")]);

  async function saveDraft() {
    const saved = await request<Agent>(`/assistants/${agent.id}`, {
      method: "PATCH",
      body: { ...toPayload(form), expected_version: base.version },
    });
    setBase(saved);
    setForm(formFrom(saved));
    await refresh();
  }

  const save = useAction(async () => {
    await saveDraft();
    toast.success("Draft saved");
  });
  const publish = useAction(async () => {
    await request(`/assistants/${agent.id}/publish`, {
      method: "POST",
      body: { expected_version: agent.version },
    });
    await refresh();
    toast.success("Published. Customers now get this version.");
  });
  const pauseOrResume = useAction(async (action: "pause" | "resume") => {
    await request(`/assistants/${agent.id}/${action}`, { method: "POST" });
    await refresh();
    toast.success(action === "pause" ? "Agent paused" : "Agent resumed");
  });
  const archive = useAction(async () => {
    await request(`/assistants/${agent.id}`, { method: "DELETE" });
    await invalidate("agents");
    toast.success("Agent archived");
    navigate("/app/assistants");
  });

  const set: SetField = (key, value) => setForm((current) => ({ ...current, [key]: value }));

  function discard() {
    setBase(agent);
    setForm(formFrom(agent));
  }

  const error = save.error || publish.error || pauseOrResume.error || archive.error;
  // "Discard changes" sits in the menu on phones, where the top bar has no room for its button.
  const menu = [
    dirty && { label: "Discard changes", run: discard, className: "sm:hidden" },
    canPublish &&
      agent.status === "live" && { label: "Pause agent", run: () => pauseOrResume.run("pause") },
    canPublish &&
      agent.status === "paused" && {
        label: "Resume agent",
        run: () => pauseOrResume.run("resume"),
      },
    can("agents.archive") && {
      label: "Archive agent",
      run: () => archive.run(),
      className: "text-danger",
    },
  ].filter((item) => item !== false);

  return (
    <div className="flex h-dvh flex-col bg-background">
      <header className="flex h-14 shrink-0 items-center gap-2 border-b bg-card px-2 sm:gap-3 sm:px-4">
        <Button asChild variant="ghost" size="icon-sm">
          <Link to="/app/assistants" aria-label="Back to agents">
            <ArrowLeftIcon />
          </Link>
        </Button>
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <h1 className="truncate font-semibold">{form.name || "Untitled agent"}</h1>
          {form.description && (
            <span className="hidden truncate text-sm text-muted-foreground md:block">
              {form.description}
            </span>
          )}
          {editable && <DetailsDialog form={form} set={set} />}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <StatusPill map={AGENT_STATUS} value={agent.status} className="hidden sm:inline-flex" />
          <span className="hidden text-xs text-muted-foreground tabular-nums xl:block">
            Version {agent.version} · saved {timeAgo(agent.updated_at)}
          </span>
          {dirty && (
            <Button size="sm" variant="ghost" className="hidden sm:inline-flex" onClick={discard}>
              Discard
            </Button>
          )}
          {editable && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => save.run()}
              disabled={!dirty || save.busy}
            >
              {save.busy ? "Saving…" : "Save"}
            </Button>
          )}
          {canPublish && (
            <Button
              size="sm"
              onClick={() => publish.run()}
              disabled={publish.busy || dirty || !unpublished}
            >
              {publish.busy ? "Publishing…" : unpublished ? "Publish" : "Published"}
            </Button>
          )}
          {menu.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon-sm" aria-label="More actions">
                  <MoreHorizontalIcon />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {menu.map((item) => (
                  <DropdownMenuItem key={item.label} className={item.className} onSelect={item.run}>
                    {item.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </header>

      {canTest && (
        <div className="border-b px-4 py-2 lg:hidden">
          <Tabs value={pane} onValueChange={setPane}>
            <TabsList>
              <TabsTrigger value="edit">Setup</TabsTrigger>
              <TabsTrigger value="test">Test</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      )}

      <div className={cn("grid min-h-0 flex-1", canTest && "lg:grid-cols-[3fr_2fr]")}>
        <div className={cn("min-h-0 overflow-y-auto", pane !== "edit" && "hidden lg:block")}>
          <div className="mx-auto grid max-w-4xl gap-4 p-4 sm:p-6">
            {error && <Notice tone="error">{error}</Notice>}
            {unpublished && !dirty && canPublish && (
              <Notice tone="warning">
                Customers don't see the latest saved draft yet. Test it, then publish.
              </Notice>
            )}
            <InstructionsCard form={form} set={set} editable={editable} />
            <KnowledgePicker
              sourceId={form.sourceId}
              onChange={(sourceId) => set("sourceId", sourceId)}
              editable={editable}
            />
            <AnswerSettingsCard form={form} set={set} editable={editable} />
            <SkillsCard />
          </div>
        </div>

        {canTest && (
          <aside
            className={cn(
              "flex min-h-0 flex-col border-l bg-card",
              pane !== "test" && "hidden lg:flex",
            )}
          >
            <div className="border-b px-4 py-3 sm:px-5">
              <h2 className="font-medium">Test</h2>
              <p className="text-sm text-muted-foreground">
                {editable
                  ? "Runs the saved draft. Unsaved changes are saved when you send."
                  : "Runs the saved draft."}
              </p>
            </div>
            <ChatTester
              agentId={agent.id}
              prepare={dirty ? saveDraft : undefined}
              className="min-h-0 flex-1 px-4 pt-4 pb-4 sm:px-5"
            />
          </aside>
        )}
      </div>
    </div>
  );
}

/* Name and description: shown in the top bar, edited here, saved with the draft. */
function DetailsDialog({ form, set }: { form: AgentForm; set: SetField }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(form.name);
  const [description, setDescription] = useState(form.description);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    set("name", name);
    set("description", description);
    setOpen(false);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        setName(form.name);
        setDescription(form.description);
      }}
    >
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label="Edit name and description">
          <PencilIcon />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Name and description</DialogTitle>
          <DialogDescription>Saved with the draft.</DialogDescription>
        </DialogHeader>
        <form className="grid gap-4" onSubmit={submit}>
          <Field label="Name" htmlFor="agent-name">
            <Input
              id="agent-name"
              required
              minLength={2}
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </Field>
          <Field
            label="What it helps with"
            htmlFor="agent-description"
            hint="Shown to your team only."
          >
            <Textarea
              id="agent-description"
              rows={2}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
          </Field>
          <DialogFooter>
            <Button type="submit">Done</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

interface SectionProps {
  form: AgentForm;
  set: SetField;
  editable: boolean;
}

function InstructionsCard({ form, set, editable }: SectionProps) {
  return (
    <Card>
      <CardHeader>
        <div className="grid gap-1">
          <CardTitle>Instructions</CardTitle>
          <CardDescription>
            Describe the agent's role, how it should talk, and what it must not do. Numbered steps
            work well.
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent className="grid gap-4">
        <Field
          label="Instructions"
          htmlFor="agent-instructions"
          hint={`${form.instructions.length.toLocaleString()} characters.`}
        >
          <Textarea
            id="agent-instructions"
            rows={14}
            className="border-input bg-background font-mono text-sm leading-relaxed text-foreground placeholder:text-muted-foreground"
            placeholder="You are the customer support assistant for…"
            value={form.instructions}
            onChange={(event) => set("instructions", event.target.value)}
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
      </CardContent>
    </Card>
  );
}

const FLOWS: { value: AgentSettings["flow"]; title: string; summary: string }[] = [
  {
    value: "direct",
    title: "Answer directly",
    summary: "One step writes the reply. Fastest and cheapest.",
  },
  {
    value: "checked",
    title: "Answer, then check",
    summary:
      "A second step checks each reply against the instructions and documents, and has it rewritten (up to twice) if it's wrong. Slower, and about twice the cost.",
  },
];

/* The AI model, and the steps the RAG service runs for each message. */
function AnswerSettingsCard({ form, set, editable }: SectionProps) {
  const checkable = canCheck(form.model);

  function chooseModel(model: string) {
    set("model", model);
    if (!canCheck(model)) set("flow", "direct");
  }

  return (
    <Card>
      <CardHeader>
        <div className="grid gap-1">
          <CardTitle>How it answers</CardTitle>
          <CardDescription>
            The AI model, and the steps the agent takes for each message.
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent className="grid gap-4">
        <Field
          label="Model"
          htmlFor="agent-model"
          hint="Larger models answer better, but are slower and cost more."
        >
          <NativeSelect
            id="agent-model"
            className="sm:max-w-xs"
            value={form.model}
            onChange={(event) => chooseModel(event.target.value)}
            disabled={!editable}
          >
            {MODEL_GROUPS.map((group) => (
              <optgroup key={group.label} label={group.label}>
                {group.models.map((model) => (
                  <option key={model.id} value={model.id}>
                    {model.label}
                  </option>
                ))}
              </optgroup>
            ))}
          </NativeSelect>
        </Field>
        <fieldset className="grid gap-2 sm:grid-cols-2">
          <legend className="mb-2 text-sm font-medium">Steps</legend>
          {FLOWS.map((flow) => {
            const disabled = !editable || (flow.value === "checked" && !checkable);
            return (
              <label
                key={flow.value}
                className={cn(
                  "flex gap-3 rounded-lg border p-3 transition-colors has-[:checked]:border-primary has-[:checked]:bg-accent",
                  !disabled && "cursor-pointer hover:bg-background",
                )}
              >
                <input
                  type="radio"
                  name="agent-flow"
                  value={flow.value}
                  className="mt-0.5 size-4 shrink-0 accent-primary disabled:opacity-50"
                  checked={form.flow === flow.value}
                  onChange={() => set("flow", flow.value)}
                  disabled={disabled}
                />
                <span className="grid gap-0.5">
                  <span className="text-sm font-medium">{flow.title}</span>
                  <span className="text-xs text-muted-foreground">
                    {flow.summary}
                    {flow.value === "checked" && !checkable && " Works with OpenAI models for now."}
                  </span>
                </span>
              </label>
            );
          })}
        </fieldset>
      </CardContent>
    </Card>
  );
}

// How the AI service uses a document: a short one whole, a long one in searchable chunks.
const STRATEGIES: Record<string, string> = {
  plainText: "Whole document",
  simpleRag: "Searchable chunks",
};

/* The one knowledge source the agent searches, picked from the project's documents. */
function KnowledgePicker({
  sourceId,
  onChange,
  editable,
}: {
  sourceId: string | null;
  onChange: (sourceId: string | null) => void;
  editable: boolean;
}) {
  const { can } = useWorkspace();
  const sources = useSources();

  if (!can("knowledge.view"))
    return <Notice tone="info">You don't have permission to view knowledge.</Notice>;

  const list = sources.data ?? [];
  const selected = list.find((source) => source.id === sourceId);
  const options = [
    { id: null, name: "No knowledge", meta: "Answers from its instructions only." },
    ...list.map((source) => ({
      id: source.id,
      name: source.name,
      meta: [
        source.file_name,
        formatBytes(source.file_size),
        source.strategy && (STRATEGIES[source.strategy] ?? source.strategy),
      ]
        .filter(Boolean)
        .join(" · "),
      source,
    })),
  ];

  return (
    <Card>
      <CardHeader>
        <div className="grid gap-1">
          <CardTitle>Knowledge source</CardTitle>
          <CardDescription>
            The agent searches one document, or one .zip of several, before it answers.
          </CardDescription>
        </div>
        {can("knowledge.manage") && (
          <AddKnowledgeDialog onAdded={(source) => editable && onChange(source.id)} />
        )}
      </CardHeader>
      <CardContent className="grid gap-4">
        {selected?.status === "indexing" && (
          <Notice tone="info">
            The AI service is still reading this document. Tests won't find anything in it yet, and
            you can publish once it shows Ready.
          </Notice>
        )}
        {selected?.status === "failed" && (
          <Notice tone="error">
            The AI service couldn't read this document. Check that it opens and isn't
            password-protected, then upload it again.
            {selected.error && <span className="block text-xs opacity-80">{selected.error}</span>}
          </Notice>
        )}
        {sources.isLoading ? (
          <LoadingRows />
        ) : sources.isError ? (
          <LoadError what="knowledge sources" query={sources} />
        ) : (
          <fieldset>
            <legend className="sr-only">Knowledge source</legend>
            <ul className="divide-y rounded-lg border">
              {options.map((option) => (
                <li key={option.id ?? "none"} className="flex items-center gap-3 px-3 py-2.5">
                  <input
                    type="radio"
                    name="agent-source"
                    id={`source-${option.id ?? "none"}`}
                    className="size-4 shrink-0 accent-primary disabled:opacity-50"
                    checked={sourceId === option.id}
                    onChange={() => onChange(option.id)}
                    disabled={!editable}
                  />
                  <label htmlFor={`source-${option.id ?? "none"}`} className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{option.name}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {option.meta}
                    </span>
                  </label>
                  {"source" in option && (
                    <>
                      <StatusPill map={INGESTION_STATUS} value={option.source.status} />
                      {can("knowledge.manage") && <DeleteSourceDialog source={option.source} />}
                    </>
                  )}
                </li>
              ))}
            </ul>
          </fieldset>
        )}
        {sources.isSuccess && list.length === 0 && (
          <p className="text-sm text-muted-foreground">
            No documents yet. Upload one, such as your refund policy or a product manual.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

const SKILLS: { icon: LucideIcon; title: string; summary: string }[] = [
  {
    icon: UsersIcon,
    title: "Hand over to a teammate",
    summary: "Assign the conversation to a person or a team.",
  },
  {
    icon: CircleCheckIcon,
    title: "Close the conversation",
    summary: "Close it with a short summary once it's done.",
  },
  {
    icon: ContactIcon,
    title: "Update contact details",
    summary: "Save the name, email or order number it's told.",
  },
  { icon: TagIcon, title: "Add tags", summary: "Tag the conversation by topic." },
];

/* Skills let an agent act in a conversation. None can run yet: they arrive with channels. */
function SkillsCard() {
  return (
    <Card>
      <CardHeader>
        <div className="grid gap-1">
          <CardTitle>Skills</CardTitle>
          <CardDescription>
            Skills let the agent act in a conversation, not just answer. They arrive with channels.
          </CardDescription>
        </div>
        <Pill>Coming soon</Pill>
      </CardHeader>
      <CardContent>
        <ul className="grid gap-2 sm:grid-cols-2">
          {SKILLS.map((skill) => (
            <li
              key={skill.title}
              className="flex gap-3 rounded-lg border border-dashed p-3 text-muted-foreground"
            >
              <skill.icon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              <span className="grid gap-0.5">
                <span className="text-sm font-medium">{skill.title}</span>
                <span className="text-xs">{skill.summary}</span>
              </span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
