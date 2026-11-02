import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { AppError, conflict, notFound } from "../common/errors.js";
import { parse } from "../common/schemas.js";
import type { Config } from "../config.js";
import {
  deleteField,
  type AgentNodeRecord,
  type AgentRecord,
  type AgentTemplateRecord,
  type Database,
  type Reader,
  type Tx,
} from "./database.js";
import { id, type Platform } from "./platform.js";
import { authentication, p, uuidParam, type TokenVerifier } from "./http.js";
import {
  ASSISTANT_MODELS,
  CHECK_ROUNDS,
  CHECKED_FLOW_HANDLER,
  DEFAULT_MODEL,
  type Assistant,
  type AssistantModel,
  type AssistantSettings,
} from "../domain/schema/assistant-schema/assistants.types.js";

// Agents, as the team edits them in the studio (the assistants collection). The RAG runs agents from its own
// agents and agent_templates records, and caches them without reading them again, so the platform never edits
// one: it writes a new RAG agent for the settings to run and deletes the one it replaces. live_agent_id runs the
// published settings, for customers; test_agent_id runs the saved draft, for the studio's test chat.

const MODELS = Object.keys(ASSISTANT_MODELS) as [
  AssistantModel,
  ...AssistantModel[],
];

const settingsInput = z.object({
  instructions: z.string().max(20_000),
  tone: z.string().trim().max(200).nullable(),
  languages: z.array(z.string().trim().min(2).max(10)).min(1).max(10),
  source_id: z.uuid().nullable(),
  model: z.enum(MODELS),
  flow: z.enum(["direct", "checked"]),
});

const view = (assistant: Assistant) => ({
  id: assistant._id,
  name: assistant.name,
  description: assistant.description ?? null,
  status: assistant.status,
  draft: settingsView(assistant.draft),
  published: assistant.published ? settingsView(assistant.published) : null,
  version: assistant.version,
  published_version: assistant.published_version ?? null,
  unpublished_changes: assistant.published_version !== assistant.version,
  published_at: assistant.published_at ?? null,
  created_at: assistant.created_at,
  updated_at: assistant.updated_at,
});

const settingsView = (settings: AssistantSettings) => ({
  instructions: settings.instructions,
  tone: settings.tone ?? null,
  languages: settings.languages,
  source_id: settings.source_id ?? null,
  model: settings.model,
  flow: settings.flow,
});

// The reply node's system prompt: the team's instructions, then the tone, languages and knowledge rules.
function systemPrompt(settings: AssistantSettings) {
  const [first, ...others] = settings.languages;
  return [
    settings.instructions.trim(),
    settings.tone && `Tone: ${settings.tone}.`,
    others.length
      ? `Reply in the customer's language if it is one of ${settings.languages.join(", ")}; otherwise in ${first}.`
      : `Reply in ${first}.`,
    settings.source_id &&
      "Search the knowledge base before you answer, and answer only from what it holds. If it doesn't hold the answer, say so.",
  ]
    .filter(Boolean)
    .join("\n\n");
}

// The review node's prompt, for the "checked" flow. It picks the next node by name: reply or history.
function reviewPrompt(settings: AssistantSettings) {
  return [
    "You check the last reply before it goes to the customer. Never write to the customer yourself.",
    `The reply had to follow these instructions:\n\n${systemPrompt(settings)}`,
    settings.source_id &&
      "Check it against what the knowledge base searches above found: it must say nothing they don't support.",
    "If the reply is right, complete and polite, pick history. Otherwise pick reply, and say exactly what to fix.",
  ]
    .filter(Boolean)
    .join("\n\n");
}

// The RAG's platform node types for the chosen model and the history. npm run db:init creates them on the emulator.
async function nodeTypes(tx: Tx, settings: AssistantSettings) {
  const find = async (handler: string) => {
    const types = await tx.find("node_types", (q) =>
      q.where("handler", "==", handler),
    );
    const type = types.find((item) => !item.project_id && item.is_active);
    if (!type)
      throw new AppError(
        "AI_SERVICE_NOT_SET_UP",
        `The AI service isn't set up yet: it has no ${handler} node type.`,
        503,
      );
    return type._id;
  };
  return {
    chat: await find(ASSISTANT_MODELS[settings.model]),
    history: await find("chat_history"),
  };
}

// The template's nodes and edges. direct: input → reply → history → output. checked: review reads each reply and
// sends it back to reply (at most CHECK_ROUNDS times) or on to history.
function graph(
  settings: AssistantSettings,
  types: { chat: string; history: string },
  now: Date,
) {
  const node = (
    nodeTypeId: string,
    name: string,
    config: Record<string, unknown>,
  ): AgentNodeRecord => ({
    id: id(),
    node_type_id: nodeTypeId,
    name,
    config,
    created_at: now,
    updated_at: now,
  });
  const reply = node(types.chat, "reply", {
    model: settings.model,
    system_prompt: systemPrompt(settings),
    description: "Writes the reply to the customer, or writes it again.",
    ...(settings.source_id ? { rag_search: true } : {}),
  });
  const history = node(types.history, "history", {
    description: "Sends the reply to the customer and keeps the conversation.",
  });
  if (settings.flow === "direct")
    return {
      nodes: [reply, history],
      edges: [
        { from: "input", to: reply.id },
        { from: reply.id, to: history.id },
        { from: history.id, to: "output" },
      ],
    };
  const review = node(types.chat, "review", {
    model: settings.model,
    system_prompt: reviewPrompt(settings),
    pick_limits: { [reply.id]: CHECK_ROUNDS },
  });
  return {
    nodes: [reply, review, history],
    edges: [
      { from: "input", to: reply.id },
      { from: reply.id, to: review.id },
      { from: review.id, to: reply.id },
      { from: review.id, to: history.id },
      { from: history.id, to: "output" },
    ],
  };
}

// A new RAG agent running these settings. Its template has the same _id.
function writeRagAgent(
  tx: Tx,
  assistant: Assistant,
  settings: AssistantSettings,
  types: { chat: string; history: string },
  userId: string,
) {
  const now = new Date();
  const agentId = id();
  const template: AgentTemplateRecord = {
    _id: agentId,
    project_id: assistant.project_id,
    name: assistant.name,
    rag_enabled: Boolean(settings.source_id),
    ...(settings.source_id ? { rag_id: settings.source_id } : {}),
    ...graph(settings, types, now),
    triggers: [],
    is_active: true,
    created_at: now,
    updated_at: now,
  };
  const agent: AgentRecord = {
    _id: agentId,
    project_id: assistant.project_id,
    template_id: agentId,
    name: assistant.name,
    status: "active",
    created_by: userId,
    created_at: now,
    updated_at: now,
  };
  tx.create("agent_templates", template);
  tx.create("agents", agent);
  return agentId;
}

function deleteRagAgent(tx: Tx, agentId: string | undefined) {
  if (!agentId) return;
  tx.delete("agents", agentId);
  tx.delete("agent_templates", agentId);
}

// The chat history the RAG kept for a deleted RAG agent. Its documents have no _id field, so this uses Firestore
// directly. Best effort: a leftover only takes space.
async function deleteChatHistory(db: Database, agentId: string | undefined) {
  if (!agentId) return;
  const memory = db.firestore.collection("agent_memory");
  try {
    for (;;) {
      const page = await memory
        .where("agent_id", "==", agentId)
        .limit(300)
        .get();
      if (page.empty) return;
      const batch = db.firestore.batch();
      for (const doc of page.docs) batch.delete(doc.ref);
      await batch.commit();
    }
  } catch {
    return;
  }
}

// One question to a RAG agent. The RAG's agent query is public; only the platform knows the agent ids.
async function askAgent(
  config: Config,
  projectId: string,
  agentId: string,
  message: string,
  convoId: string,
) {
  let response: Response;
  try {
    response = await fetch(
      `${config.RAG_SERVICE_URL}/agents/${projectId}/${agentId}/query`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message, convoId }),
        signal: AbortSignal.timeout(90_000),
      },
    );
  } catch {
    throw new AppError(
      "AI_SERVICE_UNAVAILABLE",
      "The AI service isn't reachable right now. Try again in a minute.",
      503,
    );
  }
  const payload = (await response.json().catch(() => ({}))) as {
    answer?: string;
    error?: string;
  };
  if (!response.ok || typeof payload.answer !== "string")
    throw new AppError(
      "AI_SERVICE_ERROR",
      `The AI service couldn't answer: ${payload.error ?? `error ${response.status}`}`,
      502,
    );
  return payload.answer;
}

async function findAssistant(
  reader: Reader,
  projectId: string,
  assistantId: string,
) {
  const assistant = await reader.get("assistants", assistantId);
  if (
    !assistant ||
    assistant.project_id !== projectId ||
    assistant.status === "archived"
  )
    throw notFound("Agent");
  return assistant;
}

function checkVersion(assistant: Assistant, expected: number) {
  if (assistant.version !== expected)
    throw conflict(
      "VERSION_CONFLICT",
      "Someone saved this agent after you opened it. Reload to see their changes.",
    );
}

export async function assistantRoutes(
  app: FastifyInstance,
  platform: Platform,
  verify: TokenVerifier,
) {
  const { authenticated } = authentication(platform, verify);
  const { db, config } = platform;
  const root = "/projects/:projectId/assistants";
  const projectId = (request: FastifyRequest) =>
    uuidParam(request, "projectId");
  const assistantId = (request: FastifyRequest) =>
    uuidParam(request, "assistantId");

  app.get(root, { preHandler: authenticated }, async (request) => {
    const { project } = await platform.project(
      p(request),
      projectId(request),
      "agents.view",
    );
    const assistants = await db.find("assistants", (q) =>
      q.where("project_id", "==", project._id),
    );
    return assistants
      .filter((assistant) => assistant.status !== "archived")
      .sort((a, b) => b.updated_at.getTime() - a.updated_at.getTime())
      .map(view);
  });

  app.get(
    `${root}/:assistantId`,
    { preHandler: authenticated },
    async (request) => {
      const { project } = await platform.project(
        p(request),
        projectId(request),
        "agents.view",
      );
      return view(await findAssistant(db, project._id, assistantId(request)));
    },
  );

  app.post(root, { preHandler: authenticated }, async (request, reply) => {
    const principal = p(request);
    const input = parse(
      z.object({
        name: z.string().trim().min(2).max(100),
        description: z.string().trim().max(300).nullish(),
        // A starter template's instructions and tone.
        instructions: z.string().max(20_000).optional(),
        tone: z.string().trim().max(200).optional(),
      }),
      request.body,
    );
    const created = await db.transaction(async (tx) => {
      const { org, project } = await platform.project(
        principal,
        projectId(request),
        "agents.create",
        tx,
      );
      const locked = await platform.lockOrganization(tx, org._id);
      const plan = await tx.get("plans", locked.plan_id);
      const existing = await tx.find("assistants", (q) =>
        q.where("org_id", "==", org._id),
      );
      const counted = existing.filter((item) => item.status !== "archived");
      if (!plan || counted.length >= plan.limits.agents)
        throw conflict(
          "PLAN_LIMIT",
          "The agent limit for this plan has been reached.",
        );
      const now = new Date();
      const assistant: Assistant = {
        _id: id(),
        org_id: org._id,
        project_id: project._id,
        name: input.name,
        ...(input.description ? { description: input.description } : {}),
        status: "draft",
        draft: {
          instructions: input.instructions ?? "",
          ...(input.tone ? { tone: input.tone } : {}),
          languages: ["en"],
          model: DEFAULT_MODEL,
          flow: "direct",
        },
        version: 1,
        created_by: principal.userId,
        created_at: now,
        updated_at: now,
      };
      tx.create("assistants", assistant);
      platform.audit(
        tx,
        principal,
        org._id,
        "agent.created",
        "assistant",
        assistant._id,
        { after: { name: assistant.name } },
        project._id,
      );
      return assistant;
    });
    return reply.code(201).send(view(created));
  });

  // Saves the draft. Customers keep the published settings until the next publish.
  app.patch(
    `${root}/:assistantId`,
    { preHandler: authenticated },
    async (request) => {
      const principal = p(request);
      const input = parse(
        settingsInput.extend({
          name: z.string().trim().min(2).max(100),
          description: z.string().trim().max(300).nullable(),
          expected_version: z.number().int().min(1),
        }),
        request.body,
      );
      return db.transaction(async (tx) => {
        const { org, project } = await platform.project(
          principal,
          projectId(request),
          "agents.update",
          tx,
        );
        const assistant = await findAssistant(
          tx,
          project._id,
          assistantId(request),
        );
        checkVersion(assistant, input.expected_version);
        if (
          input.flow === "checked" &&
          ASSISTANT_MODELS[input.model] !== CHECKED_FLOW_HANDLER
        )
          throw new AppError(
            "FLOW_NOT_SUPPORTED",
            '"Answer, then check" works with OpenAI models for now.',
            422,
          );
        if (input.source_id) {
          const source = await tx.get("knowledge_sources", input.source_id);
          if (!source || source.project_id !== project._id)
            throw notFound("Knowledge source");
        }
        const draft: AssistantSettings = {
          instructions: input.instructions,
          ...(input.tone ? { tone: input.tone } : {}),
          languages: input.languages,
          ...(input.source_id ? { source_id: input.source_id } : {}),
          model: input.model,
          flow: input.flow,
        };
        const next: Assistant = {
          ...assistant,
          name: input.name,
          draft,
          version: assistant.version + 1,
          updated_at: new Date(),
        };
        if (input.description) next.description = input.description;
        else delete next.description;
        tx.set("assistants", next);
        platform.audit(
          tx,
          principal,
          org._id,
          "agent.draft_saved",
          "assistant",
          assistant._id,
          { after: { version: next.version } },
          project._id,
        );
        return view(next);
      });
    },
  );

  // Customers get the saved draft from now on. Needs its knowledge document to be ready.
  app.post(
    `${root}/:assistantId/publish`,
    { preHandler: authenticated },
    async (request) => {
      const principal = p(request);
      const input = parse(
        z.object({ expected_version: z.number().int().min(1) }),
        request.body,
      );
      const { replaced, published } = await db.transaction(async (tx) => {
        const { org, project } = await platform.project(
          principal,
          projectId(request),
          "agents.publish",
          tx,
        );
        const assistant = await findAssistant(
          tx,
          project._id,
          assistantId(request),
        );
        checkVersion(assistant, input.expected_version);
        if (assistant.draft.source_id) {
          const rag = await tx.get("rags", assistant.draft.source_id);
          if (rag?.status !== "ready")
            throw conflict(
              "SOURCE_NOT_READY",
              "The agent's knowledge document isn't ready. Publish once it shows Ready, or choose another one.",
            );
        }
        const types = await nodeTypes(tx, assistant.draft);
        const now = new Date();
        const liveAgentId = writeRagAgent(
          tx,
          assistant,
          assistant.draft,
          types,
          principal.userId,
        );
        deleteRagAgent(tx, assistant.live_agent_id);
        const next: Assistant = {
          ...assistant,
          status: "live",
          published: assistant.draft,
          published_version: assistant.version,
          published_at: now,
          published_by: principal.userId,
          live_agent_id: liveAgentId,
          updated_at: now,
        };
        tx.set("assistants", next);
        platform.audit(
          tx,
          principal,
          org._id,
          "agent.published",
          "assistant",
          assistant._id,
          { after: { version: assistant.version } },
          project._id,
        );
        return { replaced: assistant.live_agent_id, published: next };
      });
      await deleteChatHistory(db, replaced);
      return view(published);
    },
  );

  // Pausing stops the live agent; resuming starts the published settings again.
  for (const action of ["pause", "resume"] as const)
    app.post(
      `${root}/:assistantId/${action}`,
      { preHandler: authenticated },
      async (request) => {
        const principal = p(request);
        const { replaced, changed } = await db.transaction(async (tx) => {
          const { org, project } = await platform.project(
            principal,
            projectId(request),
            "agents.publish",
            tx,
          );
          const assistant = await findAssistant(
            tx,
            project._id,
            assistantId(request),
          );
          const from = action === "pause" ? "live" : "paused";
          if (assistant.status !== from || !assistant.published)
            throw conflict(
              "AGENT_NOT_" + from.toUpperCase(),
              action === "pause"
                ? "Only a published agent can be paused."
                : "Only a paused agent can be resumed.",
            );
          const types =
            action === "resume"
              ? await nodeTypes(tx, assistant.published)
              : undefined;
          const now = new Date();
          deleteRagAgent(tx, assistant.live_agent_id);
          const next: Assistant = {
            ...assistant,
            status: action === "pause" ? "paused" : "live",
            updated_at: now,
          };
          if (types)
            next.live_agent_id = writeRagAgent(
              tx,
              assistant,
              assistant.published,
              types,
              principal.userId,
            );
          else delete next.live_agent_id;
          tx.set("assistants", next);
          platform.audit(
            tx,
            principal,
            org._id,
            action === "pause" ? "agent.paused" : "agent.resumed",
            "assistant",
            assistant._id,
            undefined,
            project._id,
          );
          return { replaced: assistant.live_agent_id, changed: next };
        });
        await deleteChatHistory(db, replaced);
        return view(changed);
      },
    );

  // Archived agents stay in the database, hidden, and never run again.
  app.delete(
    `${root}/:assistantId`,
    { preHandler: authenticated },
    async (request) => {
      const principal = p(request);
      const archived = await db.transaction(async (tx) => {
        const { org, project } = await platform.project(
          principal,
          projectId(request),
          "agents.archive",
          tx,
        );
        const assistant = await findAssistant(
          tx,
          project._id,
          assistantId(request),
        );
        deleteRagAgent(tx, assistant.live_agent_id);
        deleteRagAgent(tx, assistant.test_agent_id);
        tx.update("assistants", assistant._id, {
          status: "archived",
          live_agent_id: deleteField(),
          test_agent_id: deleteField(),
          test_version: deleteField(),
          updated_at: new Date(),
        });
        platform.audit(
          tx,
          principal,
          org._id,
          "agent.archived",
          "assistant",
          assistant._id,
          { before: { name: assistant.name } },
          project._id,
        );
        return assistant;
      });
      await deleteChatHistory(db, archived.live_agent_id);
      await deleteChatHistory(db, archived.test_agent_id);
      return { archived: true };
    },
  );

  // The studio's test chat: one question to the saved draft. A draft version tested for the first time gets its
  // own RAG agent, which starts with no memory of the chat so far (restarted).
  app.post(
    `${root}/:assistantId/test`,
    { preHandler: authenticated },
    async (request) => {
      const principal = p(request);
      const input = parse(
        z.object({
          message: z.string().trim().min(1).max(4_000),
          convo_id: z.uuid(),
        }),
        request.body,
      );
      const test = await db.transaction(async (tx) => {
        const { project } = await platform.project(
          principal,
          projectId(request),
          "agents.test",
          tx,
        );
        const assistant = await findAssistant(
          tx,
          project._id,
          assistantId(request),
        );
        if (
          assistant.test_agent_id &&
          assistant.test_version === assistant.version
        )
          return {
            agentId: assistant.test_agent_id,
            restarted: false,
            replaced: undefined,
          };
        const types = await nodeTypes(tx, assistant.draft);
        const agentId = writeRagAgent(
          tx,
          assistant,
          assistant.draft,
          types,
          principal.userId,
        );
        deleteRagAgent(tx, assistant.test_agent_id);
        tx.update("assistants", assistant._id, {
          test_agent_id: agentId,
          test_version: assistant.version,
        });
        return { agentId, restarted: true, replaced: assistant.test_agent_id };
      });
      await deleteChatHistory(db, test.replaced);
      const answer = await askAgent(
        config,
        projectId(request),
        test.agentId,
        input.message,
        input.convo_id,
      );
      return { answer, convo_id: input.convo_id, restarted: test.restarted };
    },
  );
}
