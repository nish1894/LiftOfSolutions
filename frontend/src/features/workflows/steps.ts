import {
  BotIcon,
  CircleCheckBigIcon,
  HourglassIcon,
  type LucideIcon,
  MessageCircleQuestionIcon,
  MessageSquareTextIcon,
  SplitIcon,
  StickyNoteIcon,
  UserRoundPlusIcon,
} from "lucide-react";

import type {
  BranchCondition,
  WorkflowAction,
  WorkflowStep,
  WorkflowTrigger,
} from "@/shared/types.ts";

/* What each trigger, step and question means, and the helpers that edit a workflow's steps. */

/** MAX_STEPS and MAX_WAIT_MINUTES in workflows.types.ts. */
export const MAX_STEPS = 30;
export const MAX_WAIT_MINUTES = 7 * 24 * 60;

/** The trigger's id when it's selected in the editor; step ids are UUIDs, or ids such as "s1" from a template. */
export const TRIGGER_ID = "trigger";

export const TRIGGERS: Record<WorkflowTrigger, { label: string; description: string }> = {
  conversation_opened: {
    label: "Conversation opened",
    description: "A contact starts a new conversation.",
  },
  message_received: {
    label: "Message received",
    description: "The contact sends any message.",
  },
  conversation_closed: {
    label: "Conversation closed",
    description: "A conversation is resolved or closed.",
  },
};

export type StepType = WorkflowStep["type"];

export const STEP_TYPES: Record<
  StepType,
  { label: string; description: string; icon: LucideIcon }
> = {
  send_message: {
    label: "Send message",
    description: "Sends a message to the contact.",
    icon: MessageSquareTextIcon,
  },
  hand_to_agent: {
    label: "Hand to an AI agent",
    description: "The agent answers until it hands the conversation to a person.",
    icon: BotIcon,
  },
  assign: {
    label: "Assign",
    description: "Gives the conversation to a teammate, or unassigns it.",
    icon: UserRoundPlusIcon,
  },
  ask: {
    label: "Ask a question",
    description: "Asks the contact, and saves the answer on the contact.",
    icon: MessageCircleQuestionIcon,
  },
  add_note: {
    label: "Add a note",
    description: "Leaves an internal note only your team sees.",
    icon: StickyNoteIcon,
  },
  wait: {
    label: "Wait",
    description: "Pauses before the next step.",
    icon: HourglassIcon,
  },
  branch: {
    label: "Branch",
    description: "Asks a yes/no question and takes a different path for each answer.",
    icon: SplitIcon,
  },
  close: {
    label: "Close conversation",
    description: "Closes the conversation. The workflow ends here.",
    icon: CircleCheckBigIcon,
  },
};

export const CONDITIONS: Record<BranchCondition, string> = {
  business_hours: "Is it inside business hours?",
  returning_contact: "Has the contact talked to you before?",
  has_email: "Do you have the contact's email?",
};

export const CONTACT_FIELDS = {
  display_name: "Name",
  email: "Email",
  phone: "Phone",
} as const;

export function newStep(type: StepType): WorkflowStep {
  const id = crypto.randomUUID();
  switch (type) {
    case "send_message":
    case "add_note":
      return { id, type, text: "" };
    case "hand_to_agent":
    case "close":
      return { id, type };
    case "assign":
      return { id, type, to: "round_robin" };
    case "ask":
      return { id, type, text: "", save_to: "email" };
    case "wait":
      return { id, type, minutes: 60 };
    case "branch":
      return { id, type, condition: "business_hours", yes: [], no: [] };
  }
}

/** Where a new step goes: the top level, or one side of a branch. */
export interface Place {
  branchId?: string;
  side?: "yes" | "no";
}

export const countSteps = (steps: WorkflowStep[]) =>
  steps.reduce(
    (count, step) => count + 1 + (step.type === "branch" ? step.yes.length + step.no.length : 0),
    0,
  );

export function insertStep(
  steps: WorkflowStep[],
  place: Place,
  index: number,
  step: WorkflowStep,
): WorkflowStep[] {
  const into = <T>(list: T[], item: T) => [...list.slice(0, index), item, ...list.slice(index)];
  if (!place.branchId || !place.side) return into(steps, step);
  if (step.type === "branch") return steps;
  return steps.map((item) =>
    item.id === place.branchId && item.type === "branch"
      ? { ...item, [place.side!]: into(item[place.side!], step) }
      : item,
  );
}

export function updateStep(steps: WorkflowStep[], next: WorkflowStep): WorkflowStep[] {
  const swap = (action: WorkflowAction) =>
    action.id === next.id && next.type !== "branch" ? next : action;
  return steps.map((step) => {
    if (step.id === next.id) return next;
    return step.type === "branch"
      ? { ...step, yes: step.yes.map(swap), no: step.no.map(swap) }
      : step;
  });
}

export function removeStep(steps: WorkflowStep[], id: string): WorkflowStep[] {
  return steps
    .filter((step) => step.id !== id)
    .map((step) =>
      step.type === "branch"
        ? {
            ...step,
            yes: step.yes.filter((action) => action.id !== id),
            no: step.no.filter((action) => action.id !== id),
          }
        : step,
    );
}

export function findStep(steps: WorkflowStep[], id: string): WorkflowStep | undefined {
  for (const step of steps) {
    if (step.id === id) return step;
    if (step.type === "branch") {
      const inside = [...step.yes, ...step.no].find((action) => action.id === id);
      if (inside) return inside;
    }
  }
  return undefined;
}

/** What a step still needs before the workflow can be saved (text) or turned on (the rest). */
export function stepProblem(step: WorkflowStep): string | null {
  if ((step.type === "send_message" || step.type === "add_note") && !step.text.trim())
    return "Write the text";
  if (step.type === "ask" && !step.text.trim()) return "Write the question";
  if (step.type === "hand_to_agent" && !step.assistant_id) return "Pick an agent";
  if (step.type === "assign" && step.to === "member" && !step.member_id) return "Pick a teammate";
  return null;
}

/** Steps with empty text can't be saved; the API refuses them. */
export const hasBlankText = (steps: WorkflowStep[]) =>
  steps
    .flatMap((step) => (step.type === "branch" ? [step, ...step.yes, ...step.no] : [step]))
    .some((step) => "text" in step && !step.text.trim());

export function formatWait(minutes: number) {
  if (minutes % 1440 === 0) return `${minutes / 1440} day${minutes === 1440 ? "" : "s"}`;
  if (minutes % 60 === 0) return `${minutes / 60} hour${minutes === 60 ? "" : "s"}`;
  return `${minutes} minute${minutes === 1 ? "" : "s"}`;
}
