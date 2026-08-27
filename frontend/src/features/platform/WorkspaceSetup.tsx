import { type FormEvent, useState } from "react";

import { apiRequest } from "../../shared/api/client.ts";
import BrandMark from "../../shared/ui/BrandMark.tsx";
import type { OwnJoinRequest, User } from "../../shared/types.ts";
import NotificationBell from "../notifications/NotificationBell.tsx";

interface WorkspaceSetupProps {
  user: User;
  joinRequests: OwnJoinRequest[];
  refreshAuth: () => Promise<unknown>;
  onSignOut: () => void;
}

/** Shown when a signed-in user belongs to no organization yet. */
export default function WorkspaceSetup({
  user,
  joinRequests,
  refreshAuth,
  onSignOut,
}: WorkspaceSetupProps) {
  const [name, setName] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function createWorkspace(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await apiRequest("/api/v1/businesses", {
        method: "POST",
        body: { name: name.trim() },
      });
      await refreshAuth();
    } catch (requestError) {
      setError((requestError as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function requestAccess(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await apiRequest("/api/v1/businesses/join-requests", {
        method: "POST",
        body: { join_code: joinCode.trim() },
      });
      setJoinCode("");
      await refreshAuth();
    } catch (requestError) {
      setError((requestError as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="workspace-setup">
      <div className="workspace-card">
        <BrandMark size={52} />
        <div className="workspace-status">
          <span className="signed-in-badge">
            <span /> Signed in
          </span>
          {/* An applicant waiting on certification has no workspace yet, so the
              approval notification has to be reachable from this screen too. */}
          <NotificationBell onChanged={refreshAuth} />
        </div>
        <div className="workspace-account">
          <strong>{user.display_name || "Authenticated account"}</strong>
          <span>{user.email}</span>
        </div>
        <h1>Choose an organization</h1>
        <p>
          Create a new organization as its Prime user, or request access to an existing
          organization.
        </p>
        <form onSubmit={createWorkspace}>
          <label htmlFor="workspace-name">Workspace name</label>
          <input
            id="workspace-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Acme Support"
            minLength={2}
            required
            disabled={busy}
          />
          <button className="btn-primary" disabled={busy}>
            {busy ? "Creating…" : "Create workspace"}
          </button>
        </form>
        <div className="workspace-divider">
          <span>or join an organization</span>
        </div>
        <form onSubmit={requestAccess}>
          <label htmlFor="join-code">Organization join code</label>
          <input
            id="join-code"
            value={joinCode}
            onChange={(event) => setJoinCode(event.target.value.toUpperCase())}
            placeholder="A1B2C3D4E5"
            minLength={6}
            required
            disabled={busy}
          />
          <button className="btn-quiet" disabled={busy}>
            {busy ? "Submitting…" : "Request access"}
          </button>
        </form>
        {joinRequests
          .filter((item) => item.status === "PENDING")
          .map((item) => (
            <p className="pending-request" key={item.id}>
              <strong>{item.organization_name}</strong>
              <span>Waiting for certification</span>
            </p>
          ))}
        {joinRequests.length > 0 && (
          <button className="link refresh-request" type="button" onClick={refreshAuth}>
            Check request status
          </button>
        )}
        {error && <p className="status error">{error}</p>}
        <button className="link workspace-signout" onClick={onSignOut}>
          Sign out
        </button>
      </div>
    </main>
  );
}
