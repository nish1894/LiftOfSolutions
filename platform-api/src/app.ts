import Fastify, { type FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import rateLimit from "@fastify/rate-limit";
import { Redis } from "ioredis";
import { createAiService } from "./ai-gateway/index.js";
import { AppError } from "./common/errors.js";
import { loadConfig, type Config } from "./config.js";
import { createFirebaseServices } from "./firebase/admin.js";
import { PlatformStore } from "./firebase/store.js";
import { agentRoutes } from "./modules/agents/routes.js";
import { authRoutes, meRoute } from "./modules/auth/routes.js";
import { channelRoutes } from "./modules/channels/routes.js";
import {
  conversationRoutes,
  widgetRoutes,
} from "./modules/conversations/routes.js";
import { customerRoutes } from "./modules/customers/routes.js";
import { eventRoutes } from "./modules/events/routes.js";
import { handoffRoutes } from "./modules/handoffs/routes.js";
import { knowledgeRoutes } from "./modules/knowledge/routes.js";
import { notificationRoutes } from "./modules/notifications/routes.js";
import { operationsRoutes } from "./modules/operations/routes.js";
import { organizationRoutes } from "./modules/organizations/routes.js";
import { toolRoutes } from "./modules/tools/routes.js";
import { createStorage } from "./storage/index.js";

export async function buildApp(
  config: Config = loadConfig(),
): Promise<FastifyInstance> {
  const app = Fastify({
    logger: {
      level: config.APP_ENV === "test" ? "silent" : "info",
      redact: [
        "req.headers.authorization",
        "body.idToken",
        "body.secret_reference",
      ],
    },
    trustProxy: true,
    routerOptions: { ignoreTrailingSlash: true },
    requestIdHeader: "x-request-id",
  });
  const firebase = createFirebaseServices(config);
  app.decorate("config", config);
  app.decorate("firebase", firebase);
  app.decorate("store", new PlatformStore(firebase.firestore));
  await app.register(cors, {
    origin: (origin, callback) =>
      callback(null, !origin || config.allowedOrigins.includes(origin)),
    credentials: false,
  });
  await app.register(multipart, {
    limits: { fileSize: config.MAX_UPLOAD_BYTES, files: 1, fields: 20 },
  });
  let redis: Redis | undefined;
  if (config.APP_ENV !== "test") {
    redis = new Redis(config.REDIS_URL, {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
    });
    redis.on("error", (error: Error) =>
      app.log.warn({ err: error }, "Redis connection error"),
    );
  }
  await app.register(rateLimit, {
    max: 300,
    timeWindow: "1 minute",
    redis,
    skipOnError: config.APP_ENV !== "production",
  });
  app.addHook("onSend", async (_request, reply, payload) => {
    reply.header("x-content-type-options", "nosniff");
    reply.header("x-frame-options", "DENY");
    reply.header("referrer-policy", "no-referrer");
    return payload;
  });
  app.setErrorHandler((error, request, reply) => {
    if (error instanceof AppError) {
      void reply.status(error.statusCode).send({
        error: {
          code: error.code.toLowerCase(),
          message: error.message,
          request_id: request.id,
          details: error.details,
        },
      });
      return;
    }
    const fastifyError = error as typeof error & {
      statusCode?: number;
      validation?: unknown;
      code?: string;
    };
    if (fastifyError.validation) {
      void reply.status(422).send({
        error: {
          code: "validation_error",
          message: "Request validation failed.",
          request_id: request.id,
          details: { validation: fastifyError.validation },
        },
      });
      return;
    }
    if (fastifyError.statusCode === 429) {
      void reply.status(429).send({
        error: {
          code: "rate_limit_exceeded",
          message: "Too many requests. Try again later.",
          request_id: request.id,
          details: {},
        },
      });
      return;
    }
    request.log.error({ err: error }, "Unhandled request error");
    void reply
      .status(
        fastifyError.statusCode && fastifyError.statusCode < 500
          ? fastifyError.statusCode
          : 500,
      )
      .send({
        error: {
          code: "internal_error",
          message: "An unexpected error occurred.",
          request_id: request.id,
          details: {},
        },
      });
  });
  app.get("/health", async () => ({
    status: "ok",
    service: "node-platform-api",
  }));
  app.get("/ready", async (_request, reply) => {
    try {
      await firebase.firestore.collection("_health").doc("readiness").get();
      if (redis) await redis.ping();
      return { status: "ready" };
    } catch (error) {
      app.log.error({ err: error }, "Readiness check failed");
      return reply.status(503).send({ status: "not_ready" });
    }
  });
  const ai = createAiService(config),
    storage = createStorage(config),
    api = config.API_PREFIX;
  await app.register(authRoutes, { prefix: `${api}/auth` });
  await app.register(meRoute, { prefix: `${api}/me` });
  await app.register(notificationRoutes, { prefix: `${api}/notifications` });
  await app.register(organizationRoutes, { prefix: `${api}/businesses` });
  await app.register(organizationRoutes, { prefix: `${api}/organizations` });
  for (const root of [
    `${api}/businesses/:businessId`,
    `${api}/organizations/:businessId`,
  ]) {
    await app.register(agentRoutes(ai), { prefix: `${root}/assistants` });
    await app.register(agentRoutes(ai), { prefix: `${root}/agents` });
    await app.register(customerRoutes, { prefix: `${root}/customers` });
    await app.register(channelRoutes, { prefix: `${root}/channels` });
    await app.register(conversationRoutes(ai), {
      prefix: `${root}/conversations`,
    });
    await app.register(handoffRoutes, { prefix: `${root}/conversations` });
    await app.register(knowledgeRoutes(ai, storage), {
      prefix: `${root}/knowledge`,
    });
    await app.register(toolRoutes, { prefix: root });
    await app.register(operationsRoutes, { prefix: root });
    await app.register(eventRoutes, { prefix: `${root}/events` });
  }
  await app.register(widgetRoutes(ai), { prefix: `${api}/widget` });
  app.addHook("onClose", async () => {
    if (redis) redis.disconnect();
  });
  return app;
}
