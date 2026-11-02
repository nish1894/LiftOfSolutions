import { conversationsQuery } from "@/features/inbox/inbox.ts";
import { useToolApprovals } from "@/features/workspace/resources.ts";
import { useOrgQuery, useWorkspace } from "@/features/workspace/workspace.ts";
import type { Conversation } from "@/shared/types.ts";

import { CONVERSATION_LIMIT } from "@/features/inbox/inbox.ts";
import { TOOL_RUN_LIMIT } from "@/features/workspace/resources.ts";
import { cappedCount } from "@/lib/utils.ts";

import type { NavBadge } from "./navigation.ts";

const BADGE_LIMITS: Record<NavBadge, number> = {
  waiting: CONVERSATION_LIMIT,
  requests: TOOL_RUN_LIMIT,
};
/** How a badge shows its count: "50+" once the list it comes from is full. */
export const badgeLabel = (badge: NavBadge, count: number) =>
  cappedCount(count, BADGE_LIMITS[badge]);

const MINUTE = 60_000;

/** Sidebar numbers: work that is waiting for someone. Refreshed once a minute. */
export function useNavCounts(): Record<NavBadge, number> {
  const { can } = useWorkspace();
  const waitingQuery = conversationsQuery("WAITING_FOR_AGENT");
  const waiting = useOrgQuery<Conversation[]>(waitingQuery.key, waitingQuery.path, [], {
    enabled: can("conversations.view"),
    refetchInterval: MINUTE,
  });
  const requests = useToolApprovals(MINUTE);

  return {
    waiting: waiting.data?.length ?? 0,
    requests: requests.data?.length ?? 0,
  };
}
