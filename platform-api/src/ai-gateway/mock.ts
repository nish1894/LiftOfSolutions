import { randomUUID } from "node:crypto";
import type {
  AiService,
  GenerateRequest,
  GenerateResult,
  KnowledgeSubmission,
} from "./types.js";

export class MockAiService implements AiService {
  async generate(request: GenerateRequest): Promise<GenerateResult> {
    const started = Date.now();
    const content = `[${request.agent.name}] ${request.customerMessage}`;
    return {
      content,
      provider: "mock",
      model: "deterministic-echo",
      inputTokens: request.customerMessage.split(/\s+/).length,
      outputTokens: content.split(/\s+/).length,
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
  async submitKnowledge(_request: KnowledgeSubmission) {
    return { jobId: `mock-${randomUUID()}`, status: "PENDING" };
  }
  async knowledgeStatus(jobId: string) {
    return { jobId, status: "READY", progress: 100 };
  }
}
