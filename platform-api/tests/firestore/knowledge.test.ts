import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { deleteUploadIfDone } from "../../src/firestore/knowledge.js";
import { sweep } from "../../src/firestore/maintenance.js";
import { createHarness, emulator } from "./harness.js";

/* A stand-in for the RAG service (LiftOfMain), close to its real behaviour: it checks the account's
   access copy, writes its own rags and rag_jobs records, downloads the document from the link it's
   given, and marks the knowledge base ready. */
function fakeRag(h: ReturnType<typeof createHarness>) {
  return createServer(async (req, res) => {
    const reply = (status: number, body: unknown) => {
      res.writeHead(status, { "content-type": "application/json" });
      res.end(JSON.stringify(body));
    };
    let raw = "";
    for await (const chunk of req) raw += chunk;
    const [, , account, projectId, kind, id, action] = (req.url ?? "").split(
      "/",
    );
    const db = h.db.firestore;
    if (!(await db.doc(`project_members/${projectId}_${account}`).get()).exists)
      return reply(403, { error: "Not a member of the project." });

    if (req.method === "POST" && kind === "jobs" && !id) {
      const ragId = randomUUID(),
        jobId = randomUUID();
      await db
        .doc(`rags/${ragId}`)
        .set({ _id: ragId, project_id: projectId, status: "indexing" });
      await db.doc(`rag_jobs/${jobId}`).set({
        _id: jobId,
        project_id: projectId,
        rag_id: ragId,
        status: "created",
      });
      return reply(201, { jobId, ragId, status: "created" });
    }
    if (req.method === "POST" && kind === "jobs" && action === "submit") {
      const link = new URL(JSON.parse(raw).documentLink);
      const download = await h.app.inject({
        method: "GET",
        url: link.pathname + link.search,
      });
      const job = (await db.doc(`rag_jobs/${id}`).get()).data()!;
      const ok = download.statusCode === 200 && download.body.length > 0;
      await db.doc(`rag_jobs/${id}`).update({
        status: ok ? "done" : "failed",
        ...(ok ? {} : { error: "Download failed" }),
      });
      await db.doc(`rags/${job.rag_id}`).update(
        ok
          ? {
              status: "ready",
              strategy: "plainText",
              token_count: download.body.split(/\s+/).length,
            }
          : { status: "failed" },
      );
      return reply(200, { jobId: id, status: "submitted" });
    }
    if (req.method === "DELETE" && kind === "rags") {
      // Like the real one, it can't stop a running job.
      if ((await db.doc(`rags/${id}`).get()).data()?.status === "indexing")
        return reply(409, { error: `Rag '${id}' has a job still processing.` });
      await db.doc(`rags/${id}`).delete();
      return reply(200, { ragId: id });
    }
    if (req.method === "DELETE" && kind === "jobs") {
      await db.doc(`rag_jobs/${id}`).delete();
      return reply(200, { jobId: id, interrupted: false });
    }
    reply(404, { error: "Unknown route" });
  });
}

// A multipart/form-data body: a name field, then one file.
function form(name: string, fileName: string, content: string) {
  const boundary = `----test${randomUUID()}`;
  const payload = [
    `--${boundary}`,
    'Content-Disposition: form-data; name="name"',
    "",
    name,
    `--${boundary}`,
    `Content-Disposition: form-data; name="file"; filename="${fileName}"`,
    "Content-Type: application/octet-stream",
    "",
    content,
    `--${boundary}--`,
    "",
  ].join("\r\n");
  return {
    payload,
    headers: { "content-type": `multipart/form-data; boundary=${boundary}` },
  };
}

describe.skipIf(!emulator)(
  "Firestore knowledge sources (emulator)",
  { timeout: 20_000 },
  () => {
    let h: ReturnType<typeof createHarness>;
    let rag: Server;
    const uploads = join(tmpdir(), `liftof-uploads-${randomUUID()}`);

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
      h = createHarness({
        RAG_SERVICE_URL: `http://127.0.0.1:${port}`,
        LOCAL_STORAGE_PATH: uploads,
      });
      await h.start();
      rag = fakeRag(h);
      await new Promise<void>((done) => rag.listen(port, "127.0.0.1", done));
    }, 30000);
    afterAll(async () => {
      rag?.close();
      await h.stop();
    });

    const upload = (
      who: string,
      projectId: string,
      name: string,
      fileName: string,
      content: string,
    ) => {
      const body = form(name, fileName, content);
      return h.app.inject({
        method: "POST",
        url: `/api/v1/projects/${projectId}/knowledge/sources`,
        headers: { authorization: `Bearer ${who}`, ...body.headers },
        payload: body.payload,
      });
    };

    it("uploads a document, lets the RAG read it, and deletes the upload once indexed", async () => {
      const owner = await h.onboard("know-owner");
      const projectId = await h.newProject("know-owner", owner.org);

      const created = await upload(
        "know-owner",
        projectId,
        "Returns policy",
        "returns.txt",
        "Refunds within 30 days.",
      );
      expect(created.statusCode, created.body).toBe(201);
      const source = created.json();
      expect(source).toMatchObject({
        name: "Returns policy",
        file_name: "returns.txt",
        status: "ready",
        job_status: "done",
      });

      const listed = await h.request(
        "GET",
        `/projects/${projectId}/knowledge/sources`,
        "know-owner",
      );
      expect(listed.json()).toHaveLength(1);
      const stored = await h.db.get("knowledge_sources", source.id);
      expect(existsSync(stored!.file_path!)).toBe(true);

      // The RAG has read it, so the maintenance sweep deletes the file.
      const result = await sweep(h.platform);
      expect(result.uploads).toBe(1);
      expect(existsSync(stored!.file_path!)).toBe(false);
      expect(
        (await h.db.get("knowledge_sources", source.id))?.file_path,
      ).toBeUndefined();

      // A bad signature gets nothing.
      const forged = await h.app.inject({
        method: "GET",
        url: `/api/v1/knowledge/files/${source.id}/returns.txt?expires=${Date.now() + 60_000}&signature=forged`,
      });
      expect(forged.statusCode).toBe(403);

      const deleted = await h.request(
        "DELETE",
        `/projects/${projectId}/knowledge/sources/${source.id}`,
        "know-owner",
      );
      expect(deleted.statusCode, deleted.body).toBe(200);
      expect(await h.db.get("rags", source.id)).toBeUndefined();
      expect(
        (
          await h.request(
            "GET",
            `/projects/${projectId}/knowledge/sources`,
            "know-owner",
          )
        ).json(),
      ).toHaveLength(0);
    });

    it("refuses file types the RAG can't read, and members without knowledge.manage", async () => {
      const owner = await h.onboard("type-owner");
      const projectId = await h.newProject("type-owner", owner.org);
      const wrong = await upload(
        "type-owner",
        projectId,
        "Script",
        "run.exe",
        "MZ",
      );
      expect(wrong.statusCode).toBe(400);
      expect(wrong.json().error.code).toBe("file_type_not_supported");

      const staffId = await h.join("type-owner", owner.org, "type-staff");
      await h.request("PUT", `/projects/${projectId}/access`, "type-owner", {
        member: { user_id: staffId, grants: [], denies: [] },
      });
      expect(
        (await upload("type-staff", projectId, "Notes", "notes.md", "# Hi"))
          .statusCode,
      ).toBe(403);
      expect(
        (
          await h.request(
            "GET",
            `/projects/${projectId}/knowledge/sources`,
            "type-staff",
          )
        ).json(),
      ).toHaveLength(0);
    });

    it("explains that a source can't be deleted while the RAG is still reading it", async () => {
      const owner = await h.onboard("busy-owner");
      const projectId = await h.newProject("busy-owner", owner.org);
      const source = (
        await upload("busy-owner", projectId, "Manual", "manual.txt", "Hello")
      ).json();
      await h.db.firestore
        .doc(`rags/${source.id}`)
        .update({ status: "indexing" });

      const refused = await h.request(
        "DELETE",
        `/projects/${projectId}/knowledge/sources/${source.id}`,
        "busy-owner",
      );
      expect(refused.statusCode).toBe(409);
      expect(refused.json().error).toMatchObject({
        code: "source_still_processing",
        message:
          "This document is still being read. You can delete it once it shows Ready or Failed.",
      });
      expect(await h.db.get("knowledge_sources", source.id)).toBeDefined();
    });

    it("deletes an upload the RAG never finishes reading after 24 hours", async () => {
      const owner = await h.onboard("slow-owner");
      const projectId = await h.newProject("slow-owner", owner.org);
      const source = (
        await upload("slow-owner", projectId, "Manual", "manual.txt", "Hello")
      ).json();
      // As if the RAG were still reading it.
      await h.db.firestore
        .doc(`rags/${source.id}`)
        .update({ status: "indexing" });
      const stored = (await h.db.get("knowledge_sources", source.id))!;
      const hoursLater = (hours: number) =>
        new Date(stored.created_at.getTime() + hours * 3_600_000);

      expect(await deleteUploadIfDone(h.db, stored, hoursLater(23))).toBe(
        false,
      );
      expect(existsSync(stored.file_path!)).toBe(true);
      expect(await deleteUploadIfDone(h.db, stored, hoursLater(25))).toBe(true);
      expect(existsSync(stored.file_path!)).toBe(false);
      expect(
        (await h.db.get("knowledge_sources", source.id))?.file_path,
      ).toBeUndefined();
    });

    it("leaves nothing behind when the RAG can't be reached", async () => {
      const owner = await h.onboard("down-owner");
      const projectId = await h.newProject("down-owner", owner.org);
      rag.close();
      const failed = await upload(
        "down-owner",
        projectId,
        "Manual",
        "manual.txt",
        "Hello",
      );
      expect(failed.statusCode).toBe(503);
      expect(failed.json().error.code).toBe("knowledge_service_unavailable");
      expect(
        (
          await h.request(
            "GET",
            `/projects/${projectId}/knowledge/sources`,
            "down-owner",
          )
        ).json(),
      ).toHaveLength(0);
    });
  },
);
