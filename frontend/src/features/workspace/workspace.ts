import { createContext, useContext } from "react";
import { type QueryKey, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiRequest, apiRequestOptional, type RequestOptions } from "@/shared/api/client.ts";
import type { PlatformPermission } from "@/shared/permissions.ts";
import type { Membership, User } from "@/shared/types.ts";

/* The organization currently on screen. Every page reads it from here instead
   of receiving it through props. */
export interface WorkspaceValue {
  user: User;
  membership: Membership;
  memberships: Membership[];
  businessId: string;
  can: (permission: PlatformPermission) => boolean;
  selectBusiness: (businessId: string) => void;
}

export const WorkspaceContext = createContext<WorkspaceValue | null>(null);

export function useWorkspace(): WorkspaceValue {
  const value = useContext(WorkspaceContext);
  if (!value) throw new Error("useWorkspace must be called inside <WorkspaceProvider>");
  return value;
}

export const orgPath = (businessId: string, path: string) =>
  `/api/v1/businesses/${businessId}${path}`;

type Interval<T> = number | false | ((data: T | undefined) => number | false);

interface OrgQueryOptions<T> {
  enabled?: boolean;
  /** Poll only while it's useful, e.g. while a document is still processing. */
  refetchInterval?: Interval<T>;
}

/**
 * Reads one organization resource. Keys start with ["workspace", businessId]
 * so switching organizations never shows another tenant's cached data.
 * A 403/404 becomes `fallback`: a missing permission is an empty screen.
 */
export function useOrgQuery<T>(
  key: QueryKey,
  path: string,
  fallback: T,
  { enabled = true, refetchInterval = false }: OrgQueryOptions<T> = {},
) {
  const { businessId } = useWorkspace();
  return useQuery({
    queryKey: ["workspace", businessId, ...key],
    queryFn: () => apiRequestOptional<T>(orgPath(businessId, path), fallback),
    enabled,
    refetchInterval:
      typeof refetchInterval === "function"
        ? (query) => refetchInterval(query.state.data as T | undefined)
        : refetchInterval,
  });
}

/** Writes to the current organization and refreshes what changed. */
export function useOrgMutation() {
  const { businessId } = useWorkspace();
  const queryClient = useQueryClient();
  return {
    request: <T>(path: string, options?: RequestOptions) =>
      apiRequest<T>(orgPath(businessId, path), options),
    invalidate: (...key: unknown[]) =>
      queryClient.invalidateQueries({ queryKey: ["workspace", businessId, ...key] }),
  };
}
