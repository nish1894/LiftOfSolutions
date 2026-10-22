import type {
  Agent,
  Channel,
  Customer,
  KnowledgeSource,
  Member,
  Organization,
} from "@/shared/types.ts";

import { useOrgQuery, useWorkspace } from "./workspace.ts";

/* Lists several screens share. One key per resource means one cache entry,
   so moving between pages doesn't refetch the same data. */

export function useAgents() {
  const { can } = useWorkspace();
  return useOrgQuery<Agent[]>(["agents"], "/assistants", [], { enabled: can("agents.view") });
}

export function useSources() {
  const { can } = useWorkspace();
  return useOrgQuery<KnowledgeSource[]>(["sources"], "/knowledge/sources", [], {
    enabled: can("knowledge.view"),
  });
}

export function useCustomers() {
  const { can } = useWorkspace();
  return useOrgQuery<Customer[]>(["customers"], "/customers?limit=200", [], {
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
