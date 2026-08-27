import { apiRequest } from "../../shared/api/client.ts";
import type { AccountResponse, ProfileUpdate } from "../../shared/types.ts";

export const getCurrentAuth = () => apiRequest<AccountResponse>("/api/v1/auth/me");

export const onboardAccount = (organizationName?: string) =>
  apiRequest<AccountResponse>("/api/v1/auth/onboard", {
    method: "POST",
    body: organizationName ? { organization_name: organizationName } : {},
  });

export const syncProfile = (profile: ProfileUpdate) =>
  apiRequest<AccountResponse>("/api/v1/auth/profile", { method: "PATCH", body: profile });

export const revokeAllSessions = () =>
  apiRequest<{ revoked: boolean }>("/api/v1/auth/logout-all", { method: "POST" });
