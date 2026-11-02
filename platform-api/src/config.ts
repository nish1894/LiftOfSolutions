import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { z } from "zod";

const booleanFromEnv = z.preprocess(
  (value) =>
    typeof value === "string"
      ? ["1", "true", "yes", "on"].includes(value.toLowerCase())
      : value,
  z.boolean(),
);
const optionalUrl = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z.string().url().optional(),
);

const schema = z.object({
  APP_ENV: z.enum(["development", "test", "production"]).default("development"),
  HOST: z.string().default("0.0.0.0"),
  PORT: z.coerce.number().int().positive().default(8000),
  API_PREFIX: z.string().default("/api/v1"),
  DATABASE_BACKEND: z
    .enum(["firestore", "legacy-firestore"])
    .default("firestore"),
  TERMS_VERSION: z.string().min(1).default("development-preview"),
  // Where the published terms are read; shown next to the acceptance checkbox.
  TERMS_URL: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.url().optional(),
  ),
  DEFAULT_PLAN_CREDITS: z.coerce.number().int().nonnegative().default(1000),
  DEFAULT_PLAN_PROJECTS: z.coerce.number().int().positive().default(3),
  DEFAULT_PLAN_MEMBERS: z.coerce.number().int().positive().default(10),
  REDIS_URL: z.string().default("redis://localhost:6379/0"),
  APP_SECRET_KEY: z.string().min(16).default("development-only-change-me"),
  FIREBASE_PROJECT_ID: z.string().min(1).default("demo-erp-chatbot"),
  FIREBASE_APP_NAME: z.string().min(1).default("erp-chatbot-platform"),
  FIREBASE_SERVICE_ACCOUNT_JSON: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.string().optional(),
  ),
  FIREBASE_CHECK_REVOKED_TOKENS: booleanFromEnv.default(true),
  ALLOWED_ORIGINS: z
    .string()
    .default("http://localhost:5173,http://localhost:3000"),
  FRONTEND_URL: z.string().url().default("http://localhost:5173"),
  AI_SERVICE_MODE: z.enum(["mock", "http", "rag"]).default("mock"),
  AI_SERVICE_URL: z.string().url().default("http://rag-service:8010"),
  AI_SERVICE_SERVER_ID: z.string().min(1).max(128).default("chatbot-platform"),
  AI_SERVICE_API_KEY: z.string().optional(),
  AI_SERVICE_TIMEOUT_MS: z.coerce.number().int().positive().default(30_000),
  AI_SERVICE_DOCUMENT_BASE_URL: z.string().url().default("http://rag-files"),
  // The RAG service (LiftOfMain) and the address it downloads uploaded documents from.
  RAG_SERVICE_URL: z.url().default("http://127.0.0.1:8001"),
  PUBLIC_API_URL: z.url().default("http://localhost:8000"),
  STORAGE_BACKEND: z.enum(["local", "s3"]).default("local"),
  LOCAL_STORAGE_PATH: z.string().default("./data/uploads"),
  MAX_UPLOAD_BYTES: z.coerce
    .number()
    .int()
    .positive()
    .default(20 * 1024 * 1024),
  S3_ENDPOINT_URL: optionalUrl,
  S3_REGION: z.string().default("us-east-1"),
  S3_BUCKET: z.string().optional(),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),
});

export type Config = z.infer<typeof schema> & { allowedOrigins: string[] };

export function loadConfig(
  environment: NodeJS.ProcessEnv = process.env,
): Config {
  if (environment === process.env) {
    for (const candidate of [
      resolve(process.cwd(), ".env"),
      resolve(process.cwd(), "../.env"),
    ]) {
      if (existsSync(candidate)) {
        process.loadEnvFile(candidate);
        break;
      }
    }
  }
  const parsed = schema.parse(environment);
  if (parsed.APP_ENV === "production") {
    if (parsed.TERMS_VERSION === "development-preview")
      throw new Error(
        "TERMS_VERSION must identify published terms in production",
      );
    if (!parsed.TERMS_URL)
      throw new Error(
        "TERMS_URL must link to the published terms in production",
      );
    if (parsed.APP_SECRET_KEY === "development-only-change-me")
      throw new Error("APP_SECRET_KEY must be configured in production");
    if (parsed.FIREBASE_PROJECT_ID.startsWith("demo-"))
      throw new Error("FIREBASE_PROJECT_ID must be configured in production");
    if (!parsed.FIREBASE_CHECK_REVOKED_TOKENS)
      throw new Error(
        "Firebase token revocation checks must be enabled in production",
      );
    if (parsed.STORAGE_BACKEND === "s3" && !parsed.S3_BUCKET)
      throw new Error("S3_BUCKET must be configured for S3 storage");
  }
  return {
    ...parsed,
    allowedOrigins: parsed.ALLOWED_ORIGINS.split(",")
      .map((item) => item.trim())
      .filter(Boolean),
  };
}
