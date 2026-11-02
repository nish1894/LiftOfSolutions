import type {
  Agent,
  Channel,
  Customer,
  KnowledgeSource,
  Member,
  Organization,
} from "@/shared/types.ts";

import { isIngesting } from "@/shared/statuses.ts";

import { useOrgQuery, useWorkspace } from "./workspace.ts";

/* Lists several screens share. One key per resource means one cache entry,
   so moving between pages doesn't refetch the same data. */

export function useAgents() {
  const { can } = useWorkspace();
  return useOrgQuery<Agent[]>(["agents"], "/assistants", [], { enabled: can("agents.view") });
}

/** Checks again every 10 seconds while the AI service is still reading a source. */
export function useSources() {
  const { can } = useWorkspace();
  return useOrgQuery<KnowledgeSource[]>(["sources"], "/knowledge/sources", [], {
    enabled: can("knowledge.view"),
    refetchInterval: (data) =>
      data?.some((source) => isIngesting(source.status)) ? 10_000 : false,
  });
}

/** Lists the API caps; counts and searches over them are marked as partial at the cap. */
export const CONTACT_LIMIT = 200;
export const TOOL_RUN_LIMIT = 100;

export function useCustomers() {
  const { can } = useWorkspace();
  return useOrgQuery<Customer[]>(["customers"], `/customers?limit=${CONTACT_LIMIT}`, [], {
    enabled: can("customers.view"),
  });
}

export function useMembers() {
  const { can } = useWorkspace();
  return useOrgQuery<Member[]>(["members"], "/members", [], {
    enabled: can("organization.members.view"),
  });
}

export function useChannels() {
  const { can } = useWorkspace();
  return useOrgQuery<Channel[]>(["channels"], "/channels", [], { enabled: can("channels.view") });
}

export function useOrganization() {
  const { can } = useWorkspace();
  return useOrgQuery<Organization | null>(["organization"], "", null, {
    enabled: can("organization.view"),
  });
}

/** A tool call an agent wants to make, waiting for a person to allow it. */
export interface ToolApproval {
  id: string;
  tool_name: string;
  arguments: Record<string, unknown>;
  agent_id?: string;
  conversation_id?: string;
  /** False when running it twice would do the thing twice (a refund, an email). */
  idempotent?: boolean;
  created_at: string;
  approval_expires_at?: string;
}

export function useToolApprovals(refetchInterval: number | false = false) {
  const { can } = useWorkspace();
  return useOrgQuery<ToolApproval[]>(["toolApprovals"], "/tool-runs?status=pending_approval", [], {
    enabled: can("tools.view"),
    refetchInterval,
  });
}
