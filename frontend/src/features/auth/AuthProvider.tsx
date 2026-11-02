import { type ReactNode, useEffect, useMemo, useState } from "react";
import {
  EmailAuthProvider,
  GoogleAuthProvider,
  type AuthProvider as FirebaseAuthProvider,
  type User as FirebaseUser,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  reauthenticateWithCredential,
  reauthenticateWithPopup,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut as firebaseSignOut,
  updatePassword,
  updateProfile,
} from "firebase/auth";

import { toast } from "sonner";

import { ApiError } from "../../shared/api/client.ts";
import { firebaseAuth } from "../../shared/firebase.ts";
import type { AccountResponse, ProfileUpdate } from "../../shared/types.ts";
import {
  AuthContext,
  type AuthValue,
  type Credentials,
  type OAuthProvider,
} from "./AuthContext.ts";
import {
  acceptTerms as acceptTermsRequest,
  getCurrentAuth,
  onboardAccount,
  revokeAllSessions,
  syncProfile,
} from "./api.ts";

const providers: Record<OAuthProvider, () => FirebaseAuthProvider> = {
  google: () => new GoogleAuthProvider(),
};

function friendlyAuthError(error: unknown): Error {
  const messages: Record<string, string> = {
    "auth/email-already-in-use": "An account already uses this email.",
    "auth/invalid-credential": "The email or password is incorrect.",
    "auth/invalid-email": "Enter a valid email address.",
    "auth/popup-closed-by-user": "The sign-in window was closed.",
    "auth/too-many-requests": "Too many attempts. Please try again later.",
    "auth/weak-password": "Use a stronger password with at least 8 characters.",
    "auth/wrong-password": "The current password is incorrect.",
    "auth/provider-already-linked": "This account already has a password.",
    "auth/credential-already-in-use": "Another account already uses this email with a password.",
  };
  const code = (error as { code?: string } | null)?.code;
  const message = (error as { message?: string } | null)?.message;
  return new Error((code && messages[code]) || message || "Authentication failed.");
}

const hasPasswordSignIn = (user: FirebaseUser | null) =>
  Boolean(user?.providerData.some((provider) => provider.providerId === "password"));

/** A 409 means Firebase knows this user but the platform has no profile yet. */
async function loadPlatformAccountOnce(): Promise<AccountResponse> {
  const url = new URL(window.location.href);
  const next = url.pathname === "/signin" ? url.searchParams.get("next") : null;
  const destination =
    next?.startsWith("/app") && !next.startsWith("//") ? new URL(next, url.origin) : url;
  const invitationToken = destination.searchParams.get("invite") || undefined;
  const clearInvitation = () => {
    destination.searchParams.delete("invite");
    if (destination !== url)
      url.searchParams.set("next", destination.pathname + destination.search + destination.hash);
    window.history.replaceState(null, "", url);
  };
  let account: AccountResponse;
  try {
    account = await getCurrentAuth();
  } catch (error) {
    if (error instanceof ApiError && error.status === 409 && error.code === "onboarding_required") {
      const readyInvite = firebaseAuth.currentUser?.emailVerified ? invitationToken : undefined;
      try {
        account = await onboardAccount(undefined, readyInvite);
      } catch (onboardError) {
        // A used or expired link must not stop a new person signing up: start without it.
        if (!(readyInvite && isUnusableInvitation(onboardError))) throw onboardError;
        toast.error((onboardError as ApiError).message);
        account = await onboardAccount(undefined, undefined);
      }
      if (readyInvite) clearInvitation();
    } else {
      throw error;
    }
  }
  // Someone who already has an account joins only after reading what it means for their
  // workspace: the ?invite= link stays in the URL for JoinInvitationDialog.
  return account;
}

const isUnusableInvitation = (error: unknown) =>
  error instanceof ApiError && error.code === "invitation_invalid";

let pendingAccountLoad: { uid: string; promise: Promise<AccountResponse> } | null = null;
function loadPlatformAccount(): Promise<AccountResponse> {
  const uid = firebaseAuth.currentUser?.uid ?? "";
  if (pendingAccountLoad?.uid === uid) return pendingAccountLoad.promise;
  const promise = loadPlatformAccountOnce().finally(() => {
    if (pendingAccountLoad?.promise === promise) pendingAccountLoad = null;
  });
  pendingAccountLoad = { uid, promise };
  return promise;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [auth, setAuth] = useState<AccountResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [hasPassword, setHasPassword] = useState(false);

  useEffect(
    () =>
      onAuthStateChanged(firebaseAuth, async (firebaseUser) => {
        setHasPassword(hasPasswordSignIn(firebaseUser));
        if (!firebaseUser) {
          setAuth(null);
          setLoading(false);
          return;
        }
        try {
          setAuth(await loadPlatformAccount());
        } catch (error) {
          console.error("Unable to load the platform account.", error);
          setAuth(null);
        } finally {
          setLoading(false);
        }
      }),
    [],
  );

  async function signIn({ email, password }: Credentials): Promise<AccountResponse> {
    try {
      await signInWithEmailAndPassword(firebaseAuth, email, password);
      const next = await loadPlatformAccount();
      setAuth(next);
      return next;
    } catch (error) {
      throw friendlyAuthError(error);
    }
  }

  async function signUp({ email, password, displayName }: Credentials): Promise<AccountResponse> {
    try {
      const credential = await createUserWithEmailAndPassword(firebaseAuth, email, password);
      if (displayName) await updateProfile(credential.user, { displayName });
      await sendEmailVerification(credential.user);
      await credential.user.getIdToken(true);
      const next = await loadPlatformAccount();
      setAuth(next);
      return next;
    } catch (error) {
      throw friendlyAuthError(error);
    }
  }

  async function signInWithOAuth(provider: OAuthProvider): Promise<AccountResponse> {
    const createProvider = providers[provider];
    if (!createProvider) throw new Error("Unsupported sign-in provider.");
    try {
      await signInWithPopup(firebaseAuth, createProvider());
      const next = await loadPlatformAccount();
      setAuth(next);
      return next;
    } catch (error) {
      throw friendlyAuthError(error);
    }
  }

  async function signOut(): Promise<void> {
    await firebaseSignOut(firebaseAuth);
    setAuth(null);
  }

  async function refreshAuth(): Promise<AccountResponse> {
    if (firebaseAuth.currentUser) {
      await firebaseAuth.currentUser.reload();
      await firebaseAuth.currentUser.getIdToken(true);
    }
    const next = await loadPlatformAccount();
    setAuth(next);
    return next;
  }

  async function resetPassword(email: string): Promise<void> {
    try {
      await sendPasswordResetEmail(firebaseAuth, email);
    } catch (error) {
      throw friendlyAuthError(error);
    }
  }

  async function resendVerification(): Promise<void> {
    if (!firebaseAuth.currentUser) throw new Error("Sign in first.");
    await sendEmailVerification(firebaseAuth.currentUser);
  }

  async function saveProfile(profile: ProfileUpdate): Promise<AccountResponse> {
    const firebaseProfile: { displayName?: string | null; photoURL?: string | null } = {};
    if (profile.display_name !== undefined)
      firebaseProfile.displayName = profile.display_name || null;
    if (profile.photo_url !== undefined) firebaseProfile.photoURL = profile.photo_url || null;
    if (firebaseAuth.currentUser && Object.keys(firebaseProfile).length) {
      await updateProfile(firebaseAuth.currentUser, firebaseProfile);
    }
    const next = await syncProfile(profile);
    setAuth(next);
    return next;
  }

  async function signOutEverywhere(): Promise<void> {
    await revokeAllSessions();
    await firebaseSignOut(firebaseAuth);
    setAuth(null);
  }

  async function acceptTerms(version: string): Promise<AccountResponse> {
    await acceptTermsRequest(version);
    const next = await loadPlatformAccount();
    setAuth(next);
    return next;
  }

  /* Adds a password to an account that signs in with Google, or changes an existing one.
     Firebase wants a recent sign-in first: the current password, or Google again. */
  async function setPassword(newPassword: string, currentPassword?: string): Promise<void> {
    const user = firebaseAuth.currentUser;
    if (!user?.email) throw new Error("This account has no email address to sign in with.");
    try {
      if (hasPasswordSignIn(user)) {
        await reauthenticateWithCredential(
          user,
          EmailAuthProvider.credential(user.email, currentPassword ?? ""),
        );
        await updatePassword(user, newPassword);
      } else {
        // updatePassword also adds password sign-in. linkWithCredential would too, but Firebase
        // then marks the email unverified, though Google already verified it.
        try {
          await updatePassword(user, newPassword);
        } catch (error) {
          if ((error as { code?: string }).code !== "auth/requires-recent-login") throw error;
          await reauthenticateWithPopup(user, new GoogleAuthProvider());
          await updatePassword(user, newPassword);
        }
      }
      // A new password signs other devices out; this one gets a fresh token.
      await user.getIdToken(true);
      setHasPassword(true);
    } catch (error) {
      throw friendlyAuthError(error);
    }
  }

  const value = useMemo<AuthValue>(
    () => ({
      user: auth?.user ?? null,
      memberships: auth?.memberships ?? [],
      projects: auth?.projects ?? [],
      joinRequests: auth?.join_requests ?? [],
      loading,
      signIn,
      signUp,
      signInWithOAuth,
      signOut,
      refreshAuth,
      resetPassword,
      hasPassword,
      setPassword,
      resendVerification,
      saveProfile,
      signOutEverywhere,
      acceptTerms,
    }),
    // The callbacks close over setAuth only, which React guarantees is stable;
    // the account snapshot and loading flag are the real inputs.
    [auth, loading, hasPassword],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
