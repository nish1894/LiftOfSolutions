import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { ApiError, apiRequest, apiRequestOptional } from "../../shared/api/client.ts";
import type {
  Agent,
  Channel,
  Conversation,
  Customer,
  Invitation,
  JoinRequest,
  KnowledgeSource,
  Member,
  NotificationFeed,
  Organization,
  Role,
} from "../../shared/types.ts";

/* Query keys are structured so a mutation can invalidate exactly what it
   changed: ["workspace", businessId, "members"] rather than refetching all nine
   workspace endpoints on every write, which is what loadWorkspace() used to do. */
export const workspaceKeys = {
  all: (businessId: string | undefined) => ["workspace", businessId] as const,
  resource: (businessId: string | undefined, resource: string) =>
    ["workspace", businessId, resource] as const,
  notifications: () => ["notifications"] as const,
};

export type WorkspaceResource =
  | "assistants"
  | "sources"
  | "customers"
  | "conversations"
  | "channels"
  | "members"
  | "organization"
  | "joinRequests"
  | "invitations";

export interface WorkspaceData {
  assistants: Agent[];
  sources: KnowledgeSource[];
  customers: Customer[];
  conversations: Conversation[];
  channels: Channel[];
  members: Member[];
  organization: Organization | null;
  joinRequests: JoinRequest[];
  invitations: Invitation[];
}

const base = (businessId: string | undefined) => `/api/v1/businesses/${businessId}`;

// The `T extends object | null` bound is what lets `fallback` be handed to
// placeholderData: react-query rejects a bare T there, since a function-typed
// placeholder means "compute it" rather than "use this value".
function useWorkspaceResource<T extends object | null>(
  businessId: string | undefined,
  resource: WorkspaceResource,
  path: string,
  fallback: T,
  enabled = true,
) {
  return useQuery({
    queryKey: workspaceKeys.resource(businessId, resource),
    queryFn: () => apiRequestOptional<T>(`${base(businessId)}${path}`, fallback),
    enabled: Boolean(businessId) && enabled,
    placeholderData: fallback as never,
  });
}

export interface WorkspaceState {
  data: WorkspaceData;
  loading: boolean;
  refreshing: boolean;
  error: Error | null;
}

export function useWorkspace(
  businessId: string | undefined,
  { canManageTeam }: { canManageTeam: boolean },
): WorkspaceState {
  const assistants = useWorkspaceResource<Agent[]>(businessId, "assistants", "/assistants", []);
  const sources = useWorkspaceResource<KnowledgeSource[]>(
    businessId,
    "sources",
    "/knowledge/sources",
    [],
  );
  const customers = useWorkspaceResource<Customer[]>(businessId, "customers", "/customers", []);
  const conversations = useWorkspaceResource<Conversation[]>(
    businessId,
    "conversations",
    "/conversations",
    [],
  );
  const channels = useWorkspaceResource<Channel[]>(businessId, "channels", "/channels", []);
  const members = useWorkspaceResource<Member[]>(businessId, "members", "/members", []);
  const organization = useWorkspaceResource<Organization | null>(
    businessId,
    "organization",
    "",
    null,
  );
  const joinRequests = useWorkspaceResource<JoinRequest[]>(
    businessId,
    "joinRequests",
    "/join-requests",
    [],
    canManageTeam,
  );
  const invitations = useWorkspaceResource<Invitation[]>(
    businessId,
    "invitations",
    "/invitations",
    [],
    canManageTeam,
  );

  const queries = [
    assistants,
    sources,
    customers,
    conversations,
    channels,
    members,
    organization,
    joinRequests,
    invitations,
  ];

  return {
    data: {
      assistants: assistants.data ?? [],
      sources: sources.data ?? [],
      customers: customers.data ?? [],
      conversations: conversations.data ?? [],
      channels: channels.data ?? [],
      members: members.data ?? [],
      organization: organization.data ?? null,
      joinRequests: joinRequests.data ?? [],
      invitations: invitations.data ?? [],
    },
    // Only the first load blanks the screen; later refetches keep the previous
    // data on screen so the UI does not flicker on every mutation.
    loading: queries.some((query) => query.isLoading),
    refreshing: queries.some((query) => query.isFetching),
    error: (queries.find((query) => query.error)?.error as Error | undefined) ?? null,
  };
}

/** Invalidates one workspace resource, or the whole workspace when omitted. */
export function useInvalidateWorkspace(businessId: string | undefined) {
  const queryClient = useQueryClient();
  return (...resources: WorkspaceResource[]) => {
    if (!resources.length)
      return queryClient.invalidateQueries({ queryKey: workspaceKeys.all(businessId) });
    return Promise.all(
      resources.map((resource) =>
        queryClient.invalidateQueries({ queryKey: workspaceKeys.resource(businessId, resource) }),
      ),
    );
  };
}

export interface ReviewInput {
  requestId: string;
  decision: "APPROVED" | "REJECTED";
  role: Role;
}

export function useReviewJoinRequest(
  businessId: string | undefined,
  { onSettled }: { onSettled?: () => Promise<unknown> } = {},
) {
  const invalidate = useInvalidateWorkspace(businessId);
  return useMutation<{ id: string; status: string; role: Role }, ApiError, ReviewInput>({
    mutationFn: ({ requestId, decision, role }) =>
      apiRequest(`${base(businessId)}/join-requests/${requestId}`, {
        method: "PATCH",
        body: { decision, role },
      }),
    // Approving creates a member and clears the manager's notification, so
    // those are the only caches that can be stale afterwards.
    onSuccess: async () => {
      await invalidate("joinRequests", "members");
      await onSettled?.();
    },
  });
}

export function useNotifications() {
  return useQuery<NotificationFeed, ApiError>({
    queryKey: workspaceKeys.notifications(),
    queryFn: () => apiRequest<NotificationFeed>("/api/v1/notifications?limit=20"),
    // Replaces the hand-rolled setInterval the bell used to run.
    refetchInterval: 30_000,
    placeholderData: { items: [], unread_count: 0 },
  });
}
