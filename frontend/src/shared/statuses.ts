import {
  CircleAlertIcon,
  CircleCheckIcon,
  CircleDashedIcon,
  ClockIcon,
  LoaderIcon,
  type LucideIcon,
} from "lucide-react";

/* One place that turns API enums into what people read. Every state carries a
   label and a tone (and sometimes an icon), so colour is never the only cue. */

export type Tone = "neutral" | "info" | "success" | "danger" | "warning" | "violet" | "orange";

export interface StatusMeta {
  label: string;
  tone: Tone;
  icon?: LucideIcon;
}

export type StatusMap = Record<string, StatusMeta>;

export const CONVERSATION_STATUS: StatusMap = {
  AI_ACTIVE: { label: "AI active", tone: "violet" },
  WAITING_FOR_AGENT: { label: "Waiting for agent", tone: "orange" },
  AGENT_ACTIVE: { label: "Agent active", tone: "info" },
  RESOLVED: { label: "Resolved", tone: "success" },
  CLOSED: { label: "Closed", tone: "neutral" },
};

/* processing_status from platform-api. The API gives no step or percentage,
   so there is deliberately no progress bar. */
export const INGESTION_STATUS: StatusMap = {
  PENDING: { label: "Queued", tone: "neutral", icon: ClockIcon },
  PROCESSING: { label: "Processing", tone: "info", icon: LoaderIcon },
  READY: { label: "Ready", tone: "success", icon: CircleCheckIcon },
  FAILED: { label: "Failed", tone: "danger", icon: CircleAlertIcon },
  DISABLED: { label: "Disabled", tone: "neutral", icon: CircleDashedIcon },
};

export const RECORD_STATUS: StatusMap = {
  ACTIVE: { label: "Active", tone: "success" },
  DISABLED: { label: "Disabled", tone: "neutral" },
  ARCHIVED: { label: "Archived", tone: "neutral" },
  ERROR: { label: "Error", tone: "danger" },
  PENDING: { label: "Pending", tone: "orange" },
  APPROVED: { label: "Approved", tone: "success" },
  REJECTED: { label: "Rejected", tone: "neutral" },
};

export const AGENT_LIFECYCLE: StatusMap = {
  DRAFT: { label: "Draft", tone: "neutral" },
  TESTING: { label: "Testing", tone: "info" },
  ACTIVE: { label: "Published", tone: "success" },
  PAUSED: { label: "Paused", tone: "warning" },
  ARCHIVED: { label: "Archived", tone: "neutral" },
};

/** True while the RAG service is still working on something. */
export const isIngesting = (status: string | null | undefined) =>
  status === "PENDING" || status === "PROCESSING";
