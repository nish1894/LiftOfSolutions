import Fastify, { type FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import multipart from "@fastify/multipart";
import { createFirebaseServices, firebaseTokens } from "../firebase/admin.js";
import { loadConfig, type Config } from "../config.js";
import { AppError } from "../common/errors.js";
import { Database, duplicate } from "./database.js";
import { Platform } from "./platform.js";
import { authRoutes, type TokenVerifier } from "./http.js";
import { organizationRoutes } from "./organizations.js";
import { inboxRoutes } from "./inbox.js";
import { toolRoutes } from "./tools.js";
import { billingRoutes } from "./billing.js";
import { knowledgeRoutes } from "./knowledge.js";
import { assistantRoutes } from "./assistants.js";
import { workflowRoutes } from "./workflows.js";

export interface AppDependencies {
  database?: Database;
  verifyToken?: TokenVerifier;
  revokeTokens?: (uid: string) => Promise<void>;
}

// The platform API on native Firestore, the database it shares with the RAG.
// Ported: sign-in, account, organizations, members, invitations, projects, contacts, inbox,
// notifications, tool runs, billing, knowledge sources, agents and workflows. The maintenance sweeps run as their own
// process.
export async function buildFirestoreApp(
  config: Config = loadConfig(),
  dependencies: AppDependencies = {},
): Promise<FastifyInstance> {
  const app = Fastify({
    logger:
      config.APP_ENV === "test"
        ? false
        : {
            level: "info",
            redact: [
              "req.headers.authorization",
              "req.headers.cookie",
              "*.invitation_token",
              "*.token_hash",
            ],
          },
    trustProxy: false,
    bodyLimit: 1024 * 1024,
  });
  const firebase = dependencies.verifyToken
    ? undefined
    : createFirebaseServices(config);
  const db =
    dependencies.database ??
    new Database((firebase ?? createFirebaseServices(config)).firestore);
  const platform = new Platform(db, config);
  const tokens =
    firebase &&
    firebaseTokens(firebase.auth, config.FIREBASE_CHECK_REVOKED_TOKENS);
  const verify = dependencies.verifyToken ?? tokens!.verify;
  const revoke = dependencies.revokeTokens ?? tokens!.revoke;
  await app.register(cors, {
    origin: (origin, callback) =>
      callback(null, !origin || config.allowedOrigins.includes(origin)),
    credentials: false,
  });
  await app.register(rateLimit, { max: 300, timeWindow: "1 minute" });
  // Knowledge uploads: one document per request, up to MAX_UPLOAD_BYTES.
  await app.register(multipart, {
    limits: { fileSize: config.MAX_UPLOAD_BYTES, files: 1, fields: 5 },
  });
  app.addHook("onSend", async (_req, reply, payload) => {
    reply
      .header("x-content-type-options", "nosniff")
      .header("x-frame-options", "DENY")
      .header("referrer-policy", "no-referrer");
    return payload;
  });
  app.setErrorHandler((error, request, reply) => {
    const known =
      error instanceof AppError
        ? error
        : duplicate(error)
          ? new AppError(
              "CONFLICT",
              "A record with this unique value already exists.",
              409,
            )
          : undefined;
    const reported = (error as { statusCode?: number }).statusCode;
    const status =
      known?.statusCode ??
      (reported && reported >= 400 && reported < 500 ? reported : 500);
    if (!known && status === 500)
      request.log.error({ err: error }, "Request failed");
    return reply.code(status).send({
      error: {
        code:
          known?.code.toLowerCase() ??
          (status === 429
            ? "rate_limit_exceeded"
            : status === 400
              ? "bad_request"
              : "internal_error"),
        message:
          known?.message ??
          (status === 429
            ? "Too many requests."
            : status === 400
              ? "Invalid request body."
              : "An unexpected error occurred."),
        request_id: request.id,
        details: known?.details ?? {},
      },
    });
  });
  app.get("/health", async () => ({
    status: "ok",
    service: "platform-api",
    database: "firestore",
  }));
  app.get("/ready", async (_request, reply) => {
    try {
      await platform.defaultPlan();
      return { status: "ready" };
    } catch {
      return reply.code(503).send({ status: "not_ready" });
    }
  });
  await app.register(
    async (api) => {
      await authRoutes(api, platform, verify, revoke);
      await organizationRoutes(api, platform, verify);
      await inboxRoutes(api, platform, verify);
      await toolRoutes(api, platform, verify);
      await billingRoutes(api, platform, verify);
      await knowledgeRoutes(api, platform, verify);
      await assistantRoutes(api, platform, verify);
      await workflowRoutes(api, platform, verify);
    },
    { prefix: config.API_PREFIX },
  );
  app.addHook("onClose", async () => {
    if (!dependencies.database) await db.close();
  });
  return app;
}
