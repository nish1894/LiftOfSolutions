import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { ApiError, apiRequest } from "./api/client.ts";
import type { NotificationFeed, Role } from "./types.ts";

export const notificationsKey = ["notifications"] as const;

export interface ReviewInput {
  requestId: string;
  decision: "APPROVED" | "REJECTED";
  role: Role;
}

export function useReviewJoinRequest(
  businessId: string,
  { onSettled }: { onSettled?: () => Promise<unknown> } = {},
) {
  const queryClient = useQueryClient();
  return useMutation<{ id: string; status: string; role: Role }, ApiError, ReviewInput>({
    mutationFn: ({ requestId, decision, role }) =>
      apiRequest(`/api/v1/businesses/${businessId}/join-requests/${requestId}`, {
        method: "PATCH",
        body: { decision, role },
      }),
    // Approving creates a member and clears the manager's notification, so
    // those are the only caches that can be stale afterwards.
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["workspace", businessId, "joinRequests"] }),
        queryClient.invalidateQueries({ queryKey: ["workspace", businessId, "members"] }),
      ]);
      await onSettled?.();
    },
  });
}

export function useNotifications() {
  return useQuery<NotificationFeed, ApiError>({
    queryKey: notificationsKey,
    queryFn: () => apiRequest<NotificationFeed>("/api/v1/notifications?limit=20"),
    refetchInterval: 30_000,
    placeholderData: { items: [], unread_count: 0 },
  });
}
