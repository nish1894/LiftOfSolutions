import { Navigate, Route, Routes, useNavigate } from "react-router-dom";

import type { ReactNode } from "react";

import { useAuth } from "./features/auth/AuthContext.ts";
import Home from "./features/home/Home.tsx";
import Platform from "./features/platform/Platform.tsx";
import SignIn from "./features/auth/SignIn.tsx";
import { SECTION_IDS } from "./features/platform/sections.ts";
import type { User } from "./shared/types.ts";

/** Keeps /app/* for signed-in users only, sending everyone else to sign-in. */
interface RequireAuthProps {
  user: User | null;
  loading: boolean;
  children: ReactNode;
}

function RequireAuth({ user, loading, children }: RequireAuthProps) {
  if (loading) return <LoadingScreen />;
  if (!user) return <Navigate to="/signin" replace />;
  return <>{children}</>;
}

function LoadingScreen() {
  return (
    <main>
      <p className="loading">Loading…</p>
    </main>
  );
}

export default function App() {
  const {
    user,
    memberships,
    joinRequests,
    loading,
    signOut,
    refreshAuth,
    resendVerification,
    saveProfile,
    signOutEverywhere,
  } = useAuth();
  const navigate = useNavigate();

  async function handleSignOut() {
    await signOut();
    navigate("/", { replace: true });
  }

  // Restoring a persisted session is async, so render nothing decisive until it
  // settles — otherwise a signed-in user sees the login screen flash on reload.
  if (loading) return <LoadingScreen />;

  return (
    <Routes>
      {/* "/" is the landing screen for everyone, signed in or not. */}
      <Route path="/" element={<Home user={user} />} />
      <Route path="/signin" element={user ? <Navigate to="/app" replace /> : <SignIn />} />

      <Route path="/app" element={<Navigate to={`/app/${SECTION_IDS[0]}`} replace />} />
      <Route
        path="/app/:section"
        element={
          <RequireAuth user={user} loading={loading}>
            <Platform
              user={user!}
              memberships={memberships}
              joinRequests={joinRequests}
              refreshAuth={refreshAuth}
              resendVerification={resendVerification}
              saveProfile={saveProfile}
              signOutEverywhere={signOutEverywhere}
              onSignOut={handleSignOut}
            />
          </RequireAuth>
        }
      />

      {/* Unknown URLs fall back to the homepage rather than a blank screen. */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
