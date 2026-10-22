export interface AgentConfiguration {
  agentId: string;
  versionId: string | null;
  name: string;
  instructions: string;
  modelProvider: string;
  modelName: string;
  modelConfig: Record<string, unknown>;
  tone: string | null;
  languages: string[];
  knowledgeEnabled: boolean;
  knowledgeSourceIds: string[];
}
export interface GenerateRequest {
  organizationId: string;
  conversationId?: string;
  customerMessage: string;
  agent: AgentConfiguration;
  testMode?: boolean;
}
export interface GenerateResult {
  content: string;
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
  latencyMs: number;
  estimatedCostUsd: number;
  finishReason: string;
  citations?: Array<Record<string, unknown>>;
}
export interface KnowledgeSubmission {
  organizationId: string;
  sourceId: string;
  documentId?: string;
  storageKey?: string;
  sourceUri?: string;
  metadata: Record<string, unknown>;
}
export interface AiService {
  generate(request: GenerateRequest): Promise<GenerateResult>;
  testAgent(request: GenerateRequest): Promise<GenerateResult>;
  submitKnowledge(
    request: KnowledgeSubmission,
  ): Promise<{ jobId: string; status: string }>;
  knowledgeStatus(jobId: string): Promise<{
    jobId: string;
    status: string;
    progress?: number;
    errorCode?: string;
  }>;
}
