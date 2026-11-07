import { type FormEvent, type ReactNode, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeftIcon, MoreHorizontalIcon, PencilIcon, ZapIcon } from "lucide-react";
import { toast } from "sonner";

import { EmptyState, Field, LoadingRows, Notice } from "@/components/app/page.tsx";
import { StatusPill } from "@/components/app/status-pill.tsx";
import { Button } from "@/components/ui/button.tsx";
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
import { NoAccess } from "@/features/shell/NotFound.tsx";
import { useAgents, useMembers } from "@/features/workspace/resources.ts";
import { useOrgMutation, useOrgQuery, useWorkspace } from "@/features/workspace/workspace.ts";
import { cn, timeAgo } from "@/lib/utils.ts";
import { WORKFLOW_STATUS } from "@/shared/statuses.ts";
import type {
  Agent,
  BranchCondition,
  Member,
  Workflow,
  WorkflowStep,
  WorkflowTrigger,
} from "@/shared/types.ts";
import { useAction } from "@/shared/useAction.ts";

import { type Names, StepDiagram } from "./StepDiagram.tsx";
import {
  CONDITIONS,
  CONTACT_FIELDS,
  countSteps,
  findStep,
  hasBlankText,
  insertStep,
  MAX_STEPS,
  MAX_WAIT_MINUTES,
  newStep,
  type Place,
  removeStep,
  STEP_TYPES,
  type StepType,
  TRIGGER_ID,
  TRIGGERS,
  updateStep,
} from "./steps.ts";

interface WorkflowForm {
  name: string;
  description: string;
  trigger: WorkflowTrigger;
  steps: WorkflowStep[];
}

const formFrom = (workflow: Workflow): WorkflowForm => ({
  name: workflow.name,
  description: workflow.description ?? "",
  trigger: workflow.trigger,
  steps: workflow.steps,
});

const sameForm = (a: WorkflowForm, b: WorkflowForm) => JSON.stringify(a) === JSON.stringify(b);

/* The workflow editor is a full page of its own, like the agent studio. */
export default function WorkflowEditorPage() {
  const { workflowId = "" } = useParams();
  const { can } = useWorkspace();
  const workflow = useOrgQuery<Workflow | null>(
    ["workflow", workflowId],
    `/workflows/${workflowId}`,
    null,
    { enabled: can("workflows.view") },
  );

  if (!can("workflows.view")) return <NoAccess what="workflows" />;
  if (workflow.isLoading) return <LoadingRows />;
  if (!workflow.data) {
    return (
      <div className="mx-auto max-w-lg px-4 py-10">
        <EmptyState
          title="Workflow not found"
          description="It may have been deleted."
          action={
            <Button asChild variant="outline">
              <Link to="/app/workflows">Back to workflows</Link>
            </Button>
          }
        />
      </div>
    );
  }
  return <WorkflowEditor key={workflow.data.id} workflow={workflow.data} />;
}

/* The steps drawn on the left; the selected step's settings on the right. On narrow screens the two sides
   become tabs, and picking a step opens its settings. */
function WorkflowEditor({ workflow }: { workflow: Workflow }) {
  const { can } = useWorkspace();
  const { request, invalidate } = useOrgMutation();
  const navigate = useNavigate();
  const agents = useAgents();
  const members = useMembers();
  // The saved version the form started from. Someone else's save resets an untouched form.
  const [base, setBase] = useState(workflow);
  const [form, setForm] = useState(() => formFrom(workflow));
  const [selected, setSelected] = useState(TRIGGER_ID);
  const [pane, setPane] = useState("steps");
  const [deleting, setDeleting] = useState(false);

  const dirty = !sameForm(form, formFrom(base));
  if (workflow.version !== base.version && !dirty) {
    setBase(workflow);
    setForm(formFrom(workflow));
  }

  const editable = can("workflows.manage");
  const blank = hasBlankText(form.steps);
  const atLimit = countSteps(form.steps) >= MAX_STEPS;
  const refresh = () => Promise.all([invalidate("workflow", workflow.id), invalidate("workflows")]);

  const save = useAction(async () => {
    const saved = await request<Workflow>(`/workflows/${workflow.id}`, {
      method: "PATCH",
      body: {
        name: form.name.trim(),
        description: form.description.trim() || null,
        trigger: form.trigger,
        steps: form.steps,
        expected_version: base.version,
      },
    });
    setBase(saved);
    setForm(formFrom(saved));
    await refresh();
    toast.success("Workflow saved");
  });
  const turn = useAction(async (status: "on" | "off") => {
    await request(`/workflows/${workflow.id}/turn-${status}`, { method: "POST" });
    await refresh();
    toast.success(
      status === "on"
        ? "Workflow turned on. It runs once a channel is connected."
        : "Workflow turned off",
    );
  });
  const remove = useAction(async () => {
    await request(`/workflows/${workflow.id}`, { method: "DELETE" });
    await invalidate("workflows");
    toast.success("Workflow deleted");
    navigate("/app/workflows");
  });

  const setSteps = (steps: WorkflowStep[]) => setForm((current) => ({ ...current, steps }));
  function select(id: string) {
    setSelected(id);
    setPane("settings");
  }
  function add(place: Place, index: number, type: StepType) {
    const step = newStep(type);
    setSteps(insertStep(form.steps, place, index, step));
    select(step.id);
  }
  function discard() {
    setBase(workflow);
    setForm(formFrom(workflow));
  }

  const names: Names = {
    agent: (id) => agents.data?.find((agent) => agent.id === id)?.name,
    member: (id) => {
      const member = members.data?.find((item) => item.user_id === id);
      return member ? (member.display_name ?? member.email) : undefined;
    },
  };
  const on = workflow.status === "on";
  const error = save.error || turn.error || remove.error;
  const menu = [
    dirty && { label: "Discard changes", run: discard, className: "sm:hidden" },
    editable && {
      label: "Delete workflow",
      run: () => setDeleting(true),
      className: "text-danger",
    },
  ].filter((item) => item !== false);

  return (
    <div className="flex h-dvh flex-col bg-background">
      <header className="flex h-14 shrink-0 items-center gap-2 border-b bg-card px-2 sm:gap-3 sm:px-4">
        <Button asChild variant="ghost" size="icon-sm">
          <Link to="/app/workflows" aria-label="Back to workflows">
            <ArrowLeftIcon />
          </Link>
        </Button>
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <h1 className="truncate font-semibold">{form.name || "Untitled workflow"}</h1>
          {form.description && (
            <span className="hidden truncate text-sm text-muted-foreground md:block">
              {form.description}
            </span>
          )}
          {editable && (
            <DetailsDialog
              form={form}
              onSave={(name, description) =>
                setForm((current) => ({ ...current, name, description }))
              }
            />
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <StatusPill
            map={WORKFLOW_STATUS}
            value={workflow.status}
            className="hidden sm:inline-flex"
          />
          <span className="hidden text-xs text-muted-foreground tabular-nums xl:block">
            Version {base.version} · saved {timeAgo(base.updated_at)}
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
              disabled={!dirty || blank || save.busy}
            >
              {save.busy ? "Saving…" : "Save"}
            </Button>
          )}
          {editable && (
            <Button
              size="sm"
              variant={on ? "outline" : "default"}
              onClick={() => turn.run(on ? "off" : "on")}
              disabled={turn.busy || (!on && (dirty || Boolean(workflow.incomplete)))}
            >
              {on ? "Turn off" : "Turn on"}
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

      <div className="border-b px-4 py-2 lg:hidden">
        <Tabs value={pane} onValueChange={setPane}>
          <TabsList>
            <TabsTrigger value="steps">Steps</TabsTrigger>
            <TabsTrigger value="settings">Settings</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <div className="grid min-h-0 flex-1 lg:grid-cols-[3fr_2fr]">
        <div className={cn("min-h-0 overflow-y-auto", pane !== "steps" && "hidden lg:block")}>
          <div className="mx-auto grid max-w-3xl gap-4 p-4 sm:p-6">
            {error && <Notice tone="error">{error}</Notice>}
            <Notice>
              Workflows don't run yet. They start once a channel brings in real conversations.
            </Notice>
            {editable && !on && !dirty && workflow.incomplete && (
              <Notice tone="warning">To turn it on: {workflow.incomplete}</Notice>
            )}
            {editable && dirty && blank && (
              <Notice tone="warning">
                Write the text for each message, note and question before saving.
              </Notice>
            )}
            {editable && atLimit && (
              <Notice tone="warning">A workflow can have at most {MAX_STEPS} steps.</Notice>
            )}
            <div className="py-2">
              <StepDiagram
                trigger={form.trigger}
                steps={form.steps}
                names={names}
                editing={{
                  selected,
                  onSelect: select,
                  ...(editable && !atLimit ? { onAdd: add } : {}),
                }}
              />
            </div>
          </div>
        </div>

        <aside
          className={cn(
            "min-h-0 overflow-y-auto border-l bg-card",
            pane !== "settings" && "hidden lg:block",
          )}
        >
          <SettingsPanel
            form={form}
            selected={selected}
            editable={editable}
            agents={agents.data ?? []}
            members={(members.data ?? []).filter((member) => member.status === "ACTIVE")}
            onTrigger={(trigger) => setForm((current) => ({ ...current, trigger }))}
            onChange={(step) => setSteps(updateStep(form.steps, step))}
            onDelete={(id) => {
              setSteps(removeStep(form.steps, id));
              setSelected(TRIGGER_ID);
            }}
          />
        </aside>
      </div>

      <Dialog open={deleting} onOpenChange={setDeleting}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete this workflow?</DialogTitle>
            <DialogDescription>
              “{workflow.name}” and its steps are removed for good.
            </DialogDescription>
          </DialogHeader>
          {remove.error && <Notice tone="error">{remove.error}</Notice>}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleting(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={() => remove.run()} disabled={remove.busy}>
              {remove.busy ? "Deleting…" : "Delete workflow"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* Name and description: shown in the top bar, edited here, saved with the workflow. */
function DetailsDialog({
  form,
  onSave,
}: {
  form: WorkflowForm;
  onSave: (name: string, description: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(form.name);
  const [description, setDescription] = useState(form.description);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSave(name, description);
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
          <DialogDescription>Saved with the workflow.</DialogDescription>
        </DialogHeader>
        <form className="grid gap-4" onSubmit={submit}>
          <Field label="Name" htmlFor="workflow-name">
            <Input
              id="workflow-name"
              required
              minLength={2}
              maxLength={100}
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </Field>
          <Field label="Description" htmlFor="workflow-description" hint="Shown to your team only.">
            <Textarea
              id="workflow-description"
              rows={2}
              maxLength={300}
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

interface PanelProps {
  form: WorkflowForm;
  selected: string;
  editable: boolean;
  agents: Agent[];
  members: Member[];
  onTrigger: (trigger: WorkflowTrigger) => void;
  onChange: (step: WorkflowStep) => void;
  onDelete: (id: string) => void;
}

function SettingsPanel({ form, selected, editable, onTrigger, onDelete, ...rest }: PanelProps) {
  const step = selected === TRIGGER_ID ? undefined : findStep(form.steps, selected);
  if (!step)
    return (
      <PanelBody icon={ZapIcon} title="Trigger" description="What starts this workflow.">
        <Choices
          name="workflow-trigger"
          value={form.trigger}
          options={Object.entries(TRIGGERS).map(([value, item]) => ({
            value,
            label: item.label,
            hint: item.description,
          }))}
          onChange={(value) => onTrigger(value as WorkflowTrigger)}
          editable={editable}
        />
      </PanelBody>
    );
  const meta = STEP_TYPES[step.type];
  return (
    <PanelBody icon={meta.icon} title={meta.label} description={meta.description}>
      <fieldset disabled={!editable} className="grid gap-4">
        <StepFields key={step.id} step={step} editable={editable} {...rest} />
      </fieldset>
      {editable && (
        <div className="border-t pt-4">
          <Button variant="destructive-outline" size="sm" onClick={() => onDelete(step.id)}>
            {step.type === "branch" ? "Delete branch and its steps" : "Delete step"}
          </Button>
        </div>
      )}
    </PanelBody>
  );
}

function PanelBody({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon: typeof ZapIcon;
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <div className="grid gap-5 p-4 sm:p-5">
      <div className="flex items-start gap-3">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-md border bg-background">
          <Icon className="size-4 text-muted-foreground" aria-hidden="true" />
        </span>
        <div className="grid gap-0.5">
          <h2 className="font-medium">{title}</h2>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
      </div>
      {children}
    </div>
  );
}

interface ChoicesProps {
  name: string;
  value: string;
  options: { value: string; label: string; hint?: string }[];
  onChange: (value: string) => void;
  editable: boolean;
}

function Choices({ name, value, options, onChange, editable }: ChoicesProps) {
  return (
    <fieldset disabled={!editable} className="grid gap-2">
      {options.map((option) => (
        <label
          key={option.value}
          className="flex cursor-pointer gap-3 rounded-lg border p-3 transition-colors hover:bg-background has-[:checked]:border-primary has-[:checked]:bg-accent has-[:disabled]:cursor-default"
        >
          <input
            type="radio"
            name={name}
            value={option.value}
            className="mt-0.5 size-4 shrink-0 accent-primary"
            checked={value === option.value}
            onChange={() => onChange(option.value)}
          />
          <span className="grid gap-0.5">
            <span className="text-sm font-medium">{option.label}</span>
            {option.hint && <span className="text-xs text-muted-foreground">{option.hint}</span>}
          </span>
        </label>
      ))}
    </fieldset>
  );
}

const WAIT_UNITS = [
  { minutes: 1, label: "Minutes" },
  { minutes: 60, label: "Hours" },
  { minutes: 1440, label: "Days" },
];

interface FieldsProps {
  step: WorkflowStep;
  agents: Agent[];
  members: Member[];
  onChange: (step: WorkflowStep) => void;
  editable: boolean;
}

/* One step's settings. Remounted for each step, so local state (the wait's unit) starts afresh. */
function StepFields({ step, agents, members, onChange, editable }: FieldsProps) {
  const [unit, setUnit] = useState(() =>
    step.type === "wait" && step.minutes % 1440 === 0
      ? 1440
      : step.type === "wait" && step.minutes % 60 === 0
        ? 60
        : 1,
  );

  switch (step.type) {
    case "send_message":
    case "add_note":
      return (
        <Field
          label={step.type === "send_message" ? "Message" : "Note"}
          htmlFor="step-text"
          hint={step.type === "add_note" ? "Only your team sees notes." : undefined}
        >
          <Textarea
            id="step-text"
            rows={5}
            maxLength={2000}
            value={step.text}
            onChange={(event) => onChange({ ...step, text: event.target.value })}
          />
        </Field>
      );
    case "ask":
      return (
        <>
          <Field label="Question" htmlFor="step-text">
            <Textarea
              id="step-text"
              rows={3}
              maxLength={2000}
              value={step.text}
              onChange={(event) => onChange({ ...step, text: event.target.value })}
            />
          </Field>
          <Field label="Save the answer as" htmlFor="step-save-to">
            <NativeSelect
              id="step-save-to"
              value={step.save_to}
              onChange={(event) =>
                onChange({ ...step, save_to: event.target.value as typeof step.save_to })
              }
            >
              {Object.entries(CONTACT_FIELDS).map(([value, label]) => (
                <option key={value} value={value}>
                  The contact's {label.toLowerCase()}
                </option>
              ))}
            </NativeSelect>
          </Field>
        </>
      );
    case "hand_to_agent": {
      const agent = agents.find((item) => item.id === step.assistant_id);
      return (
        <>
          <Field label="Agent" htmlFor="step-agent">
            <NativeSelect
              id="step-agent"
              value={step.assistant_id ?? ""}
              onChange={(event) =>
                onChange({
                  id: step.id,
                  type: step.type,
                  assistant_id: event.target.value || undefined,
                })
              }
            >
              <option value="">Pick an agent</option>
              {agents.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </NativeSelect>
          </Field>
          {agent && agent.status !== "live" && (
            <Notice tone="warning">
              {agent.name} isn't published. It answers customers only once it's published.
            </Notice>
          )}
          {!agents.length && (
            <p className="text-sm text-muted-foreground">
              No agents yet.{" "}
              <Link to="/app/assistants" className="text-primary hover:underline">
                Create one in Agents
              </Link>
              .
            </p>
          )}
        </>
      );
    }
    case "assign":
      return (
        <>
          <Choices
            name="step-assign"
            value={step.to}
            options={[
              {
                value: "round_robin",
                label: "The next teammate, in turn",
                hint: "Shared among the teammates who can reply in this project.",
              },
              { value: "member", label: "A specific teammate" },
              { value: "nobody", label: "Nobody", hint: "Unassigns the conversation." },
            ]}
            onChange={(to) =>
              onChange(
                to === "member"
                  ? {
                      id: step.id,
                      type: step.type,
                      to,
                      ...(step.member_id ? { member_id: step.member_id } : {}),
                    }
                  : { id: step.id, type: step.type, to: to as "round_robin" | "nobody" },
              )
            }
            editable={editable}
          />
          {step.to === "member" && (
            <Field
              label="Teammate"
              htmlFor="step-member"
              hint="Members need access to this project, in Settings → Projects."
            >
              <NativeSelect
                id="step-member"
                value={step.member_id ?? ""}
                onChange={(event) =>
                  onChange({ ...step, member_id: event.target.value || undefined })
                }
              >
                <option value="">Pick a teammate</option>
                {members.map((member) => (
                  <option key={member.user_id} value={member.user_id}>
                    {member.display_name ?? member.email}
                  </option>
                ))}
              </NativeSelect>
            </Field>
          )}
        </>
      );
    case "wait":
      return (
        <div className="grid grid-cols-2 gap-3">
          <Field label="Wait for" htmlFor="step-wait">
            <Input
              id="step-wait"
              type="number"
              inputMode="numeric"
              min={1}
              max={Math.floor(MAX_WAIT_MINUTES / unit)}
              className="tabular-nums"
              value={step.minutes / unit}
              onChange={(event) =>
                onChange({
                  ...step,
                  minutes: Math.min(
                    MAX_WAIT_MINUTES,
                    Math.max(1, Math.round(Number(event.target.value) * unit) || 1),
                  ),
                })
              }
            />
          </Field>
          <Field label="Unit" htmlFor="step-wait-unit">
            <NativeSelect
              id="step-wait-unit"
              value={unit}
              onChange={(event) => {
                const next = Number(event.target.value);
                setUnit(next);
                onChange({
                  ...step,
                  minutes: Math.min(
                    MAX_WAIT_MINUTES,
                    Math.max(1, Math.round((step.minutes / unit) * next)),
                  ),
                });
              }}
            >
              {WAIT_UNITS.map((item) => (
                <option key={item.minutes} value={item.minutes}>
                  {item.label}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <p className="col-span-2 text-xs text-muted-foreground">At most 7 days.</p>
        </div>
      );
    case "branch":
      return (
        <>
          <Field
            label="Question"
            htmlFor="step-condition"
            hint="Yes and No each run their own steps; then the workflow carries on below the branch."
          >
            <NativeSelect
              id="step-condition"
              value={step.condition}
              onChange={(event) =>
                onChange({ ...step, condition: event.target.value as BranchCondition })
              }
            >
              {Object.entries(CONDITIONS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </NativeSelect>
          </Field>
          {step.condition === "business_hours" && (
            <Notice>
              Business hours aren't set up yet. They'll be a setting for your organization.
            </Notice>
          )}
        </>
      );
    case "close":
      return null;
  }
}
