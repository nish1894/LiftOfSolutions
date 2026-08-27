import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { AiService } from "../../ai-gateway/index.js";
import { audit } from "../../common/audit.js";
import { authenticate, requireOrganization } from "../../common/context.js";
import { conflict, notFound } from "../../common/errors.js";
import { parse } from "../../common/schemas.js";
import { document, now } from "../../firebase/store.js";
import { agentApi, aiAgent, type StoredAgent } from "../firestore/helpers.js";

const agentInput = z.object({
  name: z.string().trim().min(2).max(200),
  description: z.string().max(5_000).nullable().default(null),
  instructions: z
    .string()
    .min(1)
    .max(50_000)
    .default("You are a helpful customer service assistant."),
  model_provider: z.string().max(50).default("mock"),
  model_name: z.string().max(100).default("deterministic-echo"),
  model_config_json: z.record(z.string(), z.unknown()).default({}),
  tone: z.string().max(100).nullable().default(null),
  languages: z.array(z.string().min(2).max(20)).min(1).default(["en"]),
  escalation_policy_json: z.record(z.string(), z.unknown()).default({}),
  knowledge_enabled: z.boolean().default(true),
  knowledge_source_ids: z.array(z.string()).default([]),
  tool_ids: z.array(z.string()).default([]),
  usage_limits_json: z.record(z.string(), z.unknown()).default({}),
  create_web_channel: z.boolean().default(true),
});
const lifecycleTransitions: Record<string, readonly string[]> = {
  DRAFT: ["TESTING", "ARCHIVED"],
  TESTING: ["DRAFT", "PAUSED", "ARCHIVED"],
  ACTIVE: ["PAUSED", "ARCHIVED"],
  PAUSED: ["DRAFT", "TESTING", "ARCHIVED"],
  ARCHIVED: [],
};
export const canTransitionAgent = (from: string, to: string): boolean =>
  (lifecycleTransitions[from] ?? []).includes(to);

function stored(
  body: z.infer<typeof agentInput>,
  uid: string,
  versionId: string,
): StoredAgent {
  return {
    name: body.name,
    description: body.description,
    instructions: body.instructions,
    modelProvider: body.model_provider,
    modelName: body.model_name,
    modelConfig: body.model_config_json,
    tone: body.tone,
    languages: body.languages,
    escalationPolicy: body.escalation_policy_json,
    status: "ACTIVE",
    lifecycleStatus: "DRAFT",
    knowledgeEnabled: body.knowledge_enabled,
    knowledgeSourceIds: body.knowledge_source_ids,
    toolIds: body.tool_ids,
    usageLimits: body.usage_limits_json,
    version: 1,
    activeVersionId: null,
    draftVersionId: versionId,
    createdBy: uid,
    createdAt: now(),
    updatedAt: now(),
  };
}
function versionConfiguration(agent: StoredAgent) {
  return {
    name: agent.name,
    description: agent.description,
    systemPrompt: agent.instructions,
    provider: agent.modelProvider,
    model: agent.modelName,
    modelConfiguration: agent.modelConfig,
    tone: agent.tone,
    languages: agent.languages,
    knowledgeEnabled: agent.knowledgeEnabled,
    knowledgeSourceIds: agent.knowledgeSourceIds,
    toolIds: agent.toolIds,
    escalationConfiguration: agent.escalationPolicy,
    usageLimits: agent.usageLimits,
  };
}

export function agentRoutes(ai: AiService) {
  return async (app: FastifyInstance): Promise<void> => {
    app.get(
      "/",
      { preHandler: [authenticate, requireOrganization("agents.view")] },
      async (request) => {
        const agents = await app.store.list<StoredAgent>(
          app.store
            .collection(request.organization!.id, "agents")
            .orderBy("updatedAt", "desc")
            .limit(200),
        );
        return agents.map((agent) => agentApi(agent, request.organization!.id));
      },
    );
    app.post(
      "/",
      { preHandler: [authenticate, requireOrganization("agents.create")] },
      async (request, reply) => {
        const body = parse(agentInput, request.body);
        const duplicate = await app.store
          .collection(request.organization!.id, "agents")
          .where("name", "==", body.name)
          .limit(1)
          .get();
        if (!duplicate.empty)
          throw conflict(
            "AGENT_NAME_EXISTS",
            "An Agent with this name already exists.",
          );
        const agentRef = app.store.resource(request.organization!.id, "agents"),
          versionRef = app.store.resource(
            request.organization!.id,
            "agentVersions",
          );
        const agent = stored(body, request.auth!.user.uid, versionRef.id);
        await app.store.db.runTransaction(async (transaction) => {
          transaction.create(agentRef, agent);
          transaction.create(versionRef, {
            agentId: agentRef.id,
            versionNumber: 1,
            lifecycleStatus: "DRAFT",
            configuration: versionConfiguration(agent),
            createdBy: request.auth!.user.uid,
            createdAt: now(),
          });
          if (body.create_web_channel) {
            const channelRef = app.store.resource(
              request.organization!.id,
              "channels",
            );
            transaction.create(channelRef, {
              publicId: channelRef.id,
              type: "web",
              agentId: agentRef.id,
              status: "ACTIVE",
              config: {},
              allowedDomains: [],
              createdAt: now(),
              updatedAt: now(),
            });
            transaction.create(
              app.store.db.collection("publicChannels").doc(channelRef.id),
              {
                organizationId: request.organization!.id,
                channelId: channelRef.id,
                agentId: agentRef.id,
                type: "web",
                status: "ACTIVE",
                allowedDomains: [],
                createdAt: now(),
              },
            );
          }
        });
        await audit(request, "agent.created", "agent", agentRef.id, null, body);
        return reply
          .status(201)
          .send(
            agentApi({ id: agentRef.id, ...agent }, request.organization!.id),
          );
      },
    );
    app.get(
      "/:agentId",
      { preHandler: [authenticate, requireOrganization("agents.view")] },
      async (request) => {
        const { agentId } = request.params as { agentId: string };
        const agent = document<StoredAgent>(
          await app.store
            .resource(request.organization!.id, "agents", agentId)
            .get(),
        );
        if (!agent) throw notFound("agent");
        return agentApi(agent, request.organization!.id);
      },
    );
    app.patch(
      "/:agentId",
      { preHandler: [authenticate, requireOrganization("agents.update")] },
      async (request) => {
        const { agentId } = request.params as { agentId: string };
        const body = parse(
          agentInput
            .omit({ create_web_channel: true })
            .partial()
            .extend({ expected_version: z.number().int().positive() }),
          request.body,
        );
        const agentRef = app.store.resource(
            request.organization!.id,
            "agents",
            agentId,
          ),
          versionRef = app.store.resource(
            request.organization!.id,
            "agentVersions",
          );
        let result!: StoredAgent;
        await app.store.db.runTransaction(async (transaction) => {
          const snapshot = await transaction.get(agentRef);
          const current = snapshot.data() as StoredAgent | undefined;
          if (!current) throw notFound("agent");
          if (current.version !== body.expected_version)
            throw conflict(
              "AGENT_VERSION_CONFLICT",
              "The Agent was changed by another request.",
            );
          result = {
            ...current,
            ...(body.name !== undefined ? { name: body.name } : {}),
            ...(body.description !== undefined
              ? { description: body.description }
              : {}),
            ...(body.instructions !== undefined
              ? { instructions: body.instructions }
              : {}),
            ...(body.model_provider !== undefined
              ? { modelProvider: body.model_provider }
              : {}),
            ...(body.model_name !== undefined
              ? { modelName: body.model_name }
              : {}),
            ...(body.model_config_json !== undefined
              ? { modelConfig: body.model_config_json }
              : {}),
            ...(body.tone !== undefined ? { tone: body.tone } : {}),
            ...(body.languages !== undefined
              ? { languages: body.languages }
              : {}),
            ...(body.escalation_policy_json !== undefined
              ? { escalationPolicy: body.escalation_policy_json }
              : {}),
            ...(body.knowledge_enabled !== undefined
              ? { knowledgeEnabled: body.knowledge_enabled }
              : {}),
            ...(body.knowledge_source_ids !== undefined
              ? { knowledgeSourceIds: body.knowledge_source_ids }
              : {}),
            ...(body.tool_ids !== undefined ? { toolIds: body.tool_ids } : {}),
            ...(body.usage_limits_json !== undefined
              ? { usageLimits: body.usage_limits_json }
              : {}),
            version: current.version + 1,
            draftVersionId: versionRef.id,
            lifecycleStatus: "DRAFT",
            updatedAt: now(),
          };
          transaction.update(agentRef, result);
          transaction.create(versionRef, {
            agentId,
            versionNumber: result.version,
            lifecycleStatus: "DRAFT",
            configuration: versionConfiguration(result),
            createdBy: request.auth!.user.uid,
            createdAt: now(),
          });
        });
        await audit(
          request,
          "agent.draft_updated",
          "agent",
          agentId,
          null,
          body,
        );
        return agentApi({ id: agentId, ...result }, request.organization!.id);
      },
    );
    app.get(
      "/:agentId/versions",
      { preHandler: [authenticate, requireOrganization("agents.view")] },
      async (request) => {
        const { agentId } = request.params as { agentId: string };
        return app.store.list(
          app.store
            .collection(request.organization!.id, "agentVersions")
            .where("agentId", "==", agentId)
            .orderBy("versionNumber", "desc")
            .limit(100),
        );
      },
    );
    app.post(
      "/:agentId/publish",
      { preHandler: [authenticate, requireOrganization("agents.publish")] },
      async (request) => {
        const { agentId } = request.params as { agentId: string };
        const agentRef = app.store.resource(
          request.organization!.id,
          "agents",
          agentId,
        );
        await app.store.db.runTransaction(async (transaction) => {
          const snapshot = await transaction.get(agentRef);
          const agent = snapshot.data() as StoredAgent | undefined;
          if (!agent) throw notFound("agent");
          if (!agent.draftVersionId)
            throw conflict(
              "NO_DRAFT_VERSION",
              "The Agent has no draft version.",
            );
          transaction.update(agentRef, {
            activeVersionId: agent.draftVersionId,
            lifecycleStatus: "ACTIVE",
            status: "ACTIVE",
            updatedAt: now(),
          });
          transaction.update(
            app.store.resource(
              request.organization!.id,
              "agentVersions",
              agent.draftVersionId,
            ),
            { lifecycleStatus: "ACTIVE", publishedAt: now() },
          );
        });
        await audit(request, "agent.published", "agent", agentId);
        const agent = document<StoredAgent>(await agentRef.get())!;
        return agentApi(agent, request.organization!.id);
      },
    );
    app.post(
      "/:agentId/test",
      { preHandler: [authenticate, requireOrganization("agents.test")] },
      async (request) => {
        const { agentId } = request.params as { agentId: string };
        const body = parse(
          z.object({ message: z.string().min(1).max(20_000) }),
          request.body,
        );
        const agent = document<StoredAgent>(
          await app.store
            .resource(request.organization!.id, "agents", agentId)
            .get(),
        );
        if (!agent) throw notFound("agent");
        return {
          test: true,
          result: await ai.testAgent({
            organizationId: request.organization!.id,
            customerMessage: body.message,
            agent: aiAgent(agent, agent.draftVersionId),
            testMode: true,
          }),
        };
      },
    );
    app.post(
      "/:agentId/lifecycle",
      { preHandler: [authenticate, requireOrganization("agents.update")] },
      async (request) => {
        const { agentId } = request.params as { agentId: string };
        const body = parse(
          z.object({
            status: z.enum(["DRAFT", "TESTING", "PAUSED", "ARCHIVED"]),
          }),
          request.body,
        );
        const ref = app.store.resource(
          request.organization!.id,
          "agents",
          agentId,
        );
        const agent = document<StoredAgent>(await ref.get());
        if (!agent) throw notFound("agent");
        if (!canTransitionAgent(agent.lifecycleStatus, body.status))
          throw conflict(
            "INVALID_AGENT_TRANSITION",
            `Agent cannot move from ${agent.lifecycleStatus} to ${body.status}.`,
          );
        await ref.update({
          lifecycleStatus: body.status,
          status:
            body.status === "PAUSED"
              ? "DISABLED"
              : body.status === "ARCHIVED"
                ? "ARCHIVED"
                : agent.status,
          updatedAt: now(),
        });
        await audit(
          request,
          "agent.lifecycle_changed",
          "agent",
          agentId,
          { status: agent.lifecycleStatus },
          body,
        );
        return agentApi(
          {
            ...agent,
            lifecycleStatus: body.status,
            status:
              body.status === "PAUSED"
                ? "DISABLED"
                : body.status === "ARCHIVED"
                  ? "ARCHIVED"
                  : agent.status,
          },
          request.organization!.id,
        );
      },
    );
    app.post(
      "/:agentId/duplicate",
      { preHandler: [authenticate, requireOrganization("agents.create")] },
      async (request, reply) => {
        const { agentId } = request.params as { agentId: string };
        const body = parse(
          z.object({ name: z.string().trim().min(2).max(200) }),
          request.body,
        );
        const source = document<StoredAgent>(
          await app.store
            .resource(request.organization!.id, "agents", agentId)
            .get(),
        );
        if (!source) throw notFound("agent");
        const ref = app.store.resource(request.organization!.id, "agents"),
          versionRef = app.store.resource(
            request.organization!.id,
            "agentVersions",
          );
        const copy: StoredAgent = {
          ...source,
          name: body.name,
          lifecycleStatus: "DRAFT",
          activeVersionId: null,
          draftVersionId: versionRef.id,
          version: 1,
          createdBy: request.auth!.user.uid,
          createdAt: now(),
          updatedAt: now(),
        };
        await app.store.db.runTransaction(async (transaction) => {
          transaction.create(ref, copy);
          transaction.create(versionRef, {
            agentId: ref.id,
            versionNumber: 1,
            lifecycleStatus: "DRAFT",
            configuration: versionConfiguration(copy),
            createdBy: request.auth!.user.uid,
            createdAt: now(),
          });
        });
        await audit(
          request,
          "agent.duplicated",
          "agent",
          ref.id,
          { sourceAgentId: agentId },
          body,
        );
        return reply
          .status(201)
          .send(agentApi({ id: ref.id, ...copy }, request.organization!.id));
      },
    );
    app.put(
      "/:agentId/knowledge-sources",
      { preHandler: [authenticate, requireOrganization("agents.update")] },
      async (request) => {
        const { agentId } = request.params as { agentId: string };
        const body = parse(
          z.object({ source_ids: z.array(z.string()).max(500) }),
          request.body,
        );
        const ref = app.store.resource(
          request.organization!.id,
          "agents",
          agentId,
        );
        if (!(await ref.get()).exists) throw notFound("agent");
        await ref.update({
          knowledgeSourceIds: body.source_ids,
          updatedAt: now(),
        });
        await audit(
          request,
          "agent.knowledge_updated",
          "agent",
          agentId,
          null,
          body,
        );
        return body;
      },
    );
    app.put(
      "/:agentId/tools",
      { preHandler: [authenticate, requireOrganization("tools.manage")] },
      async (request) => {
        const { agentId } = request.params as { agentId: string };
        const body = parse(
          z.object({
            tools: z.array(
              z.object({
                tool_id: z.string(),
                enabled: z.boolean().default(true),
                approval_required: z.boolean().default(false),
              }),
            ),
          }),
          request.body,
        );
        const ref = app.store.resource(
          request.organization!.id,
          "agents",
          agentId,
        );
        if (!(await ref.get()).exists) throw notFound("agent");
        await ref.update({
          toolIds: body.tools
            .filter((item) => item.enabled)
            .map((item) => item.tool_id),
          toolPolicies: Object.fromEntries(
            body.tools.map((item) => [
              item.tool_id,
              { approvalRequired: item.approval_required },
            ]),
          ),
          updatedAt: now(),
        });
        await audit(
          request,
          "agent.tools_updated",
          "agent",
          agentId,
          null,
          body,
        );
        return body;
      },
    );
    app.delete(
      "/:agentId",
      { preHandler: [authenticate, requireOrganization("agents.archive")] },
      async (request, reply) => {
        const { agentId } = request.params as { agentId: string };
        const ref = app.store.resource(
          request.organization!.id,
          "agents",
          agentId,
        );
        if (!(await ref.get()).exists) throw notFound("agent");
        await ref.update({
          status: "ARCHIVED",
          lifecycleStatus: "ARCHIVED",
          updatedAt: now(),
        });
        await audit(request, "agent.archived", "agent", agentId);
        return reply.status(204).send();
      },
    );
  };
}
