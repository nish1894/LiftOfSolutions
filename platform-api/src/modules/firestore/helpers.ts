import type { AgentConfiguration } from "../../ai-gateway/index.js";
import type { DocumentData, DocumentReference } from "firebase-admin/firestore";
import { document } from "../../firebase/store.js";

export const organizationCollections = {
  members: "members",
  agents: "agents",
  agentVersions: "agentVersions",
  customers: "customers",
  channels: "channels",
  conversations: "conversations",
  knowledgeSources: "knowledgeSources",
  knowledgeDocuments: "knowledgeDocuments",
  tools: "tools",
  toolRuns: "toolRuns",
  usage: "usage",
  stats: "stats",
  auditEvents: "auditEvents",
  integrations: "integrations",
  jobs: "jobs",
} as const;

export type StoredAgent = {
  name: string;
  description: string | null;
  instructions: string;
  modelProvider: string;
  modelName: string;
  modelConfig: Record<string, unknown>;
  tone: string | null;
  languages: string[];
  escalationPolicy: Record<string, unknown>;
  status: string;
  lifecycleStatus: string;
  knowledgeEnabled: boolean;
  knowledgeSourceIds: string[];
  toolIds: string[];
  usageLimits: Record<string, unknown>;
  version: number;
  activeVersionId: string | null;
  draftVersionId: string | null;
  createdBy: string;
  createdAt: unknown;
  updatedAt: unknown;
};

export function agentApi(
  agent: StoredAgent & { id: string },
  organizationId: string,
) {
  return {
    id: agent.id,
    business_id: organizationId,
    organization_id: organizationId,
    name: agent.name,
    description: agent.description,
    instructions: agent.instructions,
    model_provider: agent.modelProvider,
    model_name: agent.modelName,
    model_config_json: agent.modelConfig,
    tone: agent.tone,
    languages: agent.languages,
    escalation_policy_json: agent.escalationPolicy,
    status: agent.status,
    lifecycle_status: agent.lifecycleStatus,
    knowledge_enabled: agent.knowledgeEnabled,
    knowledge_source_ids: agent.knowledgeSourceIds,
    tool_ids: agent.toolIds,
    usage_limits_json: agent.usageLimits,
    version: agent.version,
    active_version_id: agent.activeVersionId,
    draft_version_id: agent.draftVersionId,
    created_at: agent.createdAt,
    updated_at: agent.updatedAt,
  };
}

export function aiAgent(
  agent: StoredAgent & { id: string },
  versionId?: string | null,
): AgentConfiguration {
  return {
    agentId: agent.id,
    versionId: versionId ?? agent.activeVersionId ?? agent.draftVersionId,
    name: agent.name,
    instructions: agent.instructions,
    modelProvider: agent.modelProvider,
    modelName: agent.modelName,
    modelConfig: agent.modelConfig,
    tone: agent.tone,
    languages: agent.languages,
    knowledgeEnabled: agent.knowledgeEnabled,
  };
}

export async function loadDocument<T extends DocumentData>(
  reference: DocumentReference,
): Promise<(T & { id: string }) | null> {
  return document<T>(await reference.get());
}

export function publicTokenId(value: string): string {
  return Buffer.from(value).toString("base64url");
}
