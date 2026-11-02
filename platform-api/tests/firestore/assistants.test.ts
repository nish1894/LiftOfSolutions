import { randomUUID } from "node:crypto";
import { createServer, type Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { seedNodeTypes } from "../../src/firestore/provision.js";
import { createHarness, emulator } from "./harness.js";

/* A stand-in for the RAG's agent query (LiftOfMain), close to its real behaviour: it runs only an active agent
   of the project named, reads its template, and keeps the conversation in agent_memory. Its answer is the
   reply node's system prompt and the message, so tests can see what the agent was given. */
function fakeRag(h: ReturnType<typeof createHarness>) {
  return createServer(async (req, res) => {
    const reply = (status: number, body: unknown) => {
      res.writeHead(status, { "content-type": "application/json" });
      res.end(JSON.stringify(body));
    };
    let raw = "";
    for await (const chunk of req) raw += chunk;
    const [, kind, projectId, agentId, action] = (req.url ?? "").split("/");
    if (req.method !== "POST" || kind !== "agents" || action !== "query")
      return reply(404, { error: "Unknown route" });
    const agent = await h.db.get("agents", agentId!);
    if (!agent || agent.project_id !== projectId)
      return reply(404, { error: `Agent '${agentId}' not found.` });
    const template = (await h.db.get("agent_templates", agent.template_id))!;
    const { message, convoId } = JSON.parse(raw);
    await h.db.firestore.doc(`agent_memory/${agentId}_${convoId}`).set({
      agent_id: agentId,
      project_id: projectId,
      convo_id: convoId,
      chat_history: {},
    });
    reply(200, {
      agentId,
      convoId,
      answer: `${template.nodes[0]!.config.system_prompt} | ${message}`,
    });
  });
}

describe.skipIf(!emulator)(
  "Firestore agents (emulator)",
  { timeout: 20_000 },
  () => {
    let h: ReturnType<typeof createHarness>;
    let rag: Server;

    beforeAll(async () => {
      const port = await new Promise<number>((done) => {
        const server = createServer();
        server.listen(0, () => {
          const address = server.address();
          server.close(() =>
            done(typeof address === "object" && address ? address.port : 0),
          );
        });
      });
      h = createHarness({ RAG_SERVICE_URL: `http://127.0.0.1:${port}` });
      await h.start();
      await seedNodeTypes(h.db, h.config);
      rag = fakeRag(h);
      await new Promise<void>((done) => rag.listen(port, "127.0.0.1", done));
    }, 30000);
    afterAll(async () => {
      rag?.close();
      await h.stop();
    });

    // A knowledge source as the upload leaves it, with the RAG's rag record.
    async function source(projectId: string, status: string) {
      const sourceId = randomUUID();
      const now = new Date();
      await h.db.firestore.doc(`knowledge_sources/${sourceId}`).set({
        _id: sourceId,
        project_id: projectId,
        name: "Returns policy",
        file_name: "returns.txt",
        file_size: 10,
        job_id: randomUUID(),
        created_by: "someone",
        created_at: now,
        updated_at: now,
      });
      await h.db.firestore
        .doc(`rags/${sourceId}`)
        .set({ _id: sourceId, project_id: projectId, status });
      return sourceId;
    }

    const ragAgents = (projectId: string) =>
      h.count("agents", "project_id", projectId);

    it("saves a draft, tests it on its own RAG agent, publishes, pauses, resumes and archives", async () => {
      const owner = await h.onboard("agent-owner");
      const projectId = await h.newProject("agent-owner", owner.org);
      const root = `/projects/${projectId}/assistants`;

      const created = await h.request("POST", root, "agent-owner", {
        name: "Returns agent",
      });
      expect(created.statusCode, created.body).toBe(201);
      const agent = created.json();
      expect(agent).toMatchObject({
        status: "draft",
        version: 1,
        unpublished_changes: true,
        published: null,
      });

      const sourceId = await source(projectId, "indexing");
      const draft = {
        name: "Returns agent",
        description: null,
        instructions: "Refunds take 5 days.",
        tone: "friendly",
        languages: ["en", "hi"],
        source_id: sourceId,
        model: "gpt-5.4-mini",
        flow: "direct",
      };
      const saved = await h.request(
        "PATCH",
        `${root}/${agent.id}`,
        "agent-owner",
        {
          ...draft,
          expected_version: 1,
        },
      );
      expect(saved.statusCode, saved.body).toBe(200);
      expect(saved.json()).toMatchObject({
        version: 2,
        draft: { source_id: sourceId },
      });
      const stale = await h.request(
        "PATCH",
        `${root}/${agent.id}`,
        "agent-owner",
        {
          ...draft,
          expected_version: 1,
        },
      );
      expect(stale.json().error.code).toBe("version_conflict");

      // The first test builds a RAG agent from the saved draft; the next one reuses it.
      const convoId = randomUUID();
      const ask = (message: string) =>
        h.request("POST", `${root}/${agent.id}/test`, "agent-owner", {
          message,
          convo_id: convoId,
        });
      const first = await ask("How long do refunds take?");
      expect(first.statusCode, first.body).toBe(200);
      expect(first.json().restarted).toBe(true);
      expect(first.json().answer).toContain("Refunds take 5 days.");
      expect(first.json().answer).toContain("Tone: friendly.");
      expect(first.json().answer).toContain("Search the knowledge base");
      expect((await ask("And exchanges?")).json().restarted).toBe(false);
      const testAgentId = (await h.db.get("assistants", agent.id))!
        .test_agent_id!;
      const template = (await h.db.get("agent_templates", testAgentId))!;
      expect(template).toMatchObject({ rag_enabled: true, rag_id: sourceId });
      expect(template.nodes[0]!.config).toMatchObject({
        model: "gpt-5.4-mini",
        rag_search: true,
      });
      expect(template.edges).toHaveLength(3);
      expect(await ragAgents(projectId)).toBe(1);

      // Publishing waits for the knowledge document.
      const early = await h.request(
        "POST",
        `${root}/${agent.id}/publish`,
        "agent-owner",
        {
          expected_version: 2,
        },
      );
      expect(early.json().error.code).toBe("source_not_ready");
      await h.db.firestore.doc(`rags/${sourceId}`).update({ status: "ready" });
      const published = await h.request(
        "POST",
        `${root}/${agent.id}/publish`,
        "agent-owner",
        { expected_version: 2 },
      );
      expect(published.statusCode, published.body).toBe(200);
      expect(published.json()).toMatchObject({
        status: "live",
        published_version: 2,
        unpublished_changes: false,
      });
      expect(await ragAgents(projectId)).toBe(2);

      // A new draft version gets a new test agent; the old one goes, with its chat history.
      await h.request("PATCH", `${root}/${agent.id}`, "agent-owner", {
        ...draft,
        instructions: "Refunds take 3 days.",
        expected_version: 2,
      });
      const changed = await ask("How long now?");
      expect(changed.json()).toMatchObject({ restarted: true });
      expect(changed.json().answer).toContain("Refunds take 3 days.");
      expect(await h.db.get("agents", testAgentId)).toBeUndefined();
      expect(
        (
          await h.db.firestore
            .doc(`agent_memory/${testAgentId}_${convoId}`)
            .get()
        ).exists,
      ).toBe(false);
      expect(await ragAgents(projectId)).toBe(2);

      // The document can't be deleted while the agent uses it.
      const removal = await h.request(
        "DELETE",
        `/projects/${projectId}/knowledge/sources/${sourceId}`,
        "agent-owner",
      );
      expect(removal.statusCode).toBe(409);
      expect(removal.json().error.code).toBe("source_in_use");

      const liveAgentId = (await h.db.get("assistants", agent.id))!
        .live_agent_id!;
      const paused = await h.request(
        "POST",
        `${root}/${agent.id}/pause`,
        "agent-owner",
      );
      expect(paused.json().status).toBe("paused");
      expect(await h.db.get("agents", liveAgentId)).toBeUndefined();
      expect(
        (await h.request("POST", `${root}/${agent.id}/pause`, "agent-owner"))
          .statusCode,
      ).toBe(409);
      const resumed = await h.request(
        "POST",
        `${root}/${agent.id}/resume`,
        "agent-owner",
      );
      expect(resumed.json().status).toBe("live");
      const resumedAgentId = (await h.db.get("assistants", agent.id))!
        .live_agent_id!;
      expect(resumedAgentId).not.toBe(liveAgentId);
      // Resuming runs the published settings, not the newer draft.
      const resumedTemplate = (await h.db.get(
        "agent_templates",
        resumedAgentId,
      ))!;
      expect(resumedTemplate.nodes[0]!.config.system_prompt).toContain(
        "Refunds take 5 days.",
      );

      const archived = await h.request(
        "DELETE",
        `${root}/${agent.id}`,
        "agent-owner",
      );
      expect(archived.statusCode, archived.body).toBe(200);
      expect(await ragAgents(projectId)).toBe(0);
      expect((await h.request("GET", root, "agent-owner")).json()).toHaveLength(
        0,
      );
      expect(
        (await h.request("GET", `${root}/${agent.id}`, "agent-owner"))
          .statusCode,
      ).toBe(404);
    });

    it("lets a member with agents.test try an agent but not change it, and holds the plan's agent limit", async () => {
      const owner = await h.onboard("limit-owner");
      const projectId = await h.newProject("limit-owner", owner.org);
      const root = `/projects/${projectId}/assistants`;
      const staffId = await h.join("limit-owner", owner.org, "limit-staff");
      await h.request("PUT", `/projects/${projectId}/access`, "limit-owner", {
        member: { user_id: staffId, grants: ["agents.test"], denies: [] },
      });

      const ids: string[] = [];
      for (let index = 0; index < 5; index += 1) {
        const created = await h.request("POST", root, "limit-owner", {
          name: `Agent ${index}`,
        });
        expect(created.statusCode, created.body).toBe(201);
        ids.push(created.json().id);
      }
      const sixth = await h.request("POST", root, "limit-owner", {
        name: "Agent 6",
      });
      expect(sixth.json().error.code).toBe("plan_limit");
      await h.request("DELETE", `${root}/${ids[0]}`, "limit-owner");
      expect(
        (await h.request("POST", root, "limit-owner", { name: "Agent 6" }))
          .statusCode,
      ).toBe(201);

      expect((await h.request("GET", root, "limit-staff")).json()).toHaveLength(
        5,
      );
      const edit = await h.request(
        "PATCH",
        `${root}/${ids[1]}`,
        "limit-staff",
        {
          name: "Agent 1",
          description: null,
          instructions: "Be brief.",
          tone: null,
          languages: ["en"],
          source_id: null,
          model: "gpt-5.4-mini",
          flow: "direct",
          expected_version: 1,
        },
      );
      expect(edit.statusCode).toBe(403);
      const tried = await h.request(
        "POST",
        `${root}/${ids[1]}/test`,
        "limit-staff",
        {
          message: "Hello",
          convo_id: randomUUID(),
        },
      );
      expect(tried.statusCode, tried.body).toBe(200);
      // No knowledge: no search, and the RAG template has no rag_id.
      expect(tried.json().answer).not.toContain("Search the knowledge base");
    });

    it("starts from a template, and runs the checked flow on an OpenAI model", async () => {
      const owner = await h.onboard("flow-owner");
      const projectId = await h.newProject("flow-owner", owner.org);
      const root = `/projects/${projectId}/assistants`;
      const created = await h.request("POST", root, "flow-owner", {
        name: "Support agent",
        instructions: "Answer from the documents.",
        tone: "friendly",
      });
      expect(created.json().draft).toMatchObject({
        instructions: "Answer from the documents.",
        tone: "friendly",
        model: "gpt-5.4-mini",
        flow: "direct",
      });
      const agentId = created.json().id;
      const settings = {
        name: "Support agent",
        description: null,
        instructions: "Answer from the documents.",
        tone: "friendly",
        languages: ["en"],
        source_id: null,
        expected_version: 1,
      };
      const unknown = await h.request(
        "PATCH",
        `${root}/${agentId}`,
        "flow-owner",
        {
          ...settings,
          model: "grok-4.5",
          flow: "direct",
        },
      );
      expect(unknown.statusCode).toBe(422);
      // The check step needs an OpenAI model.
      const gemini = await h.request(
        "PATCH",
        `${root}/${agentId}`,
        "flow-owner",
        {
          ...settings,
          model: "gemini-3.5-flash",
          flow: "checked",
        },
      );
      expect(gemini.json().error.code).toBe("flow_not_supported");
      const saved = await h.request(
        "PATCH",
        `${root}/${agentId}`,
        "flow-owner",
        {
          ...settings,
          model: "gpt-5.5",
          flow: "checked",
        },
      );
      expect(saved.statusCode, saved.body).toBe(200);

      const tried = await h.request(
        "POST",
        `${root}/${agentId}/test`,
        "flow-owner",
        {
          message: "Hello",
          convo_id: randomUUID(),
        },
      );
      expect(tried.statusCode, tried.body).toBe(200);
      const testAgentId = (await h.db.get("assistants", agentId))!
        .test_agent_id!;
      const template = (await h.db.get("agent_templates", testAgentId))!;
      const typeOf = async (handler: string) =>
        (
          await h.db.find("node_types", (q) =>
            q.where("handler", "==", handler),
          )
        )[0]!._id;
      const [reply, review, history] = template.nodes;
      expect(reply).toMatchObject({
        name: "reply",
        node_type_id: await typeOf("openai_chat"),
        config: { model: "gpt-5.5" },
      });
      expect(review).toMatchObject({
        name: "review",
        node_type_id: await typeOf("openai_chat"),
        config: { model: "gpt-5.5", pick_limits: { [reply!.id]: 2 } },
      });
      expect(review!.config.system_prompt).toContain("pick history");
      expect(template.edges).toEqual([
        { from: "input", to: reply!.id },
        { from: reply!.id, to: review!.id },
        { from: review!.id, to: reply!.id },
        { from: review!.id, to: history!.id },
        { from: history!.id, to: "output" },
      ]);
    });

    it("says so when the AI service can't be reached", async () => {
      const owner = await h.onboard("down-agent-owner");
      const projectId = await h.newProject("down-agent-owner", owner.org);
      const created = await h.request(
        "POST",
        `/projects/${projectId}/assistants`,
        "down-agent-owner",
        { name: "Support agent" },
      );
      rag.close();
      const failed = await h.request(
        "POST",
        `/projects/${projectId}/assistants/${created.json().id}/test`,
        "down-agent-owner",
        { message: "Hello", convo_id: randomUUID() },
      );
      expect(failed.statusCode).toBe(503);
      expect(failed.json().error.code).toBe("ai_service_unavailable");
    });
  },
);
