import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { audit } from "../../common/audit.js";
import { authenticate, requireOrganization } from "../../common/context.js";
import { notFound } from "../../common/errors.js";
import { parse } from "../../common/schemas.js";
import { document, now } from "../../firebase/store.js";

type Usage = {
  agentId?: string;
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
  estimatedCostUsd: number;
  latencyMs: number;
  createdAt: string;
};
type Integration = {
  integrationType: string;
  displayName: string;
  status: string;
  configuration: Record<string, unknown>;
  secretReference: string | null;
  createdBy: string;
  createdAt: unknown;
  updatedAt: unknown;
};
const integrationApi = (
  value: Integration & { id: string },
  organizationId: string,
) => ({
  id: value.id,
  business_id: organizationId,
  organization_id: organizationId,
  integration_type: value.integrationType,
  display_name: value.displayName,
  status: value.status,
  configuration_json: value.configuration,
  has_secret: Boolean(value.secretReference),
  created_by_user_id: value.createdBy,
  created_at: value.createdAt,
  updated_at: value.updatedAt,
});

export async function operationsRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    "/analytics/usage",
    { preHandler: [authenticate, requireOrganization("usage.view")] },
    async (request) => {
      const query = parse(
        z.object({
          from: z.string().datetime().optional(),
          to: z.string().datetime().optional(),
          agent_id: z.string().optional(),
          model: z.string().max(100).optional(),
          provider: z.string().max(50).optional(),
        }),
        request.query,
      );
      let ref = app.store.collection(request.organization!.id, "usage");
      if (query.agent_id) ref = ref.where("agentId", "==", query.agent_id);
      if (query.model) ref = ref.where("model", "==", query.model);
      if (query.provider) ref = ref.where("provider", "==", query.provider);
      const values = (
        await app.store.list<Usage>(
          ref.orderBy("createdAt", "desc").limit(5000),
        )
      ).filter(
        (item) =>
          (!query.from || item.createdAt >= query.from) &&
          (!query.to || item.createdAt <= query.to),
      );
      return summarize(values);
    },
  );
  app.get(
    "/analytics/summary",
    { preHandler: [authenticate, requireOrganization("analytics.view")] },
    async (request) => {
      const totals = document<Record<string, unknown>>(
        await app.store
          .resource(request.organization!.id, "stats", "totals")
          .get(),
      );
      const conversations = await app.store
        .collection(request.organization!.id, "conversations")
        .limit(1000)
        .get();
      const resolved = conversations.docs.filter((item) =>
        ["RESOLVED", "CLOSED"].includes(String(item.get("status"))),
      ).length;
      const humanActive = conversations.docs.filter((item) =>
        ["WAITING_FOR_AGENT", "AGENT_ACTIVE"].includes(
          String(item.get("status")),
        ),
      ).length;
      return {
        conversations: Number(totals?.conversations ?? conversations.size),
        resolved,
        human_active: humanActive,
        messages: Number(totals?.messages ?? 0),
        model_runs: Number(totals?.modelRuns ?? 0),
        input_tokens: Number(totals?.inputTokens ?? 0),
        output_tokens: Number(totals?.outputTokens ?? 0),
        estimated_cost_usd: Number(totals?.estimatedCostUsd ?? 0),
      };
    },
  );
  app.get(
    "/analytics/usage/breakdown",
    { preHandler: [authenticate, requireOrganization("usage.view")] },
    async (request) => {
      const query = parse(
        z.object({
          group_by: z
            .enum(["date", "agent", "model", "provider"])
            .default("date"),
        }),
        request.query,
      );
      const values = await app.store.list<Usage>(
        app.store
          .collection(request.organization!.id, "usage")
          .orderBy("createdAt", "desc")
          .limit(5000),
      );
      const groups = new Map<string, Usage[]>();
      for (const item of values) {
        const key =
          query.group_by === "date"
            ? item.createdAt.slice(0, 10)
            : query.group_by === "agent"
              ? (item.agentId ?? "unknown")
              : item[query.group_by];
        groups.set(key, [...(groups.get(key) ?? []), item]);
      }
      return [...groups.entries()].map(([key, items]) => ({
        key,
        ...summarize(items),
      }));
    },
  );
  app.get(
    "/audit-events",
    { preHandler: [authenticate, requireOrganization("audit.view")] },
    async (request) => {
      const query = parse(
        z.object({
          limit: z.coerce.number().int().min(1).max(200).default(100),
          cursor: z.string().optional(),
        }),
        request.query,
      );
      let ref = app.store
        .collection(request.organization!.id, "auditEvents")
        .orderBy("createdAt", "desc")
        .limit(query.limit);
      if (query.cursor) {
        const cursor = await app.store
          .resource(request.organization!.id, "auditEvents", query.cursor)
          .get();
        if (cursor.exists) ref = ref.startAfter(cursor);
      }
      return app.store.list(ref);
    },
  );
  app.get(
    "/jobs/:jobId",
    { preHandler: [authenticate, requireOrganization("knowledge.view")] },
    async (request) => {
      const { jobId } = request.params as { jobId: string };
      const job = document(
        await app.store.resource(request.organization!.id, "jobs", jobId).get(),
      );
      if (!job) throw notFound("job");
      return job;
    },
  );
  app.get(
    "/integrations",
    { preHandler: [authenticate, requireOrganization("integrations.view")] },
    async (request) =>
      (
        await app.store.list<Integration>(
          app.store
            .collection(request.organization!.id, "integrations")
            .orderBy("createdAt", "desc")
            .limit(200),
        )
      ).map((item) => integrationApi(item, request.organization!.id)),
  );
  app.post(
    "/integrations",
    { preHandler: [authenticate, requireOrganization("integrations.manage")] },
    async (request, reply) => {
      const body = parse(
        z.object({
          integration_type: z.string().min(1).max(80),
          display_name: z.string().min(1).max(200),
          status: z.enum(["DISABLED", "ACTIVE", "ERROR"]).default("DISABLED"),
          configuration_json: z.record(z.string(), z.unknown()).default({}),
          secret_reference: z.string().max(500).nullable().default(null),
        }),
        request.body,
      );
      const ref = app.store.resource(request.organization!.id, "integrations");
      const value: Integration = {
        integrationType: body.integration_type,
        displayName: body.display_name,
        status: body.status,
        configuration: body.configuration_json,
        secretReference: body.secret_reference,
        createdBy: request.auth!.user.uid,
        createdAt: now(),
        updatedAt: now(),
      };
      await ref.create(value);
      await audit(request, "integration.created", "integration", ref.id);
      return reply
        .status(201)
        .send(
          integrationApi({ id: ref.id, ...value }, request.organization!.id),
        );
    },
  );
  app.patch(
    "/integrations/:integrationId",
    { preHandler: [authenticate, requireOrganization("integrations.manage")] },
    async (request) => {
      const { integrationId } = request.params as { integrationId: string };
      const body = parse(
        z.object({
          display_name: z.string().min(1).max(200).optional(),
          status: z.enum(["DISABLED", "ACTIVE", "ERROR"]).optional(),
          configuration_json: z.record(z.string(), z.unknown()).optional(),
          secret_reference: z.string().max(500).nullable().optional(),
        }),
        request.body,
      );
      const ref = app.store.resource(
        request.organization!.id,
        "integrations",
        integrationId,
      );
      const current = document<Integration>(await ref.get());
      if (!current) throw notFound("integration");
      const update = {
        ...(body.display_name !== undefined
          ? { displayName: body.display_name }
          : {}),
        ...(body.status !== undefined ? { status: body.status } : {}),
        ...(body.configuration_json !== undefined
          ? { configuration: body.configuration_json }
          : {}),
        ...(body.secret_reference !== undefined
          ? { secretReference: body.secret_reference }
          : {}),
        updatedAt: now(),
      };
      await ref.update(update);
      await audit(request, "integration.updated", "integration", integrationId);
      return integrationApi(
        { ...current, ...update },
        request.organization!.id,
      );
    },
  );
  app.get(
    "/billing/profile",
    { preHandler: [authenticate, requireOrganization("billing.view")] },
    async (request) =>
      document(
        await app.store
          .resource(request.organization!.id, "billing", "profile")
          .get(),
      ),
  );
  app.put(
    "/billing/profile",
    { preHandler: [authenticate, requireOrganization("billing.manage")] },
    async (request) => {
      const body = parse(
        z.object({
          legal_name: z.string().max(300).nullable().default(null),
          billing_email: z.email().max(320).nullable().default(null),
          billing_address_json: z.record(z.string(), z.unknown()).default({}),
          tax_metadata_json: z.record(z.string(), z.unknown()).default({}),
        }),
        request.body,
      );
      const ref = app.store.resource(
        request.organization!.id,
        "billing",
        "profile",
      );
      await ref.set(
        {
          legalName: body.legal_name,
          billingEmail: body.billing_email,
          billingAddress: body.billing_address_json,
          taxMetadata: body.tax_metadata_json,
          updatedAt: now(),
        },
        { merge: true },
      );
      await audit(
        request,
        "billing.profile_updated",
        "billing_profile",
        request.organization!.id,
      );
      return document(await ref.get());
    },
  );
  app.get(
    "/billing/subscription",
    { preHandler: [authenticate, requireOrganization("billing.view")] },
    async (request) =>
      document(
        await app.store
          .resource(request.organization!.id, "billing", "subscription")
          .get(),
      ) ?? {
        business_id: request.organization!.id,
        organization_id: request.organization!.id,
        plan_code: "DEVELOPMENT",
        status: "NOT_CONFIGURED",
        usage_limits_json: {},
      },
  );
  app.get(
    "/billing/invoices",
    { preHandler: [authenticate, requireOrganization("billing.view")] },
    async (request) =>
      app.store.list(
        app.store
          .collection(request.organization!.id, "invoices")
          .orderBy("createdAt", "desc")
          .limit(100),
      ),
  );
}

function summarize(values: Usage[]) {
  const totals = values.reduce(
    (total, item) => ({
      model_runs: total.model_runs + 1,
      input_tokens: total.input_tokens + Number(item.inputTokens || 0),
      output_tokens: total.output_tokens + Number(item.outputTokens || 0),
      cached_tokens: total.cached_tokens + Number(item.cachedTokens || 0),
      estimated_cost_usd:
        total.estimated_cost_usd + Number(item.estimatedCostUsd || 0),
      average_latency_ms:
        total.average_latency_ms + Number(item.latencyMs || 0),
    }),
    {
      model_runs: 0,
      input_tokens: 0,
      output_tokens: 0,
      cached_tokens: 0,
      estimated_cost_usd: 0,
      average_latency_ms: 0,
    },
  );
  return {
    ...totals,
    average_latency_ms: values.length
      ? totals.average_latency_ms / values.length
      : 0,
  };
}
