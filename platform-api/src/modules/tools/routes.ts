import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { Ajv } from "ajv";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { audit } from "../../common/audit.js";
import { authenticate, requireOrganization } from "../../common/context.js";
import { AppError, conflict, notFound } from "../../common/errors.js";
import { parse } from "../../common/schemas.js";
import { document, now } from "../../firebase/store.js";

const ajv = new Ajv({ allErrors: true, strict: true });
type Tool = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  outputSchema: Record<string, unknown>;
  executorType: string;
  executorConfig: Record<string, unknown>;
  secretReference: string | null;
  riskLevel: string;
  enabled: boolean;
  version: number;
  agentIds: string[];
  createdAt: unknown;
  updatedAt: unknown;
};
type ToolRun = {
  conversationId: string;
  toolId: string;
  idempotencyKey: string;
  request: Record<string, unknown>;
  result: unknown;
  status: string;
  errorCode: string | null;
  approvedByUserId: string | null;
  createdAt: unknown;
  updatedAt: unknown;
};
const api = (tool: Tool & { id: string }, organizationId: string) => ({
  id: tool.id,
  business_id: organizationId,
  organization_id: organizationId,
  name: tool.name,
  description: tool.description,
  input_schema_json: tool.inputSchema,
  output_schema_json: tool.outputSchema,
  executor_type: tool.executorType,
  executor_config_json: tool.executorConfig,
  risk_level: tool.riskLevel,
  enabled: tool.enabled,
  version: tool.version,
  assistant_ids: tool.agentIds,
  created_at: tool.createdAt,
  updated_at: tool.updatedAt,
});

export function privateAddress(address: string): boolean {
  const normalized = address.toLowerCase();
  if (normalized.startsWith("::ffff:"))
    return privateAddress(normalized.slice(7));
  if (isIP(address) === 4) {
    const [a, b] = address.split(".").map(Number);
    return (
      a === 10 ||
      a === 127 ||
      a === 0 ||
      (a === 169 && b === 254) ||
      (a === 172 && b !== undefined && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 100 && b !== undefined && b >= 64 && b <= 127) ||
      (a !== undefined && a >= 224)
    );
  }
  return (
    normalized === "::1" ||
    normalized === "::" ||
    normalized.startsWith("fc") ||
    normalized.startsWith("fd") ||
    normalized.startsWith("fe80:")
  );
}
async function safeUrl(raw: unknown): Promise<URL> {
  let url: URL;
  try {
    url = new URL(String(raw));
  } catch {
    throw new AppError("UNSAFE_TOOL_URL", "The tool URL is invalid.", 400);
  }
  if (url.protocol !== "https:" || !url.hostname)
    throw new AppError(
      "UNSAFE_TOOL_URL",
      "HTTP tools require an HTTPS URL.",
      400,
    );
  const addresses = await lookup(url.hostname, { all: true });
  if (addresses.some((item) => privateAddress(item.address)))
    throw new AppError(
      "UNSAFE_TOOL_URL",
      "Private and loopback tool targets are not allowed.",
      400,
    );
  return url;
}
function validate(schema: unknown, value: unknown, code: string) {
  let validator;
  try {
    validator = ajv.compile(schema as object);
  } catch {
    throw new AppError(
      "INVALID_TOOL_SCHEMA",
      "The configured JSON schema is invalid.",
      422,
    );
  }
  if (!validator(value))
    throw new AppError(
      code,
      "Data does not match the configured tool schema.",
      422,
      { errors: validator.errors ?? [] },
    );
}
function compileSchema(schema: unknown) {
  try {
    ajv.compile(schema as object);
  } catch {
    throw new AppError(
      "INVALID_TOOL_SCHEMA",
      "The configured JSON schema is invalid.",
      422,
    );
  }
}
async function execute(
  app: FastifyInstance,
  organizationId: string,
  runId: string,
  tool: Tool,
  args: Record<string, unknown>,
  idempotencyKey: string,
) {
  const ref = app.store.resource(organizationId, "toolRuns", runId);
  await ref.update({ status: "RUNNING", updatedAt: now() });
  try {
    let result: unknown;
    if (tool.executorType === "MOCK") result = { ok: true, echo: args };
    else {
      const url = await safeUrl(tool.executorConfig.url);
      const headers: Record<string, string> = {
        "content-type": "application/json",
        "idempotency-key": idempotencyKey,
      };
      if (tool.secretReference) {
        if (!tool.secretReference.startsWith("env:"))
          throw new AppError(
            "INVALID_SECRET_REFERENCE",
            "Only environment secret references are supported.",
            400,
          );
        const secret = process.env[tool.secretReference.slice(4)];
        if (!secret)
          throw new AppError(
            "TOOL_SECRET_MISSING",
            "The configured tool secret is unavailable.",
            503,
          );
        headers[String(tool.executorConfig.auth_header ?? "authorization")] =
          `${String(tool.executorConfig.auth_scheme ?? "Bearer")} ${secret}`;
      }
      const response = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify(args),
        redirect: "error",
        signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok)
        throw new AppError(
          "TOOL_UPSTREAM_ERROR",
          "The tool endpoint returned an error.",
          502,
          { upstream_status: response.status },
        );
      const text = await response.text();
      if (Buffer.byteLength(text) > 1_000_000)
        throw new AppError(
          "TOOL_RESPONSE_TOO_LARGE",
          "Tool response exceeded the maximum size.",
          502,
        );
      result = JSON.parse(text);
    }
    if (Object.keys(tool.outputSchema).length)
      validate(tool.outputSchema, result, "INVALID_TOOL_OUTPUT");
    await ref.update({
      status: "SUCCEEDED",
      result,
      errorCode: null,
      updatedAt: now(),
    });
    return document<ToolRun>(await ref.get());
  } catch (error) {
    await ref.update({
      status: "FAILED",
      errorCode:
        error instanceof AppError ? error.code : "TOOL_EXECUTION_FAILED",
      updatedAt: now(),
    });
    throw error;
  }
}

export async function toolRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    "/tools",
    { preHandler: [authenticate, requireOrganization("tools.view")] },
    async (request) =>
      (
        await app.store.list<Tool>(
          app.store
            .collection(request.organization!.id, "tools")
            .orderBy("createdAt", "desc")
            .limit(200),
        )
      ).map((item) => api(item, request.organization!.id)),
  );
  app.post(
    "/tools",
    { preHandler: [authenticate, requireOrganization("tools.manage")] },
    async (request, reply) => {
      const body = parse(
        z.object({
          name: z.string().min(1).max(150),
          description: z.string().min(1).max(5000),
          input_schema_json: z.record(z.string(), z.unknown()),
          output_schema_json: z.record(z.string(), z.unknown()).default({}),
          executor_type: z.enum(["HTTP", "MOCK"]).default("HTTP"),
          executor_config_json: z.record(z.string(), z.unknown()).default({}),
          secret_reference: z.string().max(500).nullable().default(null),
          risk_level: z.enum(["LOW", "MEDIUM", "HIGH"]).default("LOW"),
          assistant_ids: z.array(z.string()).default([]),
        }),
        request.body,
      );
      compileSchema(body.input_schema_json);
      if (Object.keys(body.output_schema_json).length)
        compileSchema(body.output_schema_json);
      const snapshots = await Promise.all(
        body.assistant_ids.map((id) =>
          app.store.resource(request.organization!.id, "agents", id).get(),
        ),
      );
      if (snapshots.some((snapshot) => !snapshot.exists))
        throw notFound("agent");
      const ref = app.store.resource(request.organization!.id, "tools");
      const value: Tool = {
        name: body.name,
        description: body.description,
        inputSchema: body.input_schema_json,
        outputSchema: body.output_schema_json,
        executorType: body.executor_type,
        executorConfig: body.executor_config_json,
        secretReference: body.secret_reference,
        riskLevel: body.risk_level,
        enabled: true,
        version: 1,
        agentIds: body.assistant_ids,
        createdAt: now(),
        updatedAt: now(),
      };
      await ref.create(value);
      await audit(request, "tool.created", "tool", ref.id, null, {
        name: body.name,
        risk_level: body.risk_level,
      });
      return reply
        .status(201)
        .send(api({ id: ref.id, ...value }, request.organization!.id));
    },
  );
  app.post(
    "/tool-runs",
    { preHandler: [authenticate, requireOrganization("tools.manage")] },
    async (request, reply) => {
      const body = parse(
        z.object({
          conversation_id: z.string().min(1),
          tool_id: z.string().min(1),
          arguments: z.record(z.string(), z.unknown()),
          idempotency_key: z.string().min(8).max(200),
        }),
        request.body,
      );
      const existing = await app.store
        .collection(request.organization!.id, "toolRuns")
        .where("idempotencyKey", "==", body.idempotency_key)
        .limit(1)
        .get();
      if (!existing.empty) return document<ToolRun>(existing.docs[0]!);
      const [conversation, toolSnapshot] = await Promise.all([
        app.store
          .resource(
            request.organization!.id,
            "conversations",
            body.conversation_id,
          )
          .get(),
        app.store
          .resource(request.organization!.id, "tools", body.tool_id)
          .get(),
      ]);
      const tool = document<Tool>(toolSnapshot);
      if (!conversation.exists || !tool || !tool.enabled)
        throw notFound("enabled_tool");
      const agentId = String(conversation.get("agentId") ?? "");
      if (tool.agentIds.length && !tool.agentIds.includes(agentId))
        throw notFound("enabled_tool");
      validate(tool.inputSchema, body.arguments, "INVALID_TOOL_ARGUMENTS");
      const approval = tool.riskLevel === "HIGH";
      const ref = app.store.resource(request.organization!.id, "toolRuns");
      const value: ToolRun = {
        conversationId: body.conversation_id,
        toolId: body.tool_id,
        idempotencyKey: body.idempotency_key,
        request: body.arguments,
        result: null,
        status: approval ? "APPROVAL_REQUIRED" : "PENDING",
        errorCode: null,
        approvedByUserId: null,
        createdAt: now(),
        updatedAt: now(),
      };
      await ref.create(value);
      const run = approval
        ? document<ToolRun>(await ref.get())
        : await execute(
            app,
            request.organization!.id,
            ref.id,
            tool,
            body.arguments,
            body.idempotency_key,
          );
      return reply.status(201).send(run);
    },
  );
  app.post(
    "/tool-runs/:runId/approve",
    { preHandler: [authenticate, requireOrganization("tools.approve")] },
    async (request) => {
      const { runId } = request.params as { runId: string };
      const ref = app.store.resource(
        request.organization!.id,
        "toolRuns",
        runId,
      );
      const run = document<ToolRun>(await ref.get());
      if (!run) throw notFound("tool_run");
      if (run.status !== "APPROVAL_REQUIRED")
        throw conflict(
          "APPROVAL_NOT_REQUIRED",
          "This tool run is not waiting for approval.",
        );
      const tool = document<Tool>(
        await app.store
          .resource(request.organization!.id, "tools", run.toolId)
          .get(),
      );
      if (!tool) throw notFound("tool");
      await ref.update({
        approvedByUserId: request.auth!.user.uid,
        status: "PENDING",
        updatedAt: now(),
      });
      await audit(request, "tool_run.approved", "tool_run", runId);
      return execute(
        app,
        request.organization!.id,
        runId,
        tool,
        run.request,
        run.idempotencyKey,
      );
    },
  );
}
