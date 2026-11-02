import {
  FieldValue,
  Timestamp,
  type DocumentData,
  type Firestore,
  type Query,
  type Transaction,
} from "firebase-admin/firestore";
import type {
  User,
  AuthIdentity,
} from "../domain/schema/user-schema/users.types.js";
import type {
  Organization,
  Invitation,
} from "../domain/schema/organization-schema/organizations.types.js";
import type {
  Project,
  ProjectMemberCopy,
} from "../domain/schema/project-schema/projects.types.js";
import type {
  Plan,
  BillingAccount,
  CreditEntry,
  UsageCharge,
  Invoice,
  BillingEvent,
} from "../domain/schema/billing-schema/billing.types.js";
import type {
  Contact,
  ContactIdentity,
} from "../domain/schema/contact-schema/contacts.types.js";
import type {
  Conversation,
  Message,
} from "../domain/schema/inbox-schema/inbox.types.js";
import type { ToolRun } from "../domain/schema/tool-run-schema/tool_runs.types.js";
import type { Notification } from "../domain/schema/notification-schema/notifications.types.js";
import type { AuditEvent } from "../domain/schema/audit-schema/audit_events.types.js";
import type { KnowledgeSource } from "../domain/schema/knowledge-source-schema/knowledge_sources.types.js";
import type { Assistant } from "../domain/schema/assistant-schema/assistants.types.js";

// A value that must be unique, such as an email address. Its document id is the value itself (see claim()).
export interface UniqueValue {
  _id: string;
  owner_id: string; // _id of the document that holds the value
  created_at: Date;
}

// The RAG's agent records (its agent schema). The platform writes them for its assistants (assistants.ts);
// the inbox reads only the project, status and deletion.
export interface AgentRecord {
  _id: string;
  project_id: string;
  template_id: string;
  name: string;
  status: string; // "active" | "paused"
  created_by: string;
  created_at: Date;
  updated_at: Date;
  deleted_at?: Date;
}
export interface AgentNodeRecord {
  id: string;
  node_type_id: string;
  name: string; // a slug, e.g. "reply"
  config: Record<string, unknown>;
  created_at: Date;
  updated_at: Date;
}
export interface AgentTemplateRecord {
  _id: string;
  project_id: string;
  name: string;
  rag_enabled: boolean;
  rag_id?: string;
  nodes: AgentNodeRecord[];
  edges: { from: string; to: string }[];
  triggers: unknown[];
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}
// What runs a template's node. The platform only reads the RAG's platform node types (no project_id).
export interface NodeTypeRecord {
  _id: string;
  project_id?: string;
  category: string; // "chat_model" | "memory" | …
  handler: string; // e.g. "openai_chat"
  name: string;
  config: Record<string, unknown>;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

// The RAG's agent runs (its transactions schema). Billing and tool runs only read these fields.
export interface TransactionRecord {
  _id: string;
  project_id: string;
  agent_id: string;
  status: string; // "running" | "succeeded" | "failed"
  total_micros?: number;
}

// The RAG's knowledge base and its indexing job (its knowledge schema). Read only, for status and counts.
export interface RagRecord {
  _id: string;
  project_id: string;
  status: string; // "indexing" | "ready" | "failed" | "deleting"
  strategy?: string; // "plainText" | "simpleRag"
  token_count?: number;
  chunk_count?: number;
  updated_at?: Date;
}
export interface RagJobRecord {
  _id: string;
  project_id: string;
  rag_id: string;
  status: string; // "created" | "submitted" | "running" | "done" | "failed"
  error?: string;
}

export interface Collections {
  users: User;
  auth_identities: AuthIdentity;
  organizations: Organization;
  invitations: Invitation;
  projects: Project;
  project_members: ProjectMemberCopy;
  plans: Plan;
  billing_accounts: BillingAccount;
  credit_ledger: CreditEntry;
  usage_charges: UsageCharge;
  invoices: Invoice;
  billing_events: BillingEvent;
  contacts: Contact;
  contact_identities: ContactIdentity;
  conversations: Conversation;
  messages: Message;
  tool_runs: ToolRun;
  notifications: Notification;
  audit_events: AuditEvent;
  agents: AgentRecord;
  agent_templates: AgentTemplateRecord;
  node_types: NodeTypeRecord;
  transactions: TransactionRecord;
  knowledge_sources: KnowledgeSource;
  assistants: Assistant;
  rags: RagRecord;
  rag_jobs: RagJobRecord;
  unique_values: UniqueValue;
}
export type Name = keyof Collections;

// Narrows a collection to the documents a read needs, e.g. (q) => q.where("org_id", "==", orgId).
export type Filter = (query: Query) => Query;

// Reads work the same inside and outside a transaction, so helpers can take either.
export interface Reader {
  get<K extends Name>(name: K, id: string): Promise<Collections[K] | undefined>;
  find<K extends Name>(name: K, filter: Filter): Promise<Collections[K][]>;
}

// Removes a field in update(), like MongoDB's $unset.
export const deleteField = () => FieldValue.delete();

// Firestore's ALREADY_EXISTS: a create() met a document that exists. Here that is always a claimed unique value.
export const duplicate = (error: unknown) =>
  (error as { code?: number })?.code === 6;

// Firestore hands back Timestamps; the schema types use Date.
function withDates(value: unknown): unknown {
  if (value instanceof Timestamp) return value.toDate();
  if (Array.isArray(value)) return value.map(withDates);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, withDates(item)]),
    );
  return value;
}

const uniqueId = (kind: string, value: string) =>
  `${kind}:${encodeURIComponent(value)}`;

// Each document is stored under its own _id, and keeps _id as a field too (the RAG reads records the same way).
export class Database implements Reader {
  constructor(readonly firestore: Firestore) {}

  collection(name: Name) {
    return this.firestore.collection(name);
  }

  async get<K extends Name>(name: K, id: string) {
    const snapshot = await this.collection(name).doc(id).get();
    return snapshot.exists
      ? (withDates(snapshot.data()) as Collections[K])
      : undefined;
  }

  async find<K extends Name>(name: K, filter: Filter) {
    const snapshot = await filter(this.collection(name)).get();
    return snapshot.docs.map((doc) => withDates(doc.data()) as Collections[K]);
  }

  // Firestore needs every read in a transaction before its first write. Tx holds the writes back and
  // sends them together once work() returns, so reads and writes can be written in the natural order.
  // A read inside the transaction never sees the transaction's own writes.
  async transaction<T>(work: (tx: Tx) => Promise<T>): Promise<T> {
    return this.firestore.runTransaction(async (transaction) => {
      const tx = new Tx(this, transaction);
      const result = await work(tx);
      tx.sendWrites();
      return result;
    });
  }

  // Who holds a unique value, if anyone (see Tx.claim).
  async claimed(kind: string, value: string) {
    return this.get("unique_values", uniqueId(kind, value));
  }

  async close() {
    await this.firestore.terminate();
  }
}

export class Tx implements Reader {
  private readonly writes: Array<() => void> = [];

  constructor(
    private readonly db: Database,
    private readonly transaction: Transaction,
  ) {}

  private ref(name: Name, id: string) {
    return this.db.collection(name).doc(id);
  }

  async get<K extends Name>(name: K, id: string) {
    const snapshot = await this.transaction.get(this.ref(name, id));
    return snapshot.exists
      ? (withDates(snapshot.data()) as Collections[K])
      : undefined;
  }

  async find<K extends Name>(name: K, filter: Filter) {
    const snapshot = await this.transaction.get(
      filter(this.db.collection(name)),
    );
    return snapshot.docs.map((doc) => withDates(doc.data()) as Collections[K]);
  }

  // Fails the whole transaction if the document already exists.
  create<K extends Name>(name: K, doc: Collections[K]) {
    this.writes.push(() =>
      this.transaction.create(this.ref(name, doc._id), doc as DocumentData),
    );
  }

  // Replaces the whole document.
  set<K extends Name>(name: K, doc: Collections[K]) {
    this.writes.push(() =>
      this.transaction.set(this.ref(name, doc._id), doc as DocumentData),
    );
  }

  // Changes only the named fields; "a.b" names a nested field. Fails if the document is missing.
  update(name: Name, id: string, fields: DocumentData) {
    this.writes.push(() => this.transaction.update(this.ref(name, id), fields));
  }

  delete(name: Name, id: string) {
    this.writes.push(() => this.transaction.delete(this.ref(name, id)));
  }

  // Firestore has no unique indexes. A unique value gets a document named after it in unique_values,
  // so a second claim of the same value fails the transaction with ALREADY_EXISTS (see duplicate()).
  claim(kind: string, value: string, ownerId: string) {
    this.create("unique_values", {
      _id: uniqueId(kind, value),
      owner_id: ownerId,
      created_at: new Date(),
    });
  }

  // Who holds a unique value, if anyone. Reading it by id also guards the value against a concurrent claim.
  async claimed(kind: string, value: string) {
    return this.get("unique_values", uniqueId(kind, value));
  }

  release(kind: string, value: string) {
    this.delete("unique_values", uniqueId(kind, value));
  }

  sendWrites() {
    for (const write of this.writes) write();
  }
}
