import type { Config } from "../config.js";
import { HttpAiService } from "./http.js";
import { MockAiService } from "./mock.js";
import type { AiService } from "./types.js";
export type {
  AiService,
  AgentConfiguration,
  GenerateRequest,
  GenerateResult,
} from "./types.js";
export const createAiService = (config: Config): AiService =>
  config.AI_SERVICE_MODE === "http"
    ? new HttpAiService(config)
    : new MockAiService();
