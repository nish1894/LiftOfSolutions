import { afterEach, describe, expect, it, vi } from "vitest";
import { HttpAiService } from "../src/ai-gateway/http.js";
import { loadConfig } from "../src/config.js";

const config = loadConfig({
  APP_ENV: "test",
  APP_SECRET_KEY: "test-secret-key-123456",
  AI_SERVICE_URL: "http://ai.internal:8010",
  AI_SERVICE_MODE: "http",
});
afterEach(() => vi.unstubAllGlobals());

describe("HTTP AI failure boundary", () => {
  it("normalizes network failures", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("network")));
    const service = new HttpAiService(config);
    await expect(service.knowledgeStatus("job")).rejects.toMatchObject({
      code: "AI_SERVICE_UNAVAILABLE",
      statusCode: 503,
    });
  });
  it("normalizes upstream failures", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("failed", { status: 500 })),
    );
    const service = new HttpAiService(config);
    await expect(service.knowledgeStatus("job")).rejects.toMatchObject({
      code: "AI_SERVICE_ERROR",
      statusCode: 502,
      details: { upstream_status: 500 },
    });
  });
});
