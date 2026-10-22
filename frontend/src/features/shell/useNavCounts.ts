import { conversationsQuery } from "@/features/inbox/inbox.ts";
import { useSources } from "@/features/workspace/resources.ts";
import { useOrgQuery, useWorkspace } from "@/features/workspace/workspace.ts";
import type { Conversation, JoinRequest } from "@/shared/types.ts";

import type { NavBadge } from "./navigation.ts";

const MINUTE = 60_000;

/** Sidebar numbers: work that is waiting for someone. Refreshed once a minute. */
export function useNavCounts(): Record<NavBadge, number> {
  const { can } = useWorkspace();
  const waitingQuery = conversationsQuery("WAITING_FOR_AGENT");
  const waiting = useOrgQuery<Conversation[]>(waitingQuery.key, waitingQuery.path, [], {
    enabled: can("conversations.view"),
    refetchInterval: MINUTE,
  });
  const requests = useOrgQuery<JoinRequest[]>(["joinRequests"], "/join-requests", [], {
    enabled: can("organization.members.manage"),
    refetchInterval: MINUTE,
  });
  const sources = useSources();

  return {
    waiting: waiting.data?.length ?? 0,
    requests: requests.data?.filter((item) => item.status === "PENDING").length ?? 0,
    failedKnowledge:
      sources.data?.filter((item) => item.processing_status === "FAILED").length ?? 0,
  };
}
