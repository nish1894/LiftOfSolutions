import { type ReactNode, useState } from "react";
import { Link } from "react-router-dom";

import { PLATFORM_PERMISSIONS } from "../platform/permissions.ts";
import type { Member, MemberStatus, Membership, Role } from "../../shared/types.ts";

export interface MemberValues {
  role: Role;
  status: MemberStatus;
  permissions: string[];
}

export type SaveMemberHandler = (userId: string, values: MemberValues) => Promise<void>;

const label = (value: string | null | undefined) =>
  String(value || "")
    .toLowerCase()
    .replace(/(^|[._-])\w/g, (match) => match.replace(/[._-]/, " ").toUpperCase());

interface MemberEditorProps {
  member: Member;
  isPrime: boolean;
  onSave: SaveMemberHandler;
}

function MemberEditor({ member, isPrime, onSave }: MemberEditorProps) {
  const immutable = member.role === "PRIME" || (!isPrime && member.role === "OWNER");
  const [role, setRole] = useState(member.role);
  const [status, setStatus] = useState(member.status);
  const [permissions, setPermissions] = useState<string[]>(member.permissions || []);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  // Re-seed when a different member object arrives. Adjusting state during
  // render avoids the extra stale render an effect would cause.
  const [seededFrom, setSeededFrom] = useState(member);
  if (seededFrom !== member) {
    setSeededFrom(member);
    setRole(member.role);
    setStatus(member.status);
    setPermissions(member.permissions || []);
  }

  function togglePermission(permission: string) {
    setPermissions((current) =>
      current.includes(permission)
        ? current.filter((item) => item !== permission)
        : [...current, permission],
    );
  }

  async function save() {
    setBusy(true);
    setMessage(null);
    try {
      await onSave(member.user_id, {
        role,
        status,
        permissions: role === "CUSTOM" ? permissions : member.permissions || [],
      });
      setMessage("Saved");
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <article className="member-card">
      <div className="member-summary">
        <div>
          <strong>{member.display_name || member.email}</strong>
          <span>{member.email}</span>
        </div>
        <span className="resource-status">{label(member.role)}</span>
      </div>
      {!immutable && (
        <div className="member-controls">
          <label>
            <span>Role</span>
            <select value={role} onChange={(event) => setRole(event.target.value as Role)}>
              {isPrime && <option value="OWNER">Owner</option>}
              <option value="ADMIN">Admin</option>
              <option value="AGENT">Agent</option>
              <option value="VIEWER">Viewer</option>
              <option value="CUSTOM">Custom</option>
            </select>
          </label>
          <label>
            <span>Status</span>
            <select
              value={status}
              onChange={(event) => setStatus(event.target.value as MemberStatus)}
            >
              <option value="ACTIVE">Active</option>
              <option value="DISABLED">Disabled</option>
            </select>
          </label>
          <button className="btn-quiet" type="button" disabled={busy} onClick={save}>
            {busy ? "Saving…" : "Save access"}
          </button>
          {message && <small>{message}</small>}
        </div>
      )}
      {!immutable && role === "CUSTOM" && (
        <details className="permission-editor">
          <summary>Advanced permissions ({permissions.length})</summary>
          <div className="permission-grid">
            {PLATFORM_PERMISSIONS.map((permission) => (
              <label key={permission}>
                <input
                  type="checkbox"
                  checked={permissions.includes(permission)}
                  onChange={() => togglePermission(permission)}
                />
                <span>{label(permission)}</span>
              </label>
            ))}
          </div>
        </details>
      )}
    </article>
  );
}

export interface TeamManagementProps {
  membership: Pick<Membership, "role">;
  members: Member[];
  pendingCount: number;
  canManage: boolean;
  onSaveMember: SaveMemberHandler;
  inviteForm?: ReactNode;
}

export default function TeamManagement({
  membership,
  members,
  pendingCount,
  canManage,
  onSaveMember,
  inviteForm,
}: TeamManagementProps) {
  const isPrime = membership.role === "PRIME";
  return (
    <div className="settings-stack">
      {/* Approvals live in their own section; this is only a pointer to it, so
          there is exactly one place where a decision can be made. */}
      {canManage && pendingCount > 0 && (
        <section className="platform-panel">
          <div className="panel-heading">
            <div>
              <h2>Access requests waiting</h2>
              <p>
                {pendingCount} {pendingCount === 1 ? "person is" : "people are"} waiting to be
                certified into this organization.
              </p>
            </div>
            <Link className="btn-primary" to="/app/approvals">
              Review requests
            </Link>
          </div>
        </section>
      )}
      <section className="platform-panel">
        <div className="panel-heading">
          <div>
            <h2>Organization members</h2>
            <p>Prime and delegated administrators can manage roles and custom permissions.</p>
          </div>
        </div>
        {canManage && inviteForm}
        <div className="member-list">
          {members.map((member) => (
            <MemberEditor
              key={member.user_id}
              member={member}
              isPrime={isPrime}
              onSave={onSaveMember}
            />
          ))}
        </div>
        {!members.length && <div className="platform-empty">No organization members.</div>}
      </section>
    </div>
  );
}
