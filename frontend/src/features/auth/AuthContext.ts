import { createContext, useContext } from "react";

import type {
  AccountResponse,
  Membership,
  Project,
  OwnJoinRequest,
  ProfileUpdate,
  User,
} from "../../shared/types.ts";

export type OAuthProvider = "google";

export interface Credentials {
  email: string;
  password: string;
  displayName?: string;
}

export interface AuthValue {
  user: User | null;
  memberships: Membership[];
  projects: Project[];
  joinRequests: OwnJoinRequest[];
  loading: boolean;
  signIn: (credentials: Credentials) => Promise<AccountResponse>;
  signUp: (credentials: Credentials) => Promise<AccountResponse>;
  signInWithOAuth: (provider: OAuthProvider) => Promise<AccountResponse>;
  signOut: () => Promise<void>;
  refreshAuth: () => Promise<AccountResponse>;
  resetPassword: (email: string) => Promise<void>;
  /** Whether this account can sign in with email and password, not only Google. */
  hasPassword: boolean;
  /** Adds a password (Google-only accounts) or changes it (needs the current one). */
  setPassword: (newPassword: string, currentPassword?: string) => Promise<void>;
  resendVerification: () => Promise<void>;
  saveProfile: (profile: ProfileUpdate) => Promise<AccountResponse>;
  signOutEverywhere: () => Promise<void>;
  acceptTerms: (version: string) => Promise<AccountResponse>;
}

/* Kept apart from AuthProvider.tsx so that file exports only components. A
   module mixing components with plain functions breaks Vite's Fast Refresh,
   which is what react-refresh/only-export-components warns about. */
export const AuthContext = createContext<AuthValue | null>(null);

export function useAuth(): AuthValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be called inside <AuthProvider>");
  return context;
}
