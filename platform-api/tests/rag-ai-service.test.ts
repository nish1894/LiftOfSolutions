import { afterEach, describe, expect, it, vi } from "vitest";
import { RagAiService } from "../src/ai-gateway/rag.js";
import { loadConfig } from "../src/config.js";

const config = loadConfig({
  APP_ENV: "test",
  APP_SECRET_KEY: "test-secret-key-123456",
  AI_SERVICE_MODE: "rag",
  AI_SERVICE_URL: "http://rag.internal:8010",
  AI_SERVICE_SERVER_ID: "chatbot-platform",
  AI_SERVICE_API_KEY: "rag-secret",
  AI_SERVICE_DOCUMENT_BASE_URL: "http://rag-files",
});

const request = {
  organizationId: "organization-1",
  customerMessage: "What is the refund window?",
  agent: {
    agentId: "agent-1",
    versionId: "version-1",
    name: "Support",
    instructions: "Help customers.",
    modelProvider: "rag",
    modelName: "rag-query",
    modelConfig: {},
    tone: null,
    languages: ["en"],
    knowledgeEnabled: true,
    knowledgeSourceIds: ["handbook"],
  },
};

afterEach(() => vi.unstubAllGlobals());

describe("RAG AI service adapter", () => {
  it("maps an agent turn to the RAG query contract", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      Response.json({
        answer: "Thirty days.",
        ragDbId: "organization-1:handbook",
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await new RagAiService(config).generate(request);

    expect(result.content).toBe("Thirty days.");
    expect(fetchMock).toHaveBeenCalledWith(
      "http://rag.internal:8010/api/v1/query",
      expect.objectContaining({ method: "POST" }),
    );
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body).toEqual({
      serverId: "chatbot-platform",
      serverSecret: "rag-secret",
      question: "What is the refund window?",
      ragDbId: "organization-1:handbook",
    });
  });

  it("maps local knowledge uploads and status polling", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json(
          { jobId: "organization-1:handbook", status: "queued" },
          { status: 202 },
        ),
      )
      .mockResolvedValueOnce(
        Response.json({ status: "done", ragDbId: "organization-1:handbook" }),
      );
    vi.stubGlobal("fetch", fetchMock);
    const service = new RagAiService(config);

    await expect(
      service.submitKnowledge({
        organizationId: "organization-1",
        sourceId: "handbook",
        storageKey: "organization-1/refund policy.txt",
        metadata: {},
      }),
    ).resolves.toEqual({ jobId: "organization-1:handbook", status: "PENDING" });
    const submission = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(submission.documentLink).toBe(
      "http://rag-files/organization-1/refund%20policy.txt",
    );

    await expect(
      service.knowledgeStatus("organization-1:handbook"),
    ).resolves.toEqual({
      jobId: "organization-1:handbook",
      status: "READY",
      progress: 100,
    });
  });
});
