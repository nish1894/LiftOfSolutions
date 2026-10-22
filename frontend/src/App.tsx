import { lazy, type ReactNode } from "react";
import { Navigate, Route, Routes, useParams } from "react-router-dom";

import { useAuth } from "./features/auth/AuthContext.ts";
import SignIn from "./features/auth/SignIn.tsx";
import Home from "./features/home/Home.tsx";
import AppLayout from "./features/shell/AppLayout.tsx";
import { pathForSection } from "./features/shell/navigation.ts";
import NotFound from "./features/shell/NotFound.tsx";
import { WorkspaceProvider } from "./features/workspace/WorkspaceProvider.tsx";

/* In-app pages download on first visit, so the homepage and sign-in screen
   don't ship every dashboard screen. AppLayout shows a loading row meanwhile. */
const AccountPage = lazy(() => import("./features/account/AccountPage.tsx"));
const AnalyticsPage = lazy(() => import("./features/analytics/AnalyticsPage.tsx"));
const RequestsPage = lazy(() => import("./features/approvals/RequestsPage.tsx"));
const AssistantDetailPage = lazy(() => import("./features/assistants/AssistantDetailPage.tsx"));
const AssistantsPage = lazy(() => import("./features/assistants/AssistantsPage.tsx"));
const BillingPage = lazy(() => import("./features/billing/BillingPage.tsx"));
const CustomersPage = lazy(() => import("./features/customers/CustomersPage.tsx"));
const InboxPage = lazy(() => import("./features/inbox/InboxPage.tsx"));
const IntegrationsPage = lazy(() => import("./features/integrations/IntegrationsPage.tsx"));
const KnowledgePage = lazy(() => import("./features/knowledge/KnowledgePage.tsx"));
const SourceDetailPage = lazy(() => import("./features/knowledge/SourceDetailPage.tsx"));
const MembersPage = lazy(() => import("./features/members/MembersPage.tsx"));
const OverviewPage = lazy(() => import("./features/overview/OverviewPage.tsx"));
const PlaygroundPage = lazy(() => import("./features/playground/PlaygroundPage.tsx"));
const SettingsPage = lazy(() => import("./features/settings/SettingsPage.tsx"));

/** Keeps /app/* for signed-in users only, sending everyone else to sign-in. */
function RequireAuth({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/signin" replace />;
  return <>{children}</>;
}

function LoadingScreen() {
  return (
    <main className="grid min-h-dvh place-items-center text-sm text-muted-foreground" role="status">
      Loading…
    </main>
  );
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
      <Route path="/signin" element={user ? <Navigate to="/app" replace /> : <SignIn />} />

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
        <Route index element={<Navigate to="overview" replace />} />
        <Route path="overview" element={<OverviewPage />} />
        <Route path="inbox/:conversationId?" element={<InboxPage />} />
        <Route path="customers" element={<CustomersPage />} />
        <Route path="assistants" element={<AssistantsPage />} />
        <Route path="assistants/:agentId" element={<AssistantDetailPage />} />
        <Route path="knowledge" element={<KnowledgePage />} />
        <Route path="knowledge/:sourceId" element={<SourceDetailPage />} />
        <Route path="playground" element={<PlaygroundPage />} />
        <Route path="analytics" element={<AnalyticsPage />} />
        <Route path="members" element={<MembersPage />} />
        <Route path="requests" element={<RequestsPage />} />
        <Route path="integrations" element={<IntegrationsPage />} />
        <Route path="billing" element={<BillingPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="account" element={<AccountPage />} />
        <Route path=":section" element={<LegacySection />} />
        <Route path="*" element={<NotFound />} />
      </Route>

      {/* Unknown URLs fall back to the homepage rather than a blank screen. */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
