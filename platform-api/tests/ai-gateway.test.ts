import { describe, expect, it } from "vitest";
import { MockAiService } from "../src/ai-gateway/mock.js";

describe("mock AI boundary", () => {
  it("returns deterministic output and usage", async () => {
    const service = new MockAiService();
    const result = await service.testAgent({
      organizationId: "org",
      customerMessage: "hello world",
      testMode: true,
      agent: {
        agentId: "agent",
        versionId: "version",
        name: "Support",
        instructions: "help",
        modelProvider: "mock",
        modelName: "echo",
        modelConfig: {},
        tone: null,
        languages: ["en"],
        knowledgeEnabled: false,
        knowledgeSourceIds: [],
      },
    });
    expect(result.content).toBe("[Support] hello world");
    expect(result.inputTokens).toBe(2);
    expect(result.estimatedCostUsd).toBe(0);
  });
});
