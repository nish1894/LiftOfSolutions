import { apiRequest } from "../../shared/api/client.ts";
import type { AccountResponse, ProfileUpdate, Role } from "../../shared/types.ts";

export const getCurrentAuth = () => apiRequest<AccountResponse>("/api/v1/auth/me");

export const onboardAccount = (organizationName?: string, invitationToken?: string) =>
  apiRequest<AccountResponse>("/api/v1/auth/onboard", {
    method: "POST",
    body: {
      ...(organizationName ? { organization_name: organizationName } : {}),
      ...(invitationToken ? { invitation_token: invitationToken } : {}),
    },
  });

/** What accepting an invitation would mean for the signed-in person. Changes nothing. */
export interface InvitationPreview {
  organization_name: string;
  role: Role;
  current_organization_name: string;
  projects_left_behind: number;
  already_member: boolean;
}

export const previewInvitation = (token: string) =>
  apiRequest<InvitationPreview>("/api/v1/auth/invitations/preview", {
    method: "POST",
    body: { token },
  });

export const acceptInvitation = (token: string) =>
  apiRequest<AccountResponse>("/api/v1/auth/invitations/accept", {
    method: "POST",
    body: { token },
  });

export const acceptTerms = (version: string) =>
  apiRequest<AccountResponse>("/api/v1/auth/terms", {
    method: "POST",
    body: { version, accepted: true },
  });

export const syncProfile = (profile: ProfileUpdate) =>
  apiRequest<AccountResponse>("/api/v1/auth/profile", { method: "PATCH", body: profile });

export const revokeAllSessions = () =>
  apiRequest<{ revoked: boolean }>("/api/v1/auth/logout-all", { method: "POST" });
