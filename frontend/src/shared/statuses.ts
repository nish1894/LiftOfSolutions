import {
  CircleAlertIcon,
  CircleCheckIcon,
  CircleDashedIcon,
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
  WAITING_FOR_AGENT: { label: "Waiting for a teammate", tone: "orange" },
  AGENT_ACTIVE: { label: "Agent active", tone: "info" },
  RESOLVED: { label: "Resolved", tone: "success" },
  CLOSED: { label: "Closed", tone: "neutral" },
};

/* A knowledge base's status, from the RAG service. It gives no step or
   percentage, so there is deliberately no progress bar. */
export const INGESTION_STATUS: StatusMap = {
  indexing: { label: "Processing", tone: "info", icon: LoaderIcon },
  ready: { label: "Ready", tone: "success", icon: CircleCheckIcon },
  failed: { label: "Failed", tone: "danger", icon: CircleAlertIcon },
  deleting: { label: "Removing", tone: "neutral", icon: CircleDashedIcon },
};

export const RECORD_STATUS: StatusMap = {
  ACTIVE: { label: "Active", tone: "success" },
  SUSPENDED: { label: "Suspended", tone: "warning" },
  DISABLED: { label: "Disabled", tone: "neutral" },
  ARCHIVED: { label: "Archived", tone: "neutral" },
  ERROR: { label: "Error", tone: "danger" },
  PENDING: { label: "Pending", tone: "orange" },
  ACCEPTED: { label: "Accepted", tone: "success" },
  REVOKED: { label: "Revoked", tone: "neutral" },
  EXPIRED: { label: "Expired", tone: "neutral" },
  APPROVED: { label: "Approved", tone: "success" },
  REJECTED: { label: "Rejected", tone: "neutral" },
};

export const WORKFLOW_STATUS: StatusMap = {
  off: { label: "Off", tone: "neutral" },
  on: { label: "On", tone: "success" },
};

export const AGENT_STATUS: StatusMap = {
  draft: { label: "Draft", tone: "neutral" },
  live: { label: "Published", tone: "success" },
  paused: { label: "Paused", tone: "warning" },
  archived: { label: "Archived", tone: "neutral" },
};

/** True while the RAG service is still working on something. */
export const isIngesting = (status: string | null | undefined) =>
  status === "indexing" || status === "deleting";
