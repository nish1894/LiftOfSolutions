import { lazy, type ReactNode, Suspense } from "react";
import { Navigate, Route, Routes, useLocation, useParams } from "react-router-dom";

import { useAuth } from "./features/auth/AuthContext.ts";
import SignIn from "./features/auth/SignIn.tsx";
import Home from "./features/home/Home.tsx";
import AppLayout from "./features/shell/AppLayout.tsx";
import { pathForSection } from "./features/shell/navigation.ts";
import NotFound from "./features/shell/NotFound.tsx";
import { WorkspaceProvider } from "./features/workspace/WorkspaceProvider.tsx";
import BrandMark from "./shared/ui/BrandMark.tsx";

/* In-app pages download on first visit, so the homepage and sign-in screen
   don't ship every dashboard screen. AppLayout shows a loading row meanwhile. */
const AccountPage = lazy(() => import("./features/account/AccountPage.tsx"));
const ProjectsPage = lazy(() => import("./features/projects/ProjectsPage.tsx"));
const AnalyticsPage = lazy(() => import("./features/analytics/AnalyticsPage.tsx"));
const RequestsPage = lazy(() => import("./features/approvals/RequestsPage.tsx"));
const AssistantDetailPage = lazy(() => import("./features/assistants/AssistantDetailPage.tsx"));
const AssistantsPage = lazy(() => import("./features/assistants/AssistantsPage.tsx"));
const BillingPage = lazy(() => import("./features/billing/BillingPage.tsx"));
const CustomersPage = lazy(() => import("./features/customers/CustomersPage.tsx"));
const InboxPage = lazy(() => import("./features/inbox/InboxPage.tsx"));
const IntegrationsPage = lazy(() => import("./features/integrations/IntegrationsPage.tsx"));
const MembersPage = lazy(() => import("./features/members/MembersPage.tsx"));
const OverviewPage = lazy(() => import("./features/overview/OverviewPage.tsx"));
const SettingsPage = lazy(() => import("./features/settings/SettingsPage.tsx"));

/** Keeps /app/* for signed-in users only, sending everyone else to sign-in. */
function RequireAuth({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const location = useLocation();
  if (!user)
    return (
      <Navigate
        to={`/signin?next=${encodeURIComponent(location.pathname + location.search + location.hash)}`}
        replace
      />
    );
  return <>{children}</>;
}

function SignInRoute() {
  const { user } = useAuth();
  const location = useLocation();
  if (!user) return <SignIn />;
  const requested = new URLSearchParams(location.search).get("next");
  const destination =
    requested?.startsWith("/app") && !requested.startsWith("//") ? requested : "/app";
  return <Navigate to={destination} replace />;
}

function LoadingScreen() {
  return (
    <main
      className="flex min-h-dvh flex-col items-center justify-center gap-3 text-sm text-muted-foreground"
      role="status"
    >
      <BrandMark size={36} />
      Loading your workspace…
    </main>
  );
}

/** /app opens Overview, keeping the query: an ?invite= link must reach JoinInvitationDialog. */
function OverviewRedirect() {
  const { search } = useLocation();
  return <Navigate to={{ pathname: "overview", search }} replace />;
}

/** Old section ids (/app/team, /app/chat…) still open the right page. */
function LegacySection() {
  const { section = "" } = useParams();
  const target = pathForSection(section);
  if (target === section) return <NotFound />;
  return <Navigate to={`/app/${target}`} replace />;
}

export default function App() {
  const { user, loading } = useAuth();

  // Restoring a persisted session is async, so render nothing decisive until it
  // settles — otherwise a signed-in user sees the login screen flash on reload.
  if (loading) return <LoadingScreen />;

  return (
    <Routes>
      {/* "/" is the landing screen for everyone, signed in or not. */}
      <Route path="/" element={<Home user={user} />} />
      <Route path="/signin" element={<SignInRoute />} />

      {/* The agent studio is a full page of its own, without the app's sidebar. */}
      <Route
        path="/app/assistants/:agentId"
        element={
          <RequireAuth>
            <WorkspaceProvider>
              <Suspense fallback={<LoadingScreen />}>
                <AssistantDetailPage />
              </Suspense>
            </WorkspaceProvider>
          </RequireAuth>
        }
      />

      <Route
        path="/app"
        element={
          <RequireAuth>
            <WorkspaceProvider>
              <AppLayout />
            </WorkspaceProvider>
          </RequireAuth>
        }
      >
        <Route index element={<OverviewRedirect />} />
        <Route path="overview" element={<OverviewPage />} />
        <Route path="inbox/:conversationId?" element={<InboxPage />} />
        <Route path="customers" element={<CustomersPage />} />
        <Route path="assistants" element={<AssistantsPage />} />
        {/* Knowledge and the playground are part of the agent studio now; old links land on Agents. */}
        <Route path="knowledge/*" element={<Navigate to="/app/assistants" replace />} />
        <Route path="playground" element={<Navigate to="/app/assistants" replace />} />
        <Route path="analytics" element={<AnalyticsPage />} />
        <Route path="members" element={<MembersPage />} />
        <Route path="requests" element={<RequestsPage />} />
        <Route path="integrations" element={<IntegrationsPage />} />
        <Route path="billing" element={<BillingPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="projects" element={<ProjectsPage />} />
        <Route path="account" element={<AccountPage />} />
        <Route path=":section" element={<LegacySection />} />
        <Route path="*" element={<NotFound />} />
      </Route>

      {/* Unknown URLs fall back to the homepage rather than a blank screen. */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
