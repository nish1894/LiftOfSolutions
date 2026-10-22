import type { Agent } from "@/shared/types.ts";

/** True when customers aren't getting the latest saved draft yet. */
export const hasUnpublishedChanges = (agent: Agent) =>
  agent.lifecycle_status !== "ACTIVE" || agent.active_version_id !== agent.draft_version_id;
