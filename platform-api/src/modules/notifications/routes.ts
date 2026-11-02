import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { authenticate } from "../../common/context.js";
import { notFound } from "../../common/errors.js";
import { parse } from "../../common/schemas.js";
import { document, now } from "../../firebase/store.js";

interface NotificationRecord {
  userId: string;
  type: string;
  title: string;
  body: string;
  organizationId: string | null;
  organizationName: string | null;
  section: string | null;
  resourceType: string | null;
  resourceId: string | null;
  actorUserId: string | null;
  readAt: string | null;
  createdAt: string;
}

const present = (value: NotificationRecord & { id: string }) => ({
  id: value.id,
  type: value.type,
  title: value.title,
  body: value.body,
  organization_id: value.organizationId,
  organization_name: value.organizationName,
  section: value.section,
  resource_type: value.resourceType,
  resource_id: value.resourceId,
  read: Boolean(value.readAt),
  read_at: value.readAt,
  created_at: value.createdAt,
});

export async function notificationRoutes(app: FastifyInstance): Promise<void> {
  app.get("/", { preHandler: authenticate }, async (request) => {
    const query = parse(
      z.object({
        status: z.enum(["all", "unread"]).default("all"),
        limit: z.coerce.number().int().min(1).max(100).default(30),
      }),
      request.query,
    );
    const uid = request.auth!.user.uid;
    const snapshot = await app.store.db
      .collection("notifications")
      .where("userId", "==", uid)
      .orderBy("createdAt", "desc")
      .limit(query.status === "unread" ? 100 : query.limit)
      .get();
    const all = snapshot.docs
      .map((item) => document<NotificationRecord>(item)!)
      .filter(Boolean);
    const items = (
      query.status === "unread" ? all.filter((item) => !item.readAt) : all
    ).slice(0, query.limit);
    return {
      items: items.map(present),
      unread_count: all.filter((item) => !item.readAt).length,
    };
  });

  app.post(
    "/:notificationId/read",
    { preHandler: authenticate },
    async (request) => {
      const { notificationId } = request.params as { notificationId: string };
      const ref = app.store.db.collection("notifications").doc(notificationId);
      const value = document<NotificationRecord>(await ref.get());
      // Scoping the ownership check here is what keeps one user from marking
      // another user's notifications read by guessing a document id.
      if (!value || value.userId !== request.auth!.user.uid)
        throw notFound("notification");
      if (!value.readAt) await ref.update({ readAt: now() });
      return { id: notificationId, read: true };
    },
  );

  app.post("/read-all", { preHandler: authenticate }, async (request) => {
    const snapshot = await app.store.db
      .collection("notifications")
      .where("userId", "==", request.auth!.user.uid)
      .limit(200)
      .get();
    const unread = snapshot.docs.filter((item) => !item.get("readAt"));
    if (unread.length) {
      const batch = app.store.db.batch();
      for (const item of unread) batch.update(item.ref, { readAt: now() });
      await batch.commit();
    }
    return { updated: unread.length };
  });
}
