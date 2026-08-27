/* Domain models returned by the platform API. Field names are snake_case
   because they mirror the JSON the Node API sends; converting them would mean
   maintaining a mapping layer for no benefit. */

export type Role = "PRIME" | "OWNER" | "ADMIN" | "AGENT" | "VIEWER" | "CUSTOM";
export type MemberStatus = "ACTIVE" | "DISABLED";
export type JoinRequestStatus = "PENDING" | "APPROVED" | "REJECTED";

export interface Preferences {
  email_notifications: boolean;
  product_updates: boolean;
}

export interface User {
  id: string;
  uid: string;
  email: string;
  display_name: string | null;
  photo_url: string | null;
  phone: string | null;
  job_title: string | null;
  bio: string | null;
  timezone: string;
  locale: string;
  preferences: Preferences;
  default_organization_id: string | null;
  email_verified: boolean;
  created_at: string | null;
}

export interface Membership {
  business_id: string;
  organization_id: string;
  business_name: string;
  organization_name: string;
  business_slug: string;
  role: Role;
  permissions: string[];
  effective_permissions: string[];
}

/** The applicant's own view of a request, from /auth/me. */
export interface OwnJoinRequest {
  id: string;
  organization_id: string;
  organization_name: string;
  status: JoinRequestStatus;
  requested_at: string | null;
}

/** A manager's view of a request, from /businesses/:id/join-requests. */
export interface JoinRequest {
  id: string;
  user_id: string;
  email: string;
  display_name: string | null;
  status: JoinRequestStatus;
  requested_at: string | null;
  reviewed_at: string | null;
}

export interface Member {
  user_id: string;
  email: string;
  display_name: string | null;
  role: Role;
  status: MemberStatus;
  permissions: string[];
  denied_permissions?: string[];
}

export interface Organization {
  id: string;
  name: string;
  slug: string;
  status: string;
  join_code?: string | null;
  settings_json?: Record<string, unknown>;
  prime_user_id?: string;
}

export type NotificationType =
  "join_request.created" | "join_request.approved" | "join_request.rejected";

export interface Notification {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  organization_id: string | null;
  organization_name: string | null;
  section: string | null;
  resource_type: string | null;
  resource_id: string | null;
  read: boolean;
  read_at: string | null;
  created_at: string | null;
}

export interface NotificationFeed {
  items: Notification[];
  unread_count: number;
}

export interface Agent {
  id: string;
  name: string;
  status?: string;
  model_provider?: string;
  model_name?: string;
}

export interface KnowledgeSource {
  id: string;
  name: string;
  status?: string;
  source_type?: string;
}

export interface Customer {
  id: string;
  display_name?: string | null;
  email?: string | null;
  phone?: string | null;
}

export interface Conversation {
  id: string;
  status?: string;
  channel?: string | null;
  last_message_at?: string | null;
}

export interface Channel {
  id: string;
  name?: string;
  status?: string;
  /** The channel type as sent by the API ("web", "email", …). */
  channel?: string;
  public_id?: string | null;
}

export interface Invitation {
  id: string;
  email: string;
  role: Role;
  status: string;
}

/** Shape of /auth/me and every endpoint that returns the whole account. */
export interface AccountResponse {
  user: User;
  memberships: Membership[];
  join_requests: OwnJoinRequest[];
}

export interface ProfileUpdate {
  display_name?: string | null;
  photo_url?: string | null;
  phone?: string | null;
  job_title?: string | null;
  bio?: string | null;
  timezone?: string;
  locale?: string;
  default_organization_id?: string | null;
  preferences?: Partial<Preferences>;
}
