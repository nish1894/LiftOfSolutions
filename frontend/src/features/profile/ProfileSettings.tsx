import { type FormEvent, useState } from "react";

import type { Membership, ProfileUpdate, User } from "../../shared/types.ts";

interface StatusMessage {
  type: "error" | "success";
  text: string;
}

interface ProfileSettingsProps {
  user: User;
  memberships: Membership[];
  saveProfile: (profile: ProfileUpdate) => Promise<unknown>;
  resendVerification: () => Promise<void>;
  signOutEverywhere: () => Promise<void>;
}

const basicFrom = (user: User) => ({
  display_name: user.display_name || "",
  photo_url: user.photo_url || "",
  phone: user.phone || "",
  job_title: user.job_title || "",
  bio: user.bio || "",
});

const advancedFrom = (user: User, memberships: Membership[]) => ({
  timezone: user.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
  locale: user.locale || navigator.language || "en",
  default_organization_id: user.default_organization_id || memberships[0]?.business_id || "",
  email_notifications: user.preferences?.email_notifications ?? true,
  product_updates: user.preferences?.product_updates ?? false,
});

export default function ProfileSettings({
  user,
  memberships,
  saveProfile,
  resendVerification,
  signOutEverywhere,
}: ProfileSettingsProps) {
  const [basic, setBasic] = useState(() => basicFrom(user));
  const [advanced, setAdvanced] = useState(() => advancedFrom(user, memberships));
  const [status, setStatus] = useState<StatusMessage | null>(null);
  const [busy, setBusy] = useState(false);

  // Re-seed the form when a different profile arrives. Adjusting state during
  // render is the pattern React documents for this; doing it in an effect
  // renders once with stale values first and cascades a second render.
  const [seededFrom, setSeededFrom] = useState(user);
  if (seededFrom !== user) {
    setSeededFrom(user);
    setBasic(basicFrom(user));
    setAdvanced(advancedFrom(user, memberships));
  }

  async function submitBasic(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setStatus(null);
    try {
      await saveProfile({
        display_name: basic.display_name.trim() || null,
        photo_url: basic.photo_url.trim() || null,
        phone: basic.phone.trim() || null,
        job_title: basic.job_title.trim() || null,
        bio: basic.bio.trim() || null,
      });
      setStatus({ type: "success", text: "Profile saved." });
    } catch (error) {
      setStatus({ type: "error", text: (error as Error).message });
    } finally {
      setBusy(false);
    }
  }

  async function submitAdvanced(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setStatus(null);
    try {
      await saveProfile({
        timezone: advanced.timezone.trim(),
        locale: advanced.locale.trim(),
        default_organization_id: advanced.default_organization_id || null,
        preferences: {
          email_notifications: advanced.email_notifications,
          product_updates: advanced.product_updates,
        },
      });
      setStatus({ type: "success", text: "Advanced settings saved." });
    } catch (error) {
      setStatus({ type: "error", text: (error as Error).message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="settings-stack">
      {status && <p className={`status ${status.type}`}>{status.text}</p>}
      <section className="platform-panel settings-panel">
        <div className="panel-heading">
          <div>
            <h2>Basic profile</h2>
            <p>Manage the identity shown to your organization.</p>
          </div>
        </div>
        <form className="settings-form" onSubmit={submitBasic}>
          <label>
            <span>Display name</span>
            <input
              value={basic.display_name || ""}
              onChange={(event) => setBasic({ ...basic, display_name: event.target.value })}
            />
          </label>
          <label>
            <span>Job title</span>
            <input
              value={basic.job_title || ""}
              onChange={(event) => setBasic({ ...basic, job_title: event.target.value })}
              placeholder="Customer Success Manager"
            />
          </label>
          <label>
            <span>Phone</span>
            <input
              value={basic.phone || ""}
              onChange={(event) => setBasic({ ...basic, phone: event.target.value })}
              placeholder="+91 98765 43210"
            />
          </label>
          <label>
            <span>Profile photo URL</span>
            <input
              type="url"
              value={basic.photo_url || ""}
              onChange={(event) => setBasic({ ...basic, photo_url: event.target.value })}
              placeholder="https://…"
            />
          </label>
          <label className="full-field">
            <span>Bio</span>
            <textarea
              value={basic.bio || ""}
              onChange={(event) => setBasic({ ...basic, bio: event.target.value })}
              maxLength={1000}
              rows={4}
            />
          </label>
          <div className="form-actions">
            <button className="btn-primary" disabled={busy}>
              {busy ? "Saving…" : "Save profile"}
            </button>
          </div>
        </form>
      </section>

      <section className="platform-panel settings-panel">
        <div className="panel-heading">
          <div>
            <h2>Advanced settings</h2>
            <p>Set workspace defaults, regional preferences, and notifications.</p>
          </div>
        </div>
        <form className="settings-form" onSubmit={submitAdvanced}>
          <label>
            <span>Timezone</span>
            <input
              value={advanced.timezone || ""}
              onChange={(event) => setAdvanced({ ...advanced, timezone: event.target.value })}
              required
            />
          </label>
          <label>
            <span>Locale</span>
            <input
              value={advanced.locale || ""}
              onChange={(event) => setAdvanced({ ...advanced, locale: event.target.value })}
              required
            />
          </label>
          <label className="full-field">
            <span>Default organization</span>
            <select
              value={advanced.default_organization_id || ""}
              onChange={(event) =>
                setAdvanced({ ...advanced, default_organization_id: event.target.value })
              }
            >
              {memberships.map((membership: Membership) => (
                <option key={membership.business_id} value={membership.business_id}>
                  {membership.business_name}
                </option>
              ))}
            </select>
          </label>
          <label className="check-field">
            <input
              type="checkbox"
              checked={Boolean(advanced.email_notifications)}
              onChange={(event) =>
                setAdvanced({ ...advanced, email_notifications: event.target.checked })
              }
            />
            <span>Email notifications</span>
          </label>
          <label className="check-field">
            <input
              type="checkbox"
              checked={Boolean(advanced.product_updates)}
              onChange={(event) =>
                setAdvanced({ ...advanced, product_updates: event.target.checked })
              }
            />
            <span>Product updates</span>
          </label>
          <div className="form-actions">
            <button className="btn-primary" disabled={busy}>
              {busy ? "Saving…" : "Save advanced settings"}
            </button>
          </div>
        </form>
      </section>

      <section className="platform-panel settings-panel">
        <div className="panel-heading">
          <div>
            <h2>Security</h2>
            <p>Firebase Authentication protects your account and sessions.</p>
          </div>
        </div>
        <div className="security-actions">
          <div>
            <strong>{user.email}</strong>
            <span>{user.email_verified ? "Email verified" : "Email verification pending"}</span>
          </div>
          {!user.email_verified && (
            <button className="btn-quiet" type="button" onClick={resendVerification}>
              Send verification
            </button>
          )}
          <button className="btn-danger" type="button" onClick={signOutEverywhere}>
            Sign out all devices
          </button>
        </div>
      </section>
    </div>
  );
}
