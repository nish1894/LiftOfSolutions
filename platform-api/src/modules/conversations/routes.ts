import type { FastifyInstance, FastifyRequest } from "fastify";
import { FieldValue } from "firebase-admin/firestore";
import { z } from "zod";
import type { AiService, GenerateResult } from "../../ai-gateway/index.js";
import { authenticate, requireOrganization } from "../../common/context.js";
import { conflict, notFound } from "../../common/errors.js";
import { parse } from "../../common/schemas.js";
import { hashToken, opaqueToken, safeEqual } from "../../common/security.js";
import { document, now } from "../../firebase/store.js";
import { aiAgent, type StoredAgent } from "../firestore/helpers.js";

type Conversation = {
  agentId: string;
  customerId: string;
  channelId: string | null;
  externalThreadId: string | null;
  publicTokenHash?: string;
  status: string;
  assignedUserId: string | null;
  summary: string | null;
  lastMessageAt: unknown;
  createdAt: unknown;
  updatedAt: unknown;
};
type Message = {
  senderType: string;
  senderUserId: string | null;
  externalMessageId: string | null;
  content: string;
  contentType: string;
  metadata: Record<string, unknown>;
  modelRunId: string | null;
  agentId: string | null;
  agentVersionId: string | null;
  createdAt: unknown;
};
type PublicChannel = {
  organizationId: string;
  channelId: string;
  agentId: string;
  type: string;
  status: string;
  allowedDomains?: string[];
};
const conversationApi = (
  item: Conversation & { id: string },
  organizationId: string,
) => ({
  id: item.id,
  business_id: organizationId,
  organization_id: organizationId,
  assistant_id: item.agentId,
  agent_id: item.agentId,
  customer_id: item.customerId,
  channel_connection_id: item.channelId,
  external_thread_id: item.externalThreadId,
  status: item.status,
  assigned_agent_id: item.assignedUserId,
  assigned_user_id: item.assignedUserId,
  summary: item.summary,
  last_message_at: item.lastMessageAt,
  created_at: item.createdAt,
  updated_at: item.updatedAt,
});
const messageApi = (
  item: Message & { id: string },
  organizationId: string,
  conversationId: string,
) => ({
  id: item.id,
  business_id: organizationId,
  organization_id: organizationId,
  conversation_id: conversationId,
  sender_type: item.senderType,
  sender_user_id: item.senderUserId,
  external_message_id: item.externalMessageId,
  content: item.content,
  content_type: item.contentType,
  message_metadata: item.metadata,
  model_run_id: item.modelRunId,
  assistant_id: item.agentId,
  assistant_version_id: item.agentVersionId,
  created_at: item.createdAt,
});

async function getConversation(
  app: FastifyInstance,
  organizationId: string,
  conversationId: string,
) {
  const value = document<Conversation>(
    await app.store
      .resource(organizationId, "conversations", conversationId)
      .get(),
  );
  if (!value) throw notFound("conversation");
  return value;
}
async function configuredAgent(
  app: FastifyInstance,
  organizationId: string,
  agentId: string,
) {
  const agent = document<StoredAgent>(
    await app.store.resource(organizationId, "agents", agentId).get(),
  );
  if (!agent || agent.status !== "ACTIVE") throw notFound("agent");
  return aiAgent(agent);
}
async function publicContext(
  request: FastifyRequest,
  publicChannelId: string,
  conversationId?: string,
) {
  const channel = document<PublicChannel>(
    await request.server.store.db
      .collection("publicChannels")
      .doc(publicChannelId)
      .get(),
  );
  if (!channel || channel.type !== "web" || channel.status !== "ACTIVE")
    throw notFound("web_channel");
  const origin = request.headers.origin;
  if (origin && channel.allowedDomains?.length) {
    const hostname = new URL(origin).hostname;
    if (!channel.allowedDomains.includes(hostname))
      throw notFound("web_channel");
  }
  if (!conversationId) return { channel };
  const conversation = await getConversation(
    request.server,
    channel.organizationId,
    conversationId,
  );
  const token = request.headers["x-conversation-token"];
  if (
    conversation.channelId !== channel.channelId ||
    typeof token !== "string" ||
    !conversation.publicTokenHash ||
    !safeEqual(
      hashToken(token, request.server.config.APP_SECRET_KEY),
      conversation.publicTokenHash,
    )
  )
    throw notFound("conversation");
  return { channel, conversation };
}

async function persistAiResult(
  app: FastifyInstance,
  organizationId: string,
  conversationId: string,
  agentId: string,
  agentVersionId: string | null,
  result: GenerateResult,
) {
  const conversationRef = app.store.resource(
    organizationId,
    "conversations",
    conversationId,
  );
  const runRef = app.store.resource(organizationId, "modelRuns");
  const usageRef = app.store.resource(organizationId, "usage");
  const messageRef = conversationRef.collection("messages").doc();
  const message: Message = {
    senderType: "ASSISTANT",
    senderUserId: null,
    externalMessageId: null,
    content: result.content,
    contentType: "text/plain",
    metadata: { citations: result.citations ?? [] },
    modelRunId: runRef.id,
    agentId,
    agentVersionId,
    createdAt: now(),
  };
  await app.store.db.runTransaction(async (transaction) => {
    transaction.create(runRef, {
      conversationId,
      agentId,
      agentVersionId,
      provider: result.provider,
      model: result.model,
      status: "SUCCEEDED",
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      cachedTokens: result.cachedTokens,
      latencyMs: result.latencyMs,
      estimatedCostUsd: result.estimatedCostUsd,
      finishReason: result.finishReason,
      createdAt: now(),
      completedAt: now(),
    });
    transaction.create(messageRef, message);
    transaction.create(usageRef, {
      conversationId,
      modelRunId: runRef.id,
      agentId,
      provider: result.provider,
      model: result.model,
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      cachedTokens: result.cachedTokens,
      estimatedCostUsd: result.estimatedCostUsd,
      latencyMs: result.latencyMs,
      createdAt: now(),
    });
    transaction.update(conversationRef, {
      lastMessageAt: now(),
      updatedAt: now(),
    });
    transaction.set(
      app.store.resource(organizationId, "stats", "totals"),
      {
        conversations: FieldValue.increment(0),
        messages: FieldValue.increment(1),
        modelRuns: FieldValue.increment(1),
        inputTokens: FieldValue.increment(result.inputTokens),
        outputTokens: FieldValue.increment(result.outputTokens),
        estimatedCostUsd: FieldValue.increment(result.estimatedCostUsd),
        updatedAt: now(),
      },
      { merge: true },
    );
  });
  return messageApi(
    { id: messageRef.id, ...message },
    organizationId,
    conversationId,
  );
}

export function conversationRoutes(ai: AiService) {
  return async (app: FastifyInstance): Promise<void> => {
    app.get(
      "/",
      { preHandler: [authenticate, requireOrganization("conversations.view")] },
      async (request) => {
        const query = parse(
          z.object({
            conversation_status: z
              .enum([
                "AI_ACTIVE",
                "WAITING_FOR_AGENT",
                "AGENT_ACTIVE",
                "RESOLVED",
                "CLOSED",
              ])
              .optional(),
            agent_id: z.string().optional(),
            customer_id: z.string().optional(),
            channel_id: z.string().optional(),
            assigned_agent_id: z.string().optional(),
            limit: z.coerce.number().int().min(1).max(200).default(50),
            cursor: z.string().optional(),
          }),
          request.query,
        );
        let ref = app.store.collection(
          request.organization!.id,
          "conversations",
        );
        if (query.conversation_status)
          ref = ref.where("status", "==", query.conversation_status);
        if (query.agent_id) ref = ref.where("agentId", "==", query.agent_id);
        if (query.customer_id)
          ref = ref.where("customerId", "==", query.customer_id);
        if (query.channel_id)
          ref = ref.where("channelId", "==", query.channel_id);
        if (query.assigned_agent_id)
          ref = ref.where("assignedUserId", "==", query.assigned_agent_id);
        let ordered = ref.orderBy("lastMessageAt", "desc").limit(query.limit);
        if (query.cursor) {
          const cursor = await app.store
            .resource(request.organization!.id, "conversations", query.cursor)
            .get();
          if (cursor.exists) ordered = ordered.startAfter(cursor);
        }
        return (await app.store.list<Conversation>(ordered)).map((item) =>
          conversationApi(item, request.organization!.id),
        );
      },
    );
    app.post(
      "/",
      {
        preHandler: [authenticate, requireOrganization("conversations.manage")],
      },
      async (request, reply) => {
        const body = parse(
          z.object({
            assistant_id: z.string().min(1),
            customer_id: z.string().min(1),
          }),
          request.body,
        );
        const [agent, customer] = await Promise.all([
          app.store
            .resource(request.organization!.id, "agents", body.assistant_id)
            .get(),
          app.store
            .resource(request.organization!.id, "customers", body.customer_id)
            .get(),
        ]);
        if (!agent.exists) throw notFound("agent");
        if (!customer.exists) throw notFound("customer");
        const ref = app.store.resource(
          request.organization!.id,
          "conversations",
        );
        const value: Conversation = {
          agentId: body.assistant_id,
          customerId: body.customer_id,
          channelId: null,
          externalThreadId: null,
          status: "AI_ACTIVE",
          assignedUserId: null,
          summary: null,
          lastMessageAt: now(),
          createdAt: now(),
          updatedAt: now(),
        };
        await app.store.db.runTransaction(async (transaction) => {
          transaction.create(ref, value);
          transaction.set(
            app.store.resource(request.organization!.id, "stats", "totals"),
            { conversations: FieldValue.increment(1), updatedAt: now() },
            { merge: true },
          );
        });
        return reply
          .status(201)
          .send(
            conversationApi({ id: ref.id, ...value }, request.organization!.id),
          );
      },
    );
    app.get(
      "/:conversationId",
      { preHandler: [authenticate, requireOrganization("conversations.view")] },
      async (request) => {
        const { conversationId } = request.params as { conversationId: string };
        return conversationApi(
          await getConversation(app, request.organization!.id, conversationId),
          request.organization!.id,
        );
      },
    );
    app.get(
      "/:conversationId/messages",
      { preHandler: [authenticate, requireOrganization("conversations.view")] },
      async (request) => {
        const { conversationId } = request.params as { conversationId: string };
        const query = parse(
          z.object({
            limit: z.coerce.number().int().min(1).max(100).default(30),
            cursor: z.string().optional(),
          }),
          request.query,
        );
        const conversation = await getConversation(
          app,
          request.organization!.id,
          conversationId,
        );
        let ref = app.store
          .resource(request.organization!.id, "conversations", conversation.id)
          .collection("messages")
          .orderBy("createdAt", "desc")
          .limit(query.limit);
        if (query.cursor) {
          const cursor = await app.store
            .resource(
              request.organization!.id,
              "conversations",
              conversation.id,
            )
            .collection("messages")
            .doc(query.cursor)
            .get();
          if (cursor.exists) ref = ref.startAfter(cursor);
        }
        const values = await app.store.list<Message>(ref);
        return {
          items: values
            .reverse()
            .map((item) =>
              messageApi(item, request.organization!.id, conversationId),
            ),
          next_cursor:
            values.length === query.limit ? (values[0]?.id ?? null) : null,
        };
      },
    );
    app.post(
      "/:conversationId/messages",
      {
        preHandler: [authenticate, requireOrganization("conversations.reply")],
      },
      async (request) => {
        const { conversationId } = request.params as { conversationId: string };
        const body = parse(
          z.object({
            content: z.string().trim().min(1).max(50_000),
            external_message_id: z.string().max(300).nullable().default(null),
          }),
          request.body,
        );
        const ref = app.store.resource(
          request.organization!.id,
          "conversations",
          conversationId,
        );
        const conversation = await getConversation(
          app,
          request.organization!.id,
          conversationId,
        );
        if (
          !["WAITING_FOR_AGENT", "AGENT_ACTIVE"].includes(
            conversation.status,
          ) ||
          (conversation.assignedUserId &&
            conversation.assignedUserId !== request.auth!.user.uid)
        )
          throw conflict(
            "AGENT_REPLY_NOT_ALLOWED",
            "Claim the conversation before replying as an agent.",
          );
        const messageRef = ref.collection("messages").doc();
        const value: Message = {
          senderType: "AGENT",
          senderUserId: request.auth!.user.uid,
          externalMessageId: body.external_message_id,
          content: body.content,
          contentType: "text/plain",
          metadata: {},
          modelRunId: null,
          agentId: conversation.agentId,
          agentVersionId: null,
          createdAt: now(),
        };
        await app.store.db.runTransaction(async (transaction) => {
          transaction.create(messageRef, value);
          transaction.update(ref, {
            status: "AGENT_ACTIVE",
            assignedUserId: request.auth!.user.uid,
            lastMessageAt: now(),
            updatedAt: now(),
          });
          transaction.set(
            app.store.resource(request.organization!.id, "stats", "totals"),
            { messages: FieldValue.increment(1), updatedAt: now() },
            { merge: true },
          );
        });
        return messageApi(
          { id: messageRef.id, ...value },
          request.organization!.id,
          conversationId,
        );
      },
    );
    app.post(
      "/:conversationId/transfer",
      {
        preHandler: [authenticate, requireOrganization("conversations.assign")],
      },
      async (request) => {
        const { conversationId } = request.params as { conversationId: string };
        const body = parse(
          z.object({ user_id: z.string().min(1) }),
          request.body,
        );
        if (
          !(
            await app.store.member(request.organization!.id, body.user_id).get()
          ).exists
        )
          throw notFound("active_member");
        const ref = app.store.resource(
          request.organization!.id,
          "conversations",
          conversationId,
        );
        if (!(await ref.get()).exists) throw notFound("conversation");
        await ref.update({
          assignedUserId: body.user_id,
          status: "AGENT_ACTIVE",
          updatedAt: now(),
        });
        return conversationApi(
          await getConversation(app, request.organization!.id, conversationId),
          request.organization!.id,
        );
      },
    );
    app.post(
      "/:conversationId/reopen",
      {
        preHandler: [authenticate, requireOrganization("conversations.manage")],
      },
      async (request) => {
        const { conversationId } = request.params as { conversationId: string };
        const ref = app.store.resource(
          request.organization!.id,
          "conversations",
          conversationId,
        );
        await app.store.db.runTransaction(async (transaction) => {
          const snapshot = await transaction.get(ref);
          const value = snapshot.data() as Conversation | undefined;
          if (!value) throw notFound("conversation");
          if (!["RESOLVED", "CLOSED"].includes(value.status))
            throw conflict(
              "CONVERSATION_NOT_RESOLVED",
              "Only a resolved or closed conversation can be reopened.",
            );
          transaction.update(ref, {
            status: "WAITING_FOR_AGENT",
            assignedUserId: null,
            updatedAt: now(),
          });
        });
        return conversationApi(
          await getConversation(app, request.organization!.id, conversationId),
          request.organization!.id,
        );
      },
    );
  };
}

export function widgetRoutes(ai: AiService) {
  return async (app: FastifyInstance): Promise<void> => {
    app.post(
      "/:publicChannelId/conversations",
      { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } },
      async (request, reply) => {
        const { publicChannelId } = request.params as {
          publicChannelId: string;
        };
        const body = parse(
          z.object({
            external_customer_id: z.string().min(1).max(300),
            display_name: z.string().max(200).nullable().default(null),
            email: z.email().max(320).nullable().default(null),
            external_thread_id: z.string().max(300).nullable().default(null),
            conversation_token: z
              .string()
              .min(20)
              .max(500)
              .nullable()
              .default(null),
          }),
          request.body,
        );
        const { channel } = await publicContext(request, publicChannelId);
        const identityRef = app.store.resource(
          channel.organizationId,
          "customerIdentities",
          hashToken(
            `${channel.channelId}:${body.external_customer_id}`,
            app.config.APP_SECRET_KEY,
          ),
        );
        let identity = document<{ customerId: string }>(
          await identityRef.get(),
        );
        let customerId = identity?.customerId;
        if (!customerId) {
          const customerRef = app.store.resource(
            channel.organizationId,
            "customers",
          );
          customerId = customerRef.id;
          await app.store.db.runTransaction(async (transaction) => {
            transaction.create(customerRef, {
              displayName: body.display_name,
              email: body.email,
              phone: null,
              metadata: {},
              createdAt: now(),
              updatedAt: now(),
            });
            transaction.create(identityRef, {
              customerId,
              channelId: channel.channelId,
              externalIdHash: hashToken(
                body.external_customer_id,
                app.config.APP_SECRET_KEY,
              ),
              createdAt: now(),
            });
          });
        }
        if (body.external_thread_id) {
          const existing = await app.store
            .collection(channel.organizationId, "conversations")
            .where("channelId", "==", channel.channelId)
            .where("externalThreadId", "==", body.external_thread_id)
            .limit(1)
            .get();
          if (!existing.empty) {
            const conversation = document<Conversation>(existing.docs[0]!);
            if (conversation && conversation.status !== "CLOSED") {
              if (
                !body.conversation_token ||
                !conversation.publicTokenHash ||
                !safeEqual(
                  hashToken(body.conversation_token, app.config.APP_SECRET_KEY),
                  conversation.publicTokenHash,
                )
              )
                throw conflict(
                  "CONVERSATION_TOKEN_REQUIRED",
                  "A valid conversation token is required to resume this thread.",
                );
              return {
                conversation: conversationApi(
                  conversation,
                  channel.organizationId,
                ),
                conversation_token: body.conversation_token,
              };
            }
          }
        }
        const token = opaqueToken();
        const ref = app.store.resource(channel.organizationId, "conversations");
        const value: Conversation = {
          agentId: channel.agentId,
          customerId,
          channelId: channel.channelId,
          externalThreadId: body.external_thread_id,
          publicTokenHash: hashToken(token, app.config.APP_SECRET_KEY),
          status: "AI_ACTIVE",
          assignedUserId: null,
          summary: null,
          lastMessageAt: now(),
          createdAt: now(),
          updatedAt: now(),
        };
        await app.store.db.runTransaction(async (transaction) => {
          transaction.create(ref, value);
          transaction.set(
            app.store.resource(channel.organizationId, "stats", "totals"),
            { conversations: FieldValue.increment(1), updatedAt: now() },
            { merge: true },
          );
        });
        return reply.status(201).send({
          conversation: conversationApi(
            { id: ref.id, ...value },
            channel.organizationId,
          ),
          conversation_token: token,
        });
      },
    );
    async function runTurn(request: FastifyRequest) {
      const { publicChannelId, conversationId } = request.params as {
        publicChannelId: string;
        conversationId: string;
      };
      const body = parse(
        z.object({
          content: z.string().trim().min(1).max(50_000),
          external_message_id: z.string().max(300).nullable().default(null),
        }),
        request.body,
      );
      const { channel, conversation } = await publicContext(
        request,
        publicChannelId,
        conversationId,
      );
      const conversationRef = app.store.resource(
        channel.organizationId,
        "conversations",
        conversationId,
      );
      const idempotency =
        (request.headers["idempotency-key"] as string | undefined) ??
        body.external_message_id;
      if (idempotency) {
        const prior = await conversationRef
          .collection("messages")
          .where("externalMessageId", "==", idempotency)
          .limit(1)
          .get();
        if (!prior.empty)
          return {
            customer_message: messageApi(
              document<Message>(prior.docs[0]!)!,
              channel.organizationId,
              conversationId,
            ),
            assistant_message: null,
            citations: [],
            escalated: conversation!.status !== "AI_ACTIVE",
          };
      }
      const messageRef = conversationRef.collection("messages").doc();
      const agent = await configuredAgent(
        app,
        channel.organizationId,
        conversation!.agentId,
      );
      const customer: Message = {
        senderType: "CUSTOMER",
        senderUserId: null,
        externalMessageId: idempotency ?? null,
        content: body.content,
        contentType: "text/plain",
        metadata: {},
        modelRunId: null,
        agentId: agent.agentId,
        agentVersionId: agent.versionId,
        createdAt: now(),
      };
      await app.store.db.runTransaction(async (transaction) => {
        transaction.create(messageRef, customer);
        transaction.update(conversationRef, {
          lastMessageAt: now(),
          updatedAt: now(),
        });
        transaction.set(
          app.store.resource(channel.organizationId, "stats", "totals"),
          { messages: FieldValue.increment(1), updatedAt: now() },
          { merge: true },
        );
      });
      const customerMessage = messageApi(
        { id: messageRef.id, ...customer },
        channel.organizationId,
        conversationId,
      );
      if (conversation!.status !== "AI_ACTIVE")
        return {
          customer_message: customerMessage,
          assistant_message: null,
          citations: [],
          escalated: true,
        };
      const result = await ai.generate({
        organizationId: channel.organizationId,
        conversationId,
        customerMessage: body.content,
        agent,
      });
      const assistantMessage = await persistAiResult(
        app,
        channel.organizationId,
        conversationId,
        agent.agentId,
        agent.versionId,
        result,
      );
      return {
        customer_message: customerMessage,
        assistant_message: assistantMessage,
        citations: result.citations ?? [],
        escalated: false,
        result,
      };
    }
    app.post(
      "/:publicChannelId/conversations/:conversationId/messages",
      { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } },
      async (request) => {
        const { result: _, ...response } = await runTurn(request);
        return response;
      },
    );
    app.post(
      "/:publicChannelId/conversations/:conversationId/messages/stream",
      { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } },
      async (request, reply) => {
        const response = await runTurn(request);
        reply.raw.writeHead(200, {
          "content-type": "text/event-stream",
          "cache-control": "no-cache",
          connection: "keep-alive",
        });
        reply.raw.write(
          `event: customer_message\ndata: ${JSON.stringify(response.customer_message)}\n\n`,
        );
        if (response.result) {
          for (const token of response.result.content
            .split(/(\s+)/)
            .filter(Boolean))
            reply.raw.write(
              `event: token\ndata: ${JSON.stringify({ token })}\n\n`,
            );
          reply.raw.write(
            `event: assistant_message\ndata: ${JSON.stringify(response.assistant_message)}\n\n`,
          );
        }
        reply.raw.end(
          `event: done\ndata: ${JSON.stringify({ escalated: response.escalated })}\n\n`,
        );
      },
    );
  };
}
