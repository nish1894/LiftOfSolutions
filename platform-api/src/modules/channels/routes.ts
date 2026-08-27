import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { audit } from "../../common/audit.js";
import { authenticate, requireOrganization } from "../../common/context.js";
import { notFound } from "../../common/errors.js";
import { parse } from "../../common/schemas.js";
import { document, now } from "../../firebase/store.js";

type Channel = {
  publicId: string;
  agentId: string;
  type: string;
  externalAccountId: string | null;
  secretReference: string | null;
  config: Record<string, unknown>;
  allowedDomains: string[];
  status: string;
  createdAt: unknown;
  updatedAt: unknown;
};
const channelApi = (
  value: Channel & { id: string },
  organizationId: string,
) => ({
  id: value.id,
  public_id: value.publicId,
  business_id: organizationId,
  organization_id: organizationId,
  assistant_id: value.agentId,
  agent_id: value.agentId,
  channel: value.type,
  external_account_id: value.externalAccountId,
  config_json: value.config,
  allowed_domains: value.allowedDomains,
  status: value.status,
  created_at: value.createdAt,
  updated_at: value.updatedAt,
});

export async function channelRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    "/",
    { preHandler: [authenticate, requireOrganization("channels.view")] },
    async (request) =>
      (
        await app.store.list<Channel>(
          app.store
            .collection(request.organization!.id, "channels")
            .orderBy("createdAt", "desc")
            .limit(200),
        )
      ).map((item) => channelApi(item, request.organization!.id)),
  );

  app.post(
    "/",
    { preHandler: [authenticate, requireOrganization("channels.manage")] },
    async (request, reply) => {
      const body = parse(
        z.object({
          assistant_id: z.string().min(1),
          channel: z.string().max(50).default("web"),
          external_account_id: z.string().max(300).nullable().default(null),
          secret_reference: z.string().max(500).nullable().default(null),
          config_json: z.record(z.string(), z.unknown()).default({}),
          allowed_domains: z.array(z.string().max(253)).max(100).default([]),
        }),
        request.body,
      );
      if (
        !(
          await app.store
            .resource(request.organization!.id, "agents", body.assistant_id)
            .get()
        ).exists
      )
        throw notFound("agent");
      const ref = app.store.resource(request.organization!.id, "channels");
      const value: Channel = {
        publicId: ref.id,
        agentId: body.assistant_id,
        type: body.channel,
        externalAccountId: body.external_account_id,
        secretReference: body.secret_reference,
        config: body.config_json,
        allowedDomains: body.allowed_domains,
        status: "ACTIVE",
        createdAt: now(),
        updatedAt: now(),
      };
      await app.store.db.runTransaction(async (transaction) => {
        transaction.create(ref, value);
        transaction.set(
          app.store.db.collection("publicChannels").doc(value.publicId),
          {
            organizationId: request.organization!.id,
            channelId: ref.id,
            agentId: value.agentId,
            type: value.type,
            status: value.status,
            allowedDomains: value.allowedDomains,
            createdAt: now(),
            updatedAt: now(),
          },
        );
      });
      await audit(request, "channel.created", "channel", ref.id, null, {
        channel: body.channel,
        agent_id: body.assistant_id,
      });
      return reply
        .status(201)
        .send(channelApi({ id: ref.id, ...value }, request.organization!.id));
    },
  );

  app.patch(
    "/:channelId",
    { preHandler: [authenticate, requireOrganization("channels.manage")] },
    async (request) => {
      const { channelId } = request.params as { channelId: string };
      const body = parse(
        z.object({
          assistant_id: z.string().min(1).optional(),
          external_account_id: z.string().max(300).nullable().optional(),
          secret_reference: z.string().max(500).nullable().optional(),
          config_json: z.record(z.string(), z.unknown()).optional(),
          allowed_domains: z.array(z.string().max(253)).max(100).optional(),
          status: z.enum(["ACTIVE", "DISABLED", "ARCHIVED"]).optional(),
        }),
        request.body,
      );
      const ref = app.store.resource(
        request.organization!.id,
        "channels",
        channelId,
      );
      const current = document<Channel>(await ref.get());
      if (!current) throw notFound("channel");
      if (
        body.assistant_id &&
        !(
          await app.store
            .resource(request.organization!.id, "agents", body.assistant_id)
            .get()
        ).exists
      )
        throw notFound("agent");
      const next: Channel = {
        ...current,
        ...(body.assistant_id !== undefined
          ? { agentId: body.assistant_id }
          : {}),
        ...(body.external_account_id !== undefined
          ? { externalAccountId: body.external_account_id }
          : {}),
        ...(body.secret_reference !== undefined
          ? { secretReference: body.secret_reference }
          : {}),
        ...(body.config_json !== undefined ? { config: body.config_json } : {}),
        ...(body.allowed_domains !== undefined
          ? { allowedDomains: body.allowed_domains }
          : {}),
        ...(body.status !== undefined ? { status: body.status } : {}),
        updatedAt: now(),
      };
      await app.store.db.runTransaction(async (transaction) => {
        transaction.update(ref, next);
        transaction.set(
          app.store.db.collection("publicChannels").doc(next.publicId),
          {
            organizationId: request.organization!.id,
            channelId,
            agentId: next.agentId,
            type: next.type,
            status: next.status,
            allowedDomains: next.allowedDomains,
            updatedAt: now(),
          },
          { merge: true },
        );
      });
      await audit(request, "channel.updated", "channel", channelId, null, {
        agent_id: next.agentId,
        status: next.status,
      });
      return channelApi({ id: channelId, ...next }, request.organization!.id);
    },
  );

  app.get(
    "/:channelId/install",
    { preHandler: [authenticate, requireOrganization("channels.view")] },
    async (request) => {
      const { channelId } = request.params as { channelId: string };
      const value = document<Channel>(
        await app.store
          .resource(request.organization!.id, "channels", channelId)
          .get(),
      );
      if (!value) throw notFound("channel");
      return {
        public_id: value.publicId,
        channel: value.type,
        widget_api_path: `/api/v1/widget/${value.publicId}`,
        installation_snippet: `<script src="${app.config.FRONTEND_URL.replace(/\/$/, "")}/widget.js" data-channel-id="${value.publicId}"></script>`,
        config: value.config,
        allowed_domains: value.allowedDomains,
      };
    },
  );
}
