import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { authenticate, requireOrganization } from "../../common/context.js";
import { notFound } from "../../common/errors.js";
import { parse } from "../../common/schemas.js";
import { document, now } from "../../firebase/store.js";

type Customer = {
  displayName: string | null;
  email: string | null;
  phone: string | null;
  metadata: Record<string, unknown>;
  createdAt: unknown;
  updatedAt: unknown;
};
const schema = z.object({
  display_name: z.string().max(200).nullable().default(null),
  email: z.email().max(320).nullable().default(null),
  phone: z.string().max(50).nullable().default(null),
  customer_metadata: z.record(z.string(), z.unknown()).default({}),
});
const api = (value: Customer & { id: string }, organizationId: string) => ({
  id: value.id,
  business_id: organizationId,
  organization_id: organizationId,
  display_name: value.displayName,
  email: value.email,
  phone: value.phone,
  customer_metadata: value.metadata,
  created_at: value.createdAt,
  updated_at: value.updatedAt,
});

export async function customerRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    "/",
    { preHandler: [authenticate, requireOrganization("customers.view")] },
    async (request) => {
      const query = parse(
        z.object({
          limit: z.coerce.number().int().min(1).max(200).default(50),
          cursor: z.string().optional(),
        }),
        request.query,
      );
      let ref = app.store
        .collection(request.organization!.id, "customers")
        .orderBy("createdAt", "desc")
        .limit(query.limit);
      if (query.cursor) {
        const cursor = await app.store
          .resource(request.organization!.id, "customers", query.cursor)
          .get();
        if (cursor.exists) ref = ref.startAfter(cursor);
      }
      return (await app.store.list<Customer>(ref)).map((item) =>
        api(item, request.organization!.id),
      );
    },
  );
  app.post(
    "/",
    { preHandler: [authenticate, requireOrganization("customers.manage")] },
    async (request, reply) => {
      const body = parse(schema, request.body);
      const ref = app.store.resource(request.organization!.id, "customers");
      const value: Customer = {
        displayName: body.display_name,
        email: body.email,
        phone: body.phone,
        metadata: body.customer_metadata,
        createdAt: now(),
        updatedAt: now(),
      };
      await ref.create(value);
      return reply
        .status(201)
        .send(api({ id: ref.id, ...value }, request.organization!.id));
    },
  );
  app.get(
    "/:customerId",
    { preHandler: [authenticate, requireOrganization("customers.view")] },
    async (request) => {
      const { customerId } = request.params as { customerId: string };
      const value = document<Customer>(
        await app.store
          .resource(request.organization!.id, "customers", customerId)
          .get(),
      );
      if (!value) throw notFound("customer");
      return api(value, request.organization!.id);
    },
  );
  app.patch(
    "/:customerId",
    { preHandler: [authenticate, requireOrganization("customers.manage")] },
    async (request) => {
      const { customerId } = request.params as { customerId: string };
      const body = parse(schema.partial(), request.body);
      const ref = app.store.resource(
        request.organization!.id,
        "customers",
        customerId,
      );
      const current = document<Customer>(await ref.get());
      if (!current) throw notFound("customer");
      const next: Customer = {
        ...current,
        ...(body.display_name !== undefined
          ? { displayName: body.display_name }
          : {}),
        ...(body.email !== undefined ? { email: body.email } : {}),
        ...(body.phone !== undefined ? { phone: body.phone } : {}),
        ...(body.customer_metadata !== undefined
          ? { metadata: body.customer_metadata }
          : {}),
        updatedAt: now(),
      };
      await ref.update(next);
      return api({ id: customerId, ...next }, request.organization!.id);
    },
  );
  app.get(
    "/:customerId/history",
    { preHandler: [authenticate, requireOrganization("customers.view")] },
    async (request) => {
      const { customerId } = request.params as { customerId: string };
      if (
        !(
          await app.store
            .resource(request.organization!.id, "customers", customerId)
            .get()
        ).exists
      )
        throw notFound("customer");
      return app.store.list(
        app.store
          .collection(request.organization!.id, "conversations")
          .where("customerId", "==", customerId)
          .orderBy("lastMessageAt", "desc")
          .limit(100),
      );
    },
  );
}
