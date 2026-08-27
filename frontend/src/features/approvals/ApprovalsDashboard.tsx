import { useState } from "react";

import NavIcon from "../../shared/ui/NavIcon.tsx";
import type { JoinRequest, Membership, Role } from "../../shared/types.ts";

export type Decision = "APPROVED" | "REJECTED";
export type ReviewHandler = (requestId: string, decision: Decision, role: Role) => Promise<void>;

const ROLES: Role[] = ["OWNER", "ADMIN", "AGENT", "VIEWER", "CUSTOM"];
const DEFAULT_ROLE: Role = "AGENT";

const title = (value: string | null | undefined) =>
  String(value || "").charAt(0) +
  String(value || "")
    .slice(1)
    .toLowerCase();

function when(value: string | null | undefined) {
  if (!value) return "";
  const then = new Date(value).getTime();
  if (Number.isNaN(then)) return "";
  const minutes = Math.round((Date.now() - then) / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return new Date(then).toLocaleDateString();
}

interface PendingRequestProps {
  request: JoinRequest;
  isPrime: boolean;
  onReview: ReviewHandler;
}

function PendingRequest({ request, isPrime, onReview }: PendingRequestProps) {
  // Held per row so approving one request cannot disable or mis-role another.
  const [role, setRole] = useState(DEFAULT_ROLE);
  const [busy, setBusy] = useState<Decision | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function review(decision: Decision) {
    setBusy(decision);
    setError(null);
    try {
      await onReview(request.id, decision, role);
    } catch (requestError) {
      // Without this the button silently re-enabled and nothing happened,
      // which is indistinguishable from the feature being broken.
      setError((requestError as Error).message || "The decision could not be saved.");
      setBusy(null);
    }
  }

  const roles = isPrime ? ROLES : ROLES.filter((item) => item !== "OWNER");

  return (
    <article className="approval-row">
      <div className="approval-identity">
        <span className="account-avatar" aria-hidden="true">
          {(request.display_name || request.email || "?").slice(0, 1).toUpperCase()}
        </span>
        <div>
          <strong>{request.display_name || request.email}</strong>
          <span>{request.email}</span>
          <small>Requested {when(request.requested_at)}</small>
        </div>
      </div>

      <div className="approval-actions">
        <label className="approval-role">
          <span>Role</span>
          <select
            value={role}
            onChange={(event) => setRole(event.target.value as Role)}
            disabled={Boolean(busy)}
          >
            {roles.map((item) => (
              <option key={item} value={item}>
                {title(item)}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className="btn-primary"
          disabled={Boolean(busy)}
          onClick={() => review("APPROVED")}
        >
          {busy === "APPROVED" ? "Approving…" : "Approve"}
        </button>
        <button
          type="button"
          className="btn-quiet"
          disabled={Boolean(busy)}
          onClick={() => review("REJECTED")}
        >
          {busy === "REJECTED" ? "Rejecting…" : "Reject"}
        </button>
      </div>

      {error && (
        <p className="approval-error error-text" role="alert">
          {error}
        </p>
      )}
    </article>
  );
}

export interface ApprovalsDashboardProps {
  membership: Pick<Membership, "role">;
  joinRequests: JoinRequest[];
  canManage: boolean;
  onReview: ReviewHandler;
}

export default function ApprovalsDashboard({
  membership,
  joinRequests,
  canManage,
  onReview,
}: ApprovalsDashboardProps) {
  const pending = joinRequests.filter((item) => item.status === "PENDING");
  const decided = joinRequests.filter((item) => item.status !== "PENDING").slice(0, 10);
  const isPrime = membership.role === "PRIME";

  if (!canManage)
    return (
      <section className="platform-panel">
        <div className="platform-empty">
          Only Prime and delegated managers can review access requests.
        </div>
      </section>
    );

  return (
    <div className="settings-stack">
      <section className="metric-grid metric-grid-3">
        {[
          {
            label: "Awaiting your decision",
            tint: "amber",
            icon: "approvals",
            value: pending.length,
          },
          {
            label: "Approved",
            tint: "mint",
            icon: "team",
            value: joinRequests.filter((item) => item.status === "APPROVED").length,
          },
          {
            label: "Rejected",
            tint: "blue",
            icon: "customers",
            value: joinRequests.filter((item) => item.status === "REJECTED").length,
          },
        ].map((tile) => (
          <article className="metric-card" key={tile.label} data-tint={tile.tint}>
            <span className="metric-chip" aria-hidden="true">
              <NavIcon name={tile.icon} size={19} />
            </span>
            <span className="metric-value">{tile.value}</span>
            <strong>{tile.label}</strong>
          </article>
        ))}
      </section>

      <section className="platform-panel">
        <div className="panel-heading">
          <div>
            <h2>Access requests</h2>
            <p>
              People who entered this organization&apos;s join code. Approving adds them as an
              active member straight away — the role defaults to Agent, so approving is one click
              unless you want to change it.
            </p>
          </div>
          {pending.length > 0 && <span className="resource-status">{pending.length} pending</span>}
        </div>

        {pending.length === 0 ? (
          <div className="platform-empty">
            No one is waiting for access. Share the join code from the Organization section to
            invite someone.
          </div>
        ) : (
          <div className="approval-list">
            {pending.map((request) => (
              <PendingRequest
                key={request.id}
                request={request}
                isPrime={isPrime}
                onReview={onReview}
              />
            ))}
          </div>
        )}
      </section>

      {decided.length > 0 && (
        <section className="platform-panel">
          <div className="panel-heading">
            <div>
              <h2>Recent decisions</h2>
              <p>The last requests you and other managers reviewed.</p>
            </div>
          </div>
          <div className="resource-list">
            {decided.map((request) => (
              <article className="resource-row" key={request.id}>
                <div>
                  <strong>{request.display_name || request.email}</strong>
                  <span>{request.email}</span>
                </div>
                <span
                  className={`resource-status ${request.status === "APPROVED" ? "is-approved" : "is-rejected"}`}
                >
                  {title(request.status)} {when(request.reviewed_at)}
                </span>
              </article>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
