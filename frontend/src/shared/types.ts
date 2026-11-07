/* Domain models returned by the platform API. Field names are snake_case
   because they mirror the JSON the Node API sends; converting them would mean
   maintaining a mapping layer for no benefit. */

export type Role = "PRIME" | "OWNER" | "ADMIN" | "AGENT" | "VIEWER" | "CUSTOM";
export type MemberStatus = "ACTIVE" | "SUSPENDED";
export type JoinRequestStatus = "PENDING" | "APPROVED" | "REJECTED";

/** Firestore timestamps reach the browser as ISO strings or {_seconds} objects. */
export type ApiTime = string | { _seconds: number } | null | undefined;

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
  terms_required?: boolean;
  current_terms_version?: string;
  terms_url?: string | null;
}

export interface Project {
  id: string;
  org_id: string;
  name: string;
  description?: string;
  status: "active" | "archived" | "deleted";
  effective_permissions: string[];
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

/* What an agent says and knows. The draft and the published copy have the same shape. */
export interface AgentSettings {
  instructions: string;
  tone: string | null;
  languages: string[];
  /** The one knowledge source it searches, if any. */
  source_id: string | null;
  model: string;
  /** direct: one step writes the reply. checked: a second step reviews each reply first. */
  flow: "direct" | "checked";
}

/* Customers get `published`; the studio's test chat runs the saved `draft`. */
export interface Agent {
  id: string;
  name: string;
  description: string | null;
  status: "draft" | "live" | "paused" | "archived";
  draft: AgentSettings;
  published: AgentSettings | null;
  version: number;
  published_version: number | null;
  /** True when customers don't get the latest saved draft. */
  unpublished_changes: boolean;
  published_at: ApiTime | null;
  created_at: ApiTime;
  updated_at: ApiTime;
}

/* A workflow: one trigger and the steps it runs (Schema_liftofsol workflow-schema). Nothing runs them yet. */
export type WorkflowTrigger = "conversation_opened" | "message_received" | "conversation_closed";
export type BranchCondition = "business_hours" | "returning_contact" | "has_email";

export type WorkflowAction =
  | { id: string; type: "send_message"; text: string }
  | { id: string; type: "hand_to_agent"; assistant_id?: string }
  | { id: string; type: "assign"; to: "round_robin" | "member" | "nobody"; member_id?: string }
  | { id: string; type: "ask"; text: string; save_to: "display_name" | "email" | "phone" }
  | { id: string; type: "add_note"; text: string }
  | { id: string; type: "wait"; minutes: number }
  | { id: string; type: "close" };

export interface WorkflowBranch {
  id: string;
  type: "branch";
  condition: BranchCondition;
  yes: WorkflowAction[];
  no: WorkflowAction[];
}

export type WorkflowStep = WorkflowAction | WorkflowBranch;

export interface Workflow {
  id: string;
  name: string;
  description: string | null;
  template_id: string | null;
  status: "off" | "on";
  trigger: WorkflowTrigger;
  steps: WorkflowStep[];
  version: number;
  /** Why it can't be turned on yet, or null when every step is complete. */
  incomplete: string | null;
  created_at: ApiTime;
  updated_at: ApiTime;
}

/* One uploaded document, which the RAG service turns into one knowledge base.
   status and the counts come from the RAG service. */
export interface KnowledgeSource {
  id: string;
  name: string;
  file_name: string;
  file_size: number;
  status: string;
  job_status: string | null;
  error: string | null;
  strategy: string | null;
  token_count: number | null;
  chunk_count: number | null;
  created_by: string;
  created_at: ApiTime;
}

export interface Customer {
  id: string;
  display_name?: string | null;
  email?: string | null;
  phone?: string | null;
  created_at?: ApiTime;
}

export interface Conversation {
  id: string;
  status?: string;
  channel?: string | null;
  assistant_id?: string;
  customer_id?: string;
  channel_connection_id?: string | null;
  assigned_user_id?: string | null;
  summary?: string | null;
  last_message_at?: ApiTime;
  created_at?: ApiTime;
}

/* The RAG service decides a citation's fields; the UI reads the common ones
   (title, snippet, page) and ignores the rest. */
export type Citation = Record<string, unknown>;

export interface ConversationMessage {
  id: string;
  sender_type: "CUSTOMER" | "ASSISTANT" | "AGENT" | string;
  sender_user_id: string | null;
  content: string;
  message_metadata?: { citations?: Citation[] } & Record<string, unknown>;
  created_at?: ApiTime;
}

export interface MessagePage {
  items: ConversationMessage[];
  next_cursor: string | null;
}

export interface Channel {
  id: string;
  name?: string;
  status?: string;
  /** The channel type as sent by the API ("web", "email", …). */
  channel?: string;
  public_id?: string | null;
  assistant_id?: string;
  allowed_domains?: string[];
}

export interface ChannelInstall {
  public_id: string;
  channel: string;
  widget_api_path: string;
  installation_snippet: string;
}

export interface Integration {
  id: string;
  integration_type: string;
  display_name: string;
  status: string;
  has_secret?: boolean;
  created_at?: ApiTime;
}

export interface Invitation {
  id: string;
  email: string;
  role: Role;
  status: string;
}

export interface AnalyticsSummary {
  conversations: number;
  resolved: number;
  human_active: number;
  messages: number;
  model_runs: number;
  input_tokens: number;
  output_tokens: number;
  estimated_cost_usd: number;
}

export interface UsageTotals {
  model_runs: number;
  input_tokens: number;
  output_tokens: number;
  cached_tokens: number;
  estimated_cost_usd: number;
  average_latency_ms: number;
}

export interface UsageBreakdownRow extends UsageTotals {
  key: string;
}

export interface Subscription {
  plan_code?: string;
  planCode?: string;
  status?: string;
}

/** Billing profile fields use the platform API's snake_case names. */
export interface BillingProfile {
  legal_name?: string | null;
  email?: string | null;
}

/** Shape of /auth/me and every endpoint that returns the whole account. */
export interface AccountResponse {
  user: User;
  memberships: Membership[];
  projects?: Project[];
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
