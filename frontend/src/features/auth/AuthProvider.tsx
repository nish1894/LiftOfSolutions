import { type ReactNode, useEffect, useMemo, useState } from "react";
import {
  GithubAuthProvider,
  GoogleAuthProvider,
  type AuthProvider as FirebaseAuthProvider,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut as firebaseSignOut,
  updateProfile,
} from "firebase/auth";

import { ApiError } from "../../shared/api/client.ts";
import { firebaseAuth } from "../../shared/firebase.ts";
import type { AccountResponse, ProfileUpdate } from "../../shared/types.ts";
import {
  AuthContext,
  type AuthValue,
  type Credentials,
  type OAuthProvider,
} from "./AuthContext.ts";
import { getCurrentAuth, onboardAccount, revokeAllSessions, syncProfile } from "./api.ts";

const providers: Record<OAuthProvider, () => FirebaseAuthProvider> = {
  google: () => new GoogleAuthProvider(),
  github: () => new GithubAuthProvider(),
};

function friendlyAuthError(error: unknown): Error {
  const messages: Record<string, string> = {
    "auth/email-already-in-use": "An account already uses this email.",
    "auth/invalid-credential": "The email or password is incorrect.",
    "auth/invalid-email": "Enter a valid email address.",
    "auth/popup-closed-by-user": "The sign-in window was closed.",
    "auth/too-many-requests": "Too many attempts. Please try again later.",
    "auth/weak-password": "Use a stronger password with at least 8 characters.",
  };
  const code = (error as { code?: string } | null)?.code;
  const message = (error as { message?: string } | null)?.message;
  return new Error((code && messages[code]) || message || "Authentication failed.");
}

/** A 409 means Firebase knows this user but the platform has no profile yet. */
async function loadPlatformAccount(): Promise<AccountResponse> {
  try {
    return await getCurrentAuth();
  } catch (error) {
    if (error instanceof ApiError && error.status === 409) return onboardAccount();
    throw error;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [auth, setAuth] = useState<AccountResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(
    () =>
      onAuthStateChanged(firebaseAuth, async (firebaseUser) => {
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
      const next = await onboardAccount();
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

  const value = useMemo<AuthValue>(
    () => ({
      user: auth?.user ?? null,
      memberships: auth?.memberships ?? [],
      joinRequests: auth?.join_requests ?? [],
      loading,
      signIn,
      signUp,
      signInWithOAuth,
      signOut,
      refreshAuth,
      resetPassword,
      resendVerification,
      saveProfile,
      signOutEverywhere,
    }),
    // The callbacks close over setAuth only, which React guarantees is stable;
    // the account snapshot and loading flag are the real inputs.
    [auth, loading],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
