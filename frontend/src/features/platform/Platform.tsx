import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import { apiRequest } from "../../shared/api/client.ts";
import BrandMark from "../../shared/ui/BrandMark.tsx";
import NavIcon from "../../shared/ui/NavIcon.tsx";
import CreateForm from "../../shared/ui/CreateForm.tsx";
import ResourceList from "../../shared/ui/ResourceList.tsx";
import type { Membership, OwnJoinRequest, ProfileUpdate, Role, User } from "../../shared/types.ts";
import ApprovalsDashboard from "../approvals/ApprovalsDashboard.tsx";
import ChatPanel from "../chat/ChatPanel.tsx";
import NotificationBell from "../notifications/NotificationBell.tsx";
import ProfileSettings from "../profile/ProfileSettings.tsx";
import TeamManagement from "../team/TeamManagement.tsx";
import WorkspaceSetup from "./WorkspaceSetup.tsx";
import {
  useInvalidateWorkspace,
  useReviewJoinRequest,
  useWorkspace,
  type WorkspaceData,
  type WorkspaceResource,
} from "./queries.ts";
import { SECTIONS, SECTION_GROUPS, isSection } from "./sections.ts";
import { titleCase } from "./utils.ts";

export interface PlatformProps {
  user: User;
  memberships: Membership[];
  joinRequests: OwnJoinRequest[];
  refreshAuth: () => Promise<unknown>;
  resendVerification: () => Promise<void>;
  saveProfile: (profile: ProfileUpdate) => Promise<unknown>;
  signOutEverywhere: () => Promise<void>;
  onSignOut: () => void;
}

/* Colour identifies a tile at a glance; the label carries the meaning, so the
   tiles stay readable without colour. */
const STAT_TILES = [
  {
    id: "assistants",
    label: "Assistants",
    icon: "assistants",
    tint: "blue",
    caption: "Configured and published",
    count: (data: WorkspaceData) => data.assistants.length,
  },
  {
    id: "knowledge",
    label: "Knowledge sources",
    icon: "knowledge",
    tint: "mint",
    caption: "Documents the AI can cite",
    count: (data: WorkspaceData) => data.sources.length,
  },
  {
    id: "customers",
    label: "Customers",
    icon: "customers",
    tint: "violet",
    caption: "People who have made contact",
    count: (data: WorkspaceData) => data.customers.length,
  },
  {
    id: "conversations",
    label: "Conversations",
    icon: "conversations",
    tint: "amber",
    caption: "Threads across every channel",
    count: (data: WorkspaceData) => data.conversations.length,
  },
];

export default function Platform({
  user,
  memberships,
  joinRequests,
  refreshAuth,
  resendVerification,
  saveProfile,
  signOutEverywhere,
  onSignOut,
}: PlatformProps) {
  const { section: routeSection } = useParams();
  const navigate = useNavigate();
  const section = isSection(routeSection) ? routeSection! : SECTIONS[0]!.id;
  const [activeBusinessId, setActiveBusinessId] = useState(
    () => window.localStorage.getItem("chatbot-active-business") || user.default_organization_id,
  );

  const activeMembership =
    memberships.find((item) => item.business_id === activeBusinessId) || memberships[0];
  const businessId = activeMembership?.business_id;
  const hasRole = (role: string | undefined) => ["PRIME", "OWNER", "ADMIN"].includes(role ?? "");
  const canManageTeam = Boolean(
    hasRole(activeMembership?.role) ||
    activeMembership?.effective_permissions?.includes("organization.members.manage"),
  );
  const canManageOrganization = Boolean(
    hasRole(activeMembership?.role) ||
    activeMembership?.effective_permissions?.includes("organization.update"),
  );

  function selectBusiness(nextBusinessId: string) {
    setActiveBusinessId(nextBusinessId);
    window.localStorage.setItem("chatbot-active-business", nextBusinessId);
  }

  const { data, loading, refreshing, error } = useWorkspace(businessId, { canManageTeam });
  const invalidate = useInvalidateWorkspace(businessId);
  // Deliberately not caught: ApprovalsDashboard shows the failure on the row
  // that caused it, which is the only place it is actionable.
  const reviewMutation = useReviewJoinRequest(businessId, { onSettled: refreshAuth });

  async function createResource(path: string, body: unknown, resource: WorkspaceResource) {
    await apiRequest(`/api/v1/businesses/${businessId}${path}`, { method: "POST", body });
    await invalidate(resource);
  }

  const reviewJoinRequest = (requestId: string, decision: "APPROVED" | "REJECTED", role: Role) =>
    reviewMutation.mutateAsync({ requestId, decision, role }).then(() => undefined);

  // Every hook above runs before this early return: React requires the same
  // hook order on every render, including the no-workspace render.
  if (!memberships.length || !activeMembership || !businessId) {
    return (
      <WorkspaceSetup
        user={user}
        joinRequests={joinRequests}
        refreshAuth={refreshAuth}
        onSignOut={onSignOut}
      />
    );
  }

  async function saveMember(
    userId: string,
    values: { role: Role; status: string; permissions: string[] },
  ) {
    await apiRequest(`/api/v1/businesses/${businessId}/members/${userId}`, {
      method: "PATCH",
      body: { role: values.role, status: values.status },
    });
    if (values.role === "CUSTOM") {
      await apiRequest(`/api/v1/businesses/${businessId}/members/${userId}/permissions`, {
        method: "PUT",
        body: { permissions: values.permissions, denied_permissions: [] },
      });
    }
    await invalidate("members");
  }

  async function updateOrganization(values: Record<string, unknown>) {
    await apiRequest(`/api/v1/businesses/${businessId}`, { method: "PATCH", body: values });
    await refreshAuth();
    await invalidate("organization");
  }

  async function createOrganization(values: Record<string, unknown>) {
    const organization = await apiRequest<{ id: string }>("/api/v1/businesses", {
      method: "POST",
      body: values,
    });
    await refreshAuth();
    selectBusiness(organization.id);
  }

  /* A notification can point at a section in a workspace other than the one on
     screen, so switch workspaces first, then navigate. */
  function openFromNotification(targetSection: string, organizationId: string | null) {
    if (organizationId && memberships.some((item) => item.business_id === organizationId))
      selectBusiness(organizationId);
    if (isSection(targetSection)) navigate(`/app/${targetSection}`);
  }

  const pendingCount = data.joinRequests.filter((item) => item.status === "PENDING").length;
  const visibleSections = SECTIONS.filter((item) => !item.manageOnly || canManageTeam);

  const sectionTitle = SECTIONS.find((item) => item.id === section)?.label ?? "Overview";

  return (
    <main className="platform">
      <aside className="platform-sidebar">
        <Link className="platform-brand" to="/" title="Back to homepage">
          <BrandMark size={34} className="small" />
          <span>Lift Off</span>
        </Link>
        <nav aria-label="Platform navigation">
          {SECTION_GROUPS.map((group) => {
            const items = visibleSections.filter((item) => item.group === group);
            if (!items.length) return null;
            return (
              <div className="nav-group" key={group}>
                <p className="nav-group-label">{group}</p>
                {items.map((item) => (
                  <Link
                    key={item.id}
                    to={`/app/${item.id}`}
                    className={section === item.id ? "active" : ""}
                    aria-current={section === item.id ? "page" : undefined}
                  >
                    <NavIcon name={item.icon} />
                    <span>{item.label}</span>
                    {item.id === "approvals" && pendingCount > 0 && (
                      <span className="nav-badge">{pendingCount}</span>
                    )}
                  </Link>
                ))}
              </div>
            );
          })}
        </nav>
        <div className="sidebar-account">
          <span className="account-avatar">
            {(user.display_name || user.email).slice(0, 1).toUpperCase()}
          </span>
          <div>
            <strong>{user.display_name || "Account"}</strong>
            <small>{user.email}</small>
          </div>
        </div>
      </aside>

      <section className="platform-main">
        <header className="platform-topbar">
          <div className="topbar-heading">
            <p className="platform-kicker">{activeMembership.business_name}</p>
            <h1>{sectionTitle}</h1>
          </div>
          <div className="platform-actions">
            {memberships.length > 1 && (
              <select
                value={businessId}
                onChange={(event) => selectBusiness(event.target.value)}
                aria-label="Active workspace"
              >
                {memberships.map((membership) => (
                  <option key={membership.business_id} value={membership.business_id}>
                    {membership.business_name}
                  </option>
                ))}
              </select>
            )}
            <NotificationBell onOpenSection={openFromNotification} onChanged={refreshAuth} />
            <span className="signed-in-badge">
              <span /> {refreshing ? "Syncing…" : `Signed in · ${titleCase(activeMembership.role)}`}
            </span>
            <button className="btn-quiet" onClick={onSignOut}>
              Sign out
            </button>
          </div>
        </header>

        <div className="platform-content">
          {!user.email_verified && (
            <p className="status">
              Verify your email to secure your account.{" "}
              <button type="button" className="link" onClick={resendVerification}>
                Resend verification email
              </button>
            </p>
          )}
          {error && <p className="status error">{error.message}</p>}
          {loading && <p className="loading">Loading workspace…</p>}

          {!loading && section === "overview" && (
            <>
              <section className="welcome-panel">
                <div>
                  <p className="platform-kicker">Workspace overview</p>
                  <h2>Welcome back, {user.display_name || user.email.split("@")[0]}</h2>
                  <p>
                    Your backend session is active. Choose a section to manage the customer-service
                    platform.
                  </p>
                </div>
                <Link className="btn-primary" to="/app/chat">
                  Open chat playground
                </Link>
              </section>
              <section className="metric-grid">
                {STAT_TILES.map((tile) => (
                  <Link
                    key={tile.id}
                    className="metric-card"
                    to={`/app/${tile.id}`}
                    data-tint={tile.tint}
                  >
                    <span className="metric-chip" aria-hidden="true">
                      <NavIcon name={tile.icon} size={19} />
                    </span>
                    <span className="metric-value">{tile.count(data)}</span>
                    <strong>{tile.label}</strong>
                    <small>{tile.caption}</small>
                  </Link>
                ))}
              </section>
              <section className="platform-panel">
                <h2>Account status</h2>
                <div className="detail-grid">
                  <div>
                    <span>Email</span>
                    <strong>{user.email}</strong>
                  </div>
                  <div>
                    <span>Workspace role</span>
                    <strong>{titleCase(activeMembership.role)}</strong>
                  </div>
                  <div>
                    <span>Session</span>
                    <strong className="success-text">Authenticated</strong>
                  </div>
                </div>
              </section>
            </>
          )}

          {!loading && section === "chat" && (
            <ChatPanel businessId={businessId} agent={data.assistants[0]} />
          )}

          {!loading && section === "assistants" && (
            <section className="platform-panel">
              <div className="panel-heading">
                <div>
                  <h2>Assistants</h2>
                  <p>Configure AI behavior and automatically create a web channel.</p>
                </div>
              </div>
              <CreateForm
                fields={[
                  {
                    name: "name",
                    label: "Assistant name",
                    placeholder: "Support assistant",
                    minLength: 2,
                  },
                ]}
                submitLabel="Create assistant"
                onSubmit={(values) =>
                  createResource("/assistants", { name: values.name }, "assistants")
                }
              />
              <ResourceList
                items={data.assistants}
                empty="No assistants yet."
                render={(item) => (
                  <article className="resource-row" key={item.id}>
                    <div>
                      <strong>{item.name}</strong>
                      <span>
                        {item.model_provider} · {item.model_name}
                      </span>
                    </div>
                    <span className="resource-status">{titleCase(item.status)}</span>
                  </article>
                )}
              />
            </section>
          )}

          {!loading && section === "knowledge" && (
            <section className="platform-panel">
              <div className="panel-heading">
                <div>
                  <h2>Knowledge</h2>
                  <p>Create sources before uploading and processing documents.</p>
                </div>
              </div>
              <CreateForm
                fields={[{ name: "name", label: "Source name", placeholder: "Support policies" }]}
                submitLabel="Create source"
                onSubmit={(values) =>
                  createResource("/knowledge/sources", { name: values.name }, "sources")
                }
              />
              <ResourceList
                items={data.sources}
                empty="No knowledge sources yet."
                render={(item) => (
                  <article className="resource-row" key={item.id}>
                    <div>
                      <strong>{item.name}</strong>
                      <span>{titleCase(item.source_type)}</span>
                    </div>
                    <span className="resource-status">{titleCase(item.status)}</span>
                  </article>
                )}
              />
            </section>
          )}

          {!loading && section === "customers" && (
            <section className="platform-panel">
              <div className="panel-heading">
                <div>
                  <h2>Customers</h2>
                  <p>People who contact your support channels.</p>
                </div>
              </div>
              <CreateForm
                fields={[
                  { name: "display_name", label: "Name", placeholder: "Customer name" },
                  {
                    name: "email",
                    label: "Email",
                    type: "email",
                    placeholder: "customer@example.com",
                    required: false,
                  },
                ]}
                submitLabel="Add customer"
                onSubmit={(values) =>
                  createResource(
                    "/customers",
                    { display_name: values.display_name, email: values.email || null },
                    "customers",
                  )
                }
              />
              <ResourceList
                items={data.customers}
                empty="No customers yet."
                render={(item) => (
                  <article className="resource-row" key={item.id}>
                    <div>
                      <strong>{item.display_name || "Unnamed customer"}</strong>
                      <span>{item.email || item.phone || "No contact details"}</span>
                    </div>
                  </article>
                )}
              />
            </section>
          )}

          {!loading && section === "conversations" && (
            <section className="platform-panel">
              <div className="panel-heading">
                <div>
                  <h2>Conversations</h2>
                  <p>Customer and agent conversation records.</p>
                </div>
              </div>
              <ResourceList
                items={data.conversations}
                empty="No conversations yet. Use a web channel or the API to start one."
                render={(item) => (
                  <article className="resource-row" key={item.id}>
                    <div>
                      <strong>Conversation {item.id.slice(0, 8)}</strong>
                      <span>
                        Updated{" "}
                        {item.last_message_at
                          ? new Date(item.last_message_at).toLocaleString()
                          : "never"}
                      </span>
                    </div>
                    <span className="resource-status">{titleCase(item.status)}</span>
                  </article>
                )}
              />
            </section>
          )}

          {!loading && section === "channels" && (
            <section className="platform-panel">
              <div className="panel-heading">
                <div>
                  <h2>Channels</h2>
                  <p>Public entry points connected to assistants.</p>
                </div>
              </div>
              <ResourceList
                items={data.channels}
                empty="No channels yet. Creating an assistant creates a web channel by default."
                render={(item) => (
                  <article className="resource-row" key={item.id}>
                    <div>
                      <strong>{titleCase(item.channel)} channel</strong>
                      <span>Public ID: {item.public_id}</span>
                    </div>
                    <span className="resource-status">{titleCase(item.status)}</span>
                  </article>
                )}
              />
            </section>
          )}

          {!loading && section === "approvals" && (
            <ApprovalsDashboard
              membership={activeMembership}
              joinRequests={data.joinRequests}
              canManage={canManageTeam}
              onReview={reviewJoinRequest}
            />
          )}

          {!loading && section === "team" && (
            <TeamManagement
              membership={activeMembership}
              members={data.members}
              pendingCount={pendingCount}
              canManage={canManageTeam}
              onSaveMember={saveMember}
              inviteForm={
                <CreateForm
                  fields={[
                    {
                      name: "email",
                      label: "Email",
                      type: "email",
                      placeholder: "teammate@example.com",
                    },
                    {
                      name: "role",
                      label: "Role",
                      type: "select",
                      options:
                        activeMembership.role === "PRIME"
                          ? ["AGENT", "ADMIN", "OWNER"]
                          : ["AGENT", "ADMIN"],
                    },
                  ]}
                  submitLabel="Invite member"
                  onSubmit={(values) => createResource("/invitations", values, "invitations")}
                />
              }
            />
          )}

          {!loading && section === "organization" && (
            <div className="settings-stack">
              <section className="platform-panel settings-panel">
                <div className="panel-heading">
                  <div>
                    <h2>Organization settings</h2>
                    <p>Manage the current organization and its access code.</p>
                  </div>
                </div>
                <div className="detail-grid">
                  <div>
                    <span>Organization</span>
                    <strong>{data.organization?.name || activeMembership.business_name}</strong>
                  </div>
                  <div>
                    <span>Your role</span>
                    <strong>{titleCase(activeMembership.role)}</strong>
                  </div>
                  <div>
                    <span>Join code</span>
                    <strong>
                      {canManageTeam
                        ? data.organization?.join_code || "Unavailable"
                        : "Ask an administrator"}
                    </strong>
                  </div>
                </div>
                {canManageOrganization && (
                  <CreateForm
                    fields={[
                      {
                        name: "name",
                        label: "Organization name",
                        defaultValue: data.organization?.name || activeMembership.business_name,
                        minLength: 2,
                      },
                    ]}
                    submitLabel="Save organization"
                    onSubmit={(values) => updateOrganization({ name: values.name })}
                  />
                )}
              </section>
              <section className="platform-panel settings-panel">
                <div className="panel-heading">
                  <div>
                    <h2>Create another organization</h2>
                    <p>You will become the Prime user of the new organization.</p>
                  </div>
                </div>
                <CreateForm
                  fields={[
                    {
                      name: "name",
                      label: "New organization name",
                      placeholder: "New workspace",
                      minLength: 2,
                    },
                  ]}
                  submitLabel="Create organization"
                  onSubmit={createOrganization}
                />
              </section>
            </div>
          )}

          {!loading && section === "profile" && (
            <ProfileSettings
              user={user}
              memberships={memberships}
              saveProfile={saveProfile}
              resendVerification={resendVerification}
              signOutEverywhere={signOutEverywhere}
            />
          )}
        </div>
      </section>
    </main>
  );
}
