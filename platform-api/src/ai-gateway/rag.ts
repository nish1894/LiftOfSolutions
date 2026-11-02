import { AppError } from "../common/errors.js";
import type { Config } from "../config.js";
import type {
  AiService,
  GenerateRequest,
  GenerateResult,
  KnowledgeSubmission,
} from "./types.js";

type RagQueryResponse = {
  answer: string;
  ragDbId: string;
};

type RagJobResponse = {
  jobId: string;
  status: string;
};

type RagJobStatusResponse = {
  status: string;
  ragDbId?: string;
  documentLink?: string;
};

const tokenEstimate = (value: string): number =>
  value.trim() ? value.trim().split(/\s+/).length : 0;

const platformStatus = (status: string): string => {
  switch (status.toLowerCase()) {
    case "queued":
      return "PENDING";
    case "processing":
      return "PROCESSING";
    case "done":
    case "completed":
    case "ready":
      return "READY";
    case "failed":
      return "FAILED";
    default:
      return status.toUpperCase();
  }
};

export class RagAiService implements AiService {
  constructor(private readonly config: Config) {}

  private credentials() {
    if (!this.config.AI_SERVICE_API_KEY)
      throw new AppError(
        "AI_SERVICE_NOT_CONFIGURED",
        "The RAG service credential is not configured.",
        503,
      );
    return {
      serverId: this.config.AI_SERVICE_SERVER_ID,
      serverSecret: this.config.AI_SERVICE_API_KEY,
    };
  }

  private async call<T>(
    path: string,
    body: Record<string, unknown>,
  ): Promise<T> {
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      this.config.AI_SERVICE_TIMEOUT_MS,
    );
    try {
      const response = await fetch(
        `${this.config.AI_SERVICE_URL.replace(/\/$/, "")}${path}`,
        {
          method: "POST",
          signal: controller.signal,
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ ...this.credentials(), ...body }),
        },
      );
      if (!response.ok)
        throw new AppError(
          "AI_SERVICE_ERROR",
          "The RAG service could not complete the request.",
          502,
          { upstream_status: response.status },
        );
      return (await response.json()) as T;
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError(
        "AI_SERVICE_UNAVAILABLE",
        "The RAG service is unavailable.",
        503,
      );
    } finally {
      clearTimeout(timeout);
    }
  }

  private ragDatabaseId(request: GenerateRequest): string {
    const resourceId =
      request.agent.knowledgeSourceIds[0] ?? request.agent.agentId;
    return `${request.organizationId}:${resourceId}`.slice(0, 128);
  }

  private documentLink(request: KnowledgeSubmission): string {
    if (request.sourceUri) return request.sourceUri;
    if (!request.storageKey)
      throw new AppError(
        "KNOWLEDGE_DOCUMENT_UNAVAILABLE",
        "The knowledge document has no readable location.",
        422,
      );
    const encodedKey = request.storageKey
      .split("/")
      .map(encodeURIComponent)
      .join("/");
    return `${this.config.AI_SERVICE_DOCUMENT_BASE_URL.replace(/\/$/, "")}/${encodedKey}`;
  }

  async generate(request: GenerateRequest): Promise<GenerateResult> {
    const started = Date.now();
    const response = await this.call<RagQueryResponse>("/api/v1/query", {
      question: request.customerMessage,
      ragDbId: this.ragDatabaseId(request),
    });
    return {
      content: response.answer,
      provider: "rag-service",
      model: "rag-query",
      inputTokens: tokenEstimate(request.customerMessage),
      outputTokens: tokenEstimate(response.answer),
      cachedTokens: 0,
      latencyMs: Date.now() - started,
      estimatedCostUsd: 0,
      finishReason: "stop",
      citations: [],
    };
  }

  testAgent(request: GenerateRequest): Promise<GenerateResult> {
    return this.generate({ ...request, testMode: true });
  }

  async submitKnowledge(request: KnowledgeSubmission) {
    const response = await this.call<RagJobResponse>("/api/v1/document", {
      documentLink: this.documentLink(request),
      ragDbId: `${request.organizationId}:${request.sourceId}`.slice(0, 128),
    });
    return { jobId: response.jobId, status: platformStatus(response.status) };
  }

  async knowledgeStatus(jobId: string) {
    const response = await this.call<RagJobStatusResponse>(
      "/api/v1/document/status",
      { ragDbId: jobId },
    );
    const status = platformStatus(response.status);
    return {
      jobId,
      status,
      ...(status === "READY"
        ? { progress: 100 }
        : status === "FAILED"
          ? { progress: 0, errorCode: "RAG_INGESTION_FAILED" }
          : {}),
    };
  }
}
