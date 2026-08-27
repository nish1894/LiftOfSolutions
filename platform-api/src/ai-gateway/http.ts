import { AppError } from "../common/errors.js";
import type { Config } from "../config.js";
import type {
  AiService,
  GenerateRequest,
  GenerateResult,
  KnowledgeSubmission,
} from "./types.js";

export class HttpAiService implements AiService {
  constructor(private readonly config: Config) {}
  private async call<T>(path: string, init: RequestInit): Promise<T> {
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      this.config.AI_SERVICE_TIMEOUT_MS,
    );
    try {
      const response = await fetch(
        `${this.config.AI_SERVICE_URL.replace(/\/$/, "")}${path}`,
        {
          ...init,
          signal: controller.signal,
          headers: {
            "content-type": "application/json",
            ...(this.config.AI_SERVICE_API_KEY
              ? { "x-platform-api-key": this.config.AI_SERVICE_API_KEY }
              : {}),
            ...init.headers,
          },
        },
      );
      if (!response.ok)
        throw new AppError(
          "AI_SERVICE_ERROR",
          "The AI service could not complete the request.",
          502,
          { upstream_status: response.status },
        );
      return (await response.json()) as T;
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError(
        "AI_SERVICE_UNAVAILABLE",
        "The AI service is unavailable.",
        503,
      );
    } finally {
      clearTimeout(timeout);
    }
  }
  generate(request: GenerateRequest) {
    return this.call<GenerateResult>("/internal/v1/generate", {
      method: "POST",
      body: JSON.stringify(request),
    });
  }
  testAgent(request: GenerateRequest) {
    return this.call<GenerateResult>("/internal/v1/agents/test", {
      method: "POST",
      body: JSON.stringify(request),
    });
  }
  submitKnowledge(request: KnowledgeSubmission) {
    return this.call<{ jobId: string; status: string }>(
      "/internal/v1/knowledge/jobs",
      { method: "POST", body: JSON.stringify(request) },
    );
  }
  knowledgeStatus(jobId: string) {
    return this.call<{
      jobId: string;
      status: string;
      progress?: number;
      errorCode?: string;
    }>(`/internal/v1/knowledge/jobs/${encodeURIComponent(jobId)}`, {
      method: "GET",
    });
  }
}
