import type { ComponentType, ReactNode } from "react";
import { CircleAlertIcon, PlusIcon, ZapIcon } from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/menu.tsx";
import { cn } from "@/lib/utils.ts";
import type {
  WorkflowAction,
  WorkflowBranch,
  WorkflowStep,
  WorkflowTrigger,
} from "@/shared/types.ts";

import {
  CONDITIONS,
  CONTACT_FIELDS,
  formatWait,
  type Place,
  STEP_TYPES,
  type StepType,
  stepProblem,
  TRIGGER_ID,
  TRIGGERS,
} from "./steps.ts";

export interface Names {
  agent: (id: string) => string | undefined;
  member: (id: string) => string | undefined;
}

interface Editing {
  selected: string | null;
  onSelect: (id: string) => void;
  /** Leave out to hide the add buttons, e.g. at the step limit. */
  onAdd?: (place: Place, index: number, type: StepType) => void;
}

interface DiagramProps {
  trigger: WorkflowTrigger;
  steps: WorkflowStep[];
  names?: Names;
  /** Leave out for a read-only diagram, as on a template's page. */
  editing?: Editing;
}

/* A workflow drawn top to bottom: the trigger, each step, and a branch's yes and no paths side by side.
   The paths join again after a branch. */
export function StepDiagram({ trigger, steps, names, editing }: DiagramProps) {
  return (
    <div className="mx-auto flex w-full max-w-md flex-col">
      <Node
        id={TRIGGER_ID}
        icon={ZapIcon}
        label="When"
        summary={TRIGGERS[trigger].label}
        editing={editing}
      />
      <StepList steps={steps} place={{}} names={names} editing={editing} />
      <span className="mx-auto rounded-md border bg-card px-2 py-0.5 text-xs text-muted-foreground">
        End
      </span>
    </div>
  );
}

interface ListProps {
  steps: WorkflowStep[];
  place: Place;
  names?: Names | undefined;
  editing?: Editing | undefined;
}

function StepList({ steps, place, names, editing }: ListProps) {
  const inBranch = Boolean(place.branchId);
  const add = (index: number) =>
    editing?.onAdd && (
      <AddStep inBranch={inBranch} onAdd={(type) => editing.onAdd!(place, index, type)} />
    );
  return (
    <ol className="flex flex-col">
      {steps.map((step, index) => (
        <li key={step.id} className="flex flex-col">
          <Connector>{add(index)}</Connector>
          <Node
            id={step.id}
            icon={STEP_TYPES[step.type].icon}
            label={STEP_TYPES[step.type].label}
            summary={summary(step, names)}
            problem={editing ? stepProblem(step) : null}
            editing={editing}
            compact={inBranch}
          />
          {step.type === "branch" && <Paths branch={step} names={names} editing={editing} />}
        </li>
      ))}
      {inBranch && !steps.length && !editing && (
        <li className="py-2 text-center text-xs text-muted-foreground">Nothing</li>
      )}
      <Connector>{add(steps.length)}</Connector>
    </ol>
  );
}

function Paths({
  branch,
  names,
  editing,
}: {
  branch: WorkflowBranch;
  names?: Names | undefined;
  editing?: Editing | undefined;
}) {
  return (
    <>
      <Connector />
      <div className="grid grid-cols-2 gap-2 rounded-xl border border-dashed p-2 sm:gap-3 sm:p-3">
        {(["yes", "no"] as const).map((side) => (
          <div key={side} className="flex min-w-0 flex-col">
            <span className="mx-auto rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-subtle-foreground">
              {side === "yes" ? "Yes" : "No"}
            </span>
            <StepList
              steps={branch[side]}
              place={{ branchId: branch.id, side }}
              names={names}
              editing={editing}
            />
          </div>
        ))}
      </div>
    </>
  );
}

function Connector({ children }: { children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center" aria-hidden={children ? undefined : true}>
      <span className="h-3 w-px bg-border" />
      {children}
      <span className={cn("w-px bg-border", children ? "h-3" : "h-0")} />
    </div>
  );
}

interface NodeProps {
  id: string;
  icon: ComponentType<{ className?: string }>;
  label: string;
  summary: string;
  problem?: string | null;
  editing?: Editing | undefined;
  compact?: boolean;
}

function Node({ id, icon: Icon, label, summary, problem, editing, compact }: NodeProps) {
  const selected = editing?.selected === id;
  const body = (
    <>
      <span
        className={cn(
          "flex size-8 shrink-0 items-center justify-center rounded-md border bg-background",
          compact && "hidden sm:flex",
        )}
      >
        <Icon className="size-4 text-muted-foreground" />
      </span>
      <span className="grid min-w-0 gap-0.5 text-left">
        <span className="text-xs text-muted-foreground">{label}</span>
        <span className="line-clamp-2 text-sm break-words">{summary}</span>
        {problem && (
          <span className="flex items-center gap-1 text-xs text-warning">
            <CircleAlertIcon className="size-3.5 shrink-0" />
            {problem}
          </span>
        )}
      </span>
    </>
  );
  const box = cn(
    "flex w-full items-start gap-3 rounded-lg border bg-card p-3",
    compact && "p-2.5",
    selected && "border-primary ring-1 ring-primary",
  );
  if (!editing) return <div className={box}>{body}</div>;
  return (
    <button
      type="button"
      className={cn(
        box,
        "transition-colors outline-none hover:bg-background focus-visible:ring-2 focus-visible:ring-ring",
      )}
      aria-pressed={selected}
      onClick={() => editing.onSelect(id)}
    >
      {body}
    </button>
  );
}

function AddStep({ inBranch, onAdd }: { inBranch: boolean; onAdd: (type: StepType) => void }) {
  const types = (Object.keys(STEP_TYPES) as StepType[]).filter(
    (type) => !inBranch || type !== "branch",
  );
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="Add a step here"
          className="flex size-6 items-center justify-center rounded-full border bg-card text-muted-foreground transition-colors outline-none hover:border-primary hover:text-primary focus-visible:ring-2 focus-visible:ring-ring"
        >
          <PlusIcon className="size-3.5" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="center" className="w-64">
        <DropdownMenuLabel>Add a step</DropdownMenuLabel>
        {types.map((type) => {
          const { icon: Icon, label, description } = STEP_TYPES[type];
          return (
            <DropdownMenuItem key={type} onSelect={() => onAdd(type)} className="items-start">
              <Icon className="mt-0.5 size-4 text-muted-foreground" />
              <span className="grid gap-0.5">
                <span>{label}</span>
                <span className="text-xs text-muted-foreground">{description}</span>
              </span>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function summary(step: WorkflowStep | WorkflowAction, names?: Names) {
  switch (step.type) {
    case "send_message":
    case "add_note":
      return step.text || "No text yet";
    case "ask":
      return step.text
        ? `${step.text} Saves the answer as ${CONTACT_FIELDS[step.save_to].toLowerCase()}.`
        : "No question yet";
    case "hand_to_agent":
      return step.assistant_id ? (names?.agent(step.assistant_id) ?? "An agent") : "Your AI agent";
    case "assign":
      if (step.to === "round_robin") return "The next teammate, in turn";
      if (step.to === "nobody") return "Nobody: unassign";
      return step.member_id ? (names?.member(step.member_id) ?? "A teammate") : "A teammate";
    case "wait":
      return formatWait(step.minutes);
    case "branch":
      return CONDITIONS[step.condition];
    case "close":
      return "The workflow ends here.";
  }
}
