import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { audit } from "../../common/audit.js";
import { authenticate, requireOrganization } from "../../common/context.js";
import { conflict, notFound } from "../../common/errors.js";
import { parse } from "../../common/schemas.js";
import { document, now } from "../../firebase/store.js";

type Conversation = { status: string; assignedUserId: string | null };
export function canClaimConversation(
  conversation: Conversation | undefined,
  uid: string,
): boolean {
  return Boolean(
    conversation &&
    ["WAITING_FOR_AGENT", "AGENT_ACTIVE"].includes(conversation.status) &&
    (!conversation.assignedUserId || conversation.assignedUserId === uid),
  );
}
type Handoff = {
  conversationId: string;
  reason: string;
  priority: string;
  status: string;
  assignedUserId: string | null;
  resolvedByUserId: string | null;
  resolutionCode: string | null;
  createdAt: unknown;
  updatedAt: unknown;
};
async function state(
  app: FastifyInstance,
  organizationId: string,
  conversationId: string,
) {
  const conversation = document<Conversation>(
    await app.store
      .resource(organizationId, "conversations", conversationId)
      .get(),
  );
  if (!conversation) throw notFound("conversation");
  const rows = await app.store
    .collection(organizationId, "handoffs")
    .where("conversationId", "==", conversationId)
    .orderBy("createdAt", "desc")
    .limit(1)
    .get();
  const handoff = rows.empty ? null : document<Handoff>(rows.docs[0]!);
  return {
    conversation_id: conversationId,
    status: conversation.status,
    assigned_agent_id: conversation.assignedUserId,
    assigned_user_id: conversation.assignedUserId,
    handoff,
  };
}

export async function handoffRoutes(app: FastifyInstance): Promise<void> {
  app.post(
    "/:conversationId/escalate",
    { preHandler: [authenticate, requireOrganization("conversations.manage")] },
    async (request) => {
      const { conversationId } = request.params as { conversationId: string };
      const body = parse(
        z.object({
          reason: z.string().min(1).max(5000),
          priority: z
            .enum(["LOW", "NORMAL", "HIGH", "URGENT"])
            .default("NORMAL"),
        }),
        request.body,
      );
      const conversationRef = app.store.resource(
        request.organization!.id,
        "conversations",
        conversationId,
      );
      const handoffRef = app.store.resource(
        request.organization!.id,
        "handoffs",
      );
      await app.store.db.runTransaction(async (transaction) => {
        const snapshot = await transaction.get(conversationRef);
        if (!snapshot.exists) throw notFound("conversation");
        transaction.create(handoffRef, {
          conversationId,
          reason: body.reason,
          priority: body.priority,
          status: "WAITING",
          assignedUserId: null,
          resolvedByUserId: null,
          resolutionCode: null,
          requestedBy: request.auth!.user.uid,
          createdAt: now(),
          updatedAt: now(),
        });
        transaction.update(conversationRef, {
          status: "WAITING_FOR_AGENT",
          assignedUserId: null,
          updatedAt: now(),
        });
      });
      await audit(
        request,
        "conversation.escalated",
        "conversation",
        conversationId,
        null,
        body,
      );
      return state(app, request.organization!.id, conversationId);
    },
  );

  app.post(
    "/:conversationId/claim",
    { preHandler: [authenticate, requireOrganization("conversations.assign")] },
    async (request) => {
      const { conversationId } = request.params as { conversationId: string };
      const conversationRef = app.store.resource(
        request.organization!.id,
        "conversations",
        conversationId,
      );
      await app.store.db.runTransaction(async (transaction) => {
        const [snapshot, open] = await Promise.all([
          transaction.get(conversationRef),
          transaction.get(
            app.store
              .collection(request.organization!.id, "handoffs")
              .where("conversationId", "==", conversationId)
              .where("status", "in", ["WAITING", "ACTIVE"])
              .limit(1),
          ),
        ]);
        const value = snapshot.data() as Conversation | undefined;
        if (!canClaimConversation(value, request.auth!.user.uid))
          throw conflict(
            "CONVERSATION_CLAIMED",
            "The conversation is unavailable or another agent has claimed it.",
          );
        transaction.update(conversationRef, {
          status: "AGENT_ACTIVE",
          assignedUserId: request.auth!.user.uid,
          updatedAt: now(),
        });
        if (!open.empty)
          transaction.update(open.docs[0]!.ref, {
            status: "ACTIVE",
            assignedUserId: request.auth!.user.uid,
            updatedAt: now(),
          });
      });
      await audit(
        request,
        "conversation.claimed",
        "conversation",
        conversationId,
      );
      return state(app, request.organization!.id, conversationId);
    },
  );

  app.post(
    "/:conversationId/resolve",
    { preHandler: [authenticate, requireOrganization("conversations.manage")] },
    async (request) => {
      const { conversationId } = request.params as { conversationId: string };
      const body = parse(
        z.object({
          resolution_code: z.string().max(100).default("RESOLVED"),
          close_conversation: z.boolean().default(false),
        }),
        request.body,
      );
      await finish(
        app,
        request.organization!.id,
        conversationId,
        request.auth!.user.uid,
        body.close_conversation ? "CLOSED" : "RESOLVED",
        body.resolution_code,
      );
      await audit(
        request,
        "conversation.resolved",
        "conversation",
        conversationId,
        null,
        body,
      );
      return state(app, request.organization!.id, conversationId);
    },
  );
  app.post(
    "/:conversationId/return-to-ai",
    { preHandler: [authenticate, requireOrganization("conversations.manage")] },
    async (request) => {
      const { conversationId } = request.params as { conversationId: string };
      await finish(
        app,
        request.organization!.id,
        conversationId,
        request.auth!.user.uid,
        "AI_ACTIVE",
        "RETURNED_TO_AI",
      );
      await audit(
        request,
        "conversation.returned_to_ai",
        "conversation",
        conversationId,
      );
      return state(app, request.organization!.id, conversationId);
    },
  );
}

async function finish(
  app: FastifyInstance,
  organizationId: string,
  conversationId: string,
  uid: string,
  status: string,
  resolutionCode: string,
) {
  const conversationRef = app.store.resource(
    organizationId,
    "conversations",
    conversationId,
  );
  await app.store.db.runTransaction(async (transaction) => {
    const [snapshot, open] = await Promise.all([
      transaction.get(conversationRef),
      transaction.get(
        app.store
          .collection(organizationId, "handoffs")
          .where("conversationId", "==", conversationId)
          .where("status", "in", ["WAITING", "ACTIVE"])
          .limit(1),
      ),
    ]);
    const value = snapshot.data() as Conversation | undefined;
    if (!value) throw notFound("conversation");
    if (value.assignedUserId && value.assignedUserId !== uid)
      throw conflict(
        "CONVERSATION_CLAIMED",
        "Only the assigned agent can update this conversation.",
      );
    transaction.update(conversationRef, {
      status,
      ...(status === "AI_ACTIVE" ? { assignedUserId: null } : {}),
      updatedAt: now(),
    });
    if (!open.empty)
      transaction.update(open.docs[0]!.ref, {
        status: "RESOLVED",
        resolvedByUserId: uid,
        resolutionCode,
        resolvedAt: now(),
        updatedAt: now(),
      });
  });
}
