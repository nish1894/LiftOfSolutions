import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import { extname, resolve } from "node:path";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { AppError, notFound } from "../common/errors.js";
import { parse } from "../common/schemas.js";
import type { Config } from "../config.js";
import { deleteField, type Database } from "./database.js";
import type { Platform } from "./platform.js";
import { authentication, p, uuidParam, type TokenVerifier } from "./http.js";
import {
  KEEP_FILE_HOURS,
  KNOWLEDGE_FILE_TYPES,
  type KnowledgeSource,
} from "../domain/schema/knowledge-source-schema/knowledge_sources.types.js";

// Knowledge sources. The RAG service (LiftOfMain) turns an uploaded document into a knowledge base:
// the platform keeps the file just long enough for the RAG to download it, through a signed link, and
// keeps the name and file details in knowledge_sources. Status and counts come from the RAG's own
// rags and rag_jobs records in the shared database.

const LINK_VALID_MS = 60 * 60_000;
const CONTENT_TYPES: Record<string, string> = {
  ".pdf": "application/pdf",
  ".docx":
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".txt": "text/plain; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".zip": "application/zip",
  ".rar": "application/vnd.rar",
  ".tar": "application/x-tar",
};

// One call to the RAG's knowledge API. It checks access itself, against the shared database.
async function callRag<T>(
  config: Config,
  method: "GET" | "POST" | "DELETE",
  path: string,
  body?: unknown,
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${config.RAG_SERVICE_URL}${path}`, {
      method,
      ...(body
        ? {
            headers: { "content-type": "application/json" },
            body: JSON.stringify(body),
          }
        : {}),
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new AppError(
      "KNOWLEDGE_SERVICE_UNAVAILABLE",
      "The knowledge service isn't reachable right now. Try again in a minute.",
      503,
    );
  }
  const payload = (await response.json().catch(() => ({}))) as T & {
    error?: string;
  };
  if (!response.ok)
    throw new AppError(
      "KNOWLEDGE_SERVICE_ERROR",
      payload.error ??
        `The knowledge service refused the request (${response.status}).`,
      response.status === 409 ? 409 : 502,
    );
  return payload;
}

const signature = (config: Config, sourceId: string, expires: number) =>
  createHmac("sha256", config.APP_SECRET_KEY)
    .update(`${sourceId}:${expires}`)
    .digest("hex");

// A link the RAG can download the upload from, valid for an hour. The file name keeps its extension,
// which tells the RAG how to read it.
function fileLink(config: Config, source: KnowledgeSource) {
  const expires = Date.now() + LINK_VALID_MS;
  return `${config.PUBLIC_API_URL}${config.API_PREFIX}/knowledge/files/${source._id}/${encodeURIComponent(source.file_name)}?expires=${expires}&signature=${signature(config, source._id, expires)}`;
}

function validSignature(
  config: Config,
  sourceId: string,
  expires: number,
  given: string,
) {
  const expected = Buffer.from(signature(config, sourceId, expires));
  const actual = Buffer.from(given);
  return (
    expires > Date.now() &&
    actual.length === expected.length &&
    timingSafeEqual(actual, expected)
  );
}

// What the pages show: the platform's record with the RAG's status and counts.
async function sourceView(db: Database, source: KnowledgeSource) {
  const [rag, job] = await Promise.all([
    db.get("rags", source._id),
    db.get("rag_jobs", source.job_id),
  ]);
  return {
    id: source._id,
    name: source.name,
    file_name: source.file_name,
    file_size: source.file_size,
    // A rag the RAG removed (or never wrote) counts as failed, so it can be deleted here too.
    status: rag?.status ?? "failed",
    job_status: job?.status ?? null,
    error: job?.error ?? null,
    strategy: rag?.strategy ?? null,
    token_count: rag?.token_count ?? null,
    chunk_count: rag?.chunk_count ?? null,
    created_by: source.created_by,
    created_at: source.created_at,
  };
}

async function removeFile(path: string | undefined) {
  if (!path) return;
  await unlink(path).catch((error: NodeJS.ErrnoException) => {
    if (error.code !== "ENOENT") throw error;
  });
}

// For the maintenance job: delete an upload once the RAG has read it, or after KEEP_FILE_HOURS at most.
export async function deleteUploadIfDone(
  db: Database,
  source: KnowledgeSource,
  now: Date,
) {
  if (!source.file_path) return false;
  const rag = await db.get("rags", source._id);
  const tooOld =
    now.getTime() - source.created_at.getTime() > KEEP_FILE_HOURS * 3_600_000;
  if (!tooOld && rag?.status !== "ready" && rag?.status !== "failed")
    return false;
  await removeFile(source.file_path);
  await db.transaction(async (tx) => {
    tx.update("knowledge_sources", source._id, {
      file_path: deleteField(),
      updated_at: now,
    });
  });
  return true;
}

export async function knowledgeRoutes(
  app: FastifyInstance,
  platform: Platform,
  verify: TokenVerifier,
) {
  const { authenticated } = authentication(platform, verify);
  const { db, config } = platform;
  const root = "/projects/:projectId/knowledge/sources";
  const uploadDir = resolve(config.LOCAL_STORAGE_PATH, "knowledge");

  const findSource = async (projectId: string, sourceId: string) => {
    const source = await db.get("knowledge_sources", sourceId);
    if (!source || source.project_id !== projectId)
      throw notFound("Knowledge source");
    return source;
  };

  app.get(root, { preHandler: authenticated }, async (request) => {
    const { project } = await platform.project(
      p(request),
      uuidParam(request, "projectId"),
      "knowledge.view",
    );
    // Index: knowledge_sources (project_id, created_at desc).
    const sources = await db.find("knowledge_sources", (q) =>
      q
        .where("project_id", "==", project._id)
        .orderBy("created_at", "desc")
        .limit(100),
    );
    return Promise.all(sources.map((source) => sourceView(db, source)));
  });

  app.get(
    `${root}/:sourceId`,
    { preHandler: authenticated },
    async (request) => {
      const { project } = await platform.project(
        p(request),
        uuidParam(request, "projectId"),
        "knowledge.view",
      );
      return sourceView(
        db,
        await findSource(project._id, uuidParam(request, "sourceId")),
      );
    },
  );

  // multipart/form-data: a "name" field, then one "file".
  app.post(root, { preHandler: authenticated }, async (request, reply) => {
    const principal = p(request);
    const { org, project } = await platform.project(
      principal,
      uuidParam(request, "projectId"),
      "knowledge.manage",
    );
    const upload = await request.file();
    if (!upload)
      throw new AppError("FILE_REQUIRED", "Choose a document to upload.", 400);
    const nameField = upload.fields.name;
    const name = parse(
      z.string().trim().min(1).max(200),
      nameField && "value" in nameField ? nameField.value : upload.filename,
    );
    const extension = extname(upload.filename).toLowerCase();
    if (!(KNOWLEDGE_FILE_TYPES as readonly string[]).includes(extension))
      throw new AppError(
        "FILE_TYPE_NOT_SUPPORTED",
        `Upload a ${KNOWLEDGE_FILE_TYPES.join(", ")} file.`,
        400,
      );
    const data = await upload
      .toBuffer()
      .catch((error: { statusCode?: number }) => {
        if (error.statusCode !== 413) throw error;
        throw new AppError(
          "FILE_TOO_LARGE",
          `Upload a file of ${Math.floor(config.MAX_UPLOAD_BYTES / 1_048_576)} MB or less.`,
          413,
        );
      });
    await mkdir(uploadDir, { recursive: true });
    const filePath = resolve(uploadDir, `${randomUUID()}${extension}`);
    await writeFile(filePath, data, { flag: "wx" });

    let job: { jobId: string; ragId: string } | undefined;
    try {
      const created = await callRag<{ jobId: string; ragId: string }>(
        config,
        "POST",
        `/rag/${principal.userId}/${project._id}/jobs`,
      );
      job = created;
      const now = new Date();
      const source: KnowledgeSource = {
        _id: created.ragId,
        project_id: project._id,
        name,
        file_name: upload.filename,
        file_size: data.length,
        file_path: filePath,
        job_id: created.jobId,
        created_by: principal.userId,
        created_at: now,
        updated_at: now,
      };
      await db.transaction(async (tx) => {
        tx.create("knowledge_sources", source);
        platform.audit(
          tx,
          principal,
          org._id,
          "knowledge.source_added",
          "knowledge_source",
          source._id,
          { after: { name, file_name: upload.filename } },
          project._id,
        );
      });
      await callRag(
        config,
        "POST",
        `/rag/${principal.userId}/${project._id}/jobs/${created.jobId}/submit`,
        { documentLink: fileLink(config, source) },
      );
      return reply.code(201).send(await sourceView(db, source));
    } catch (error) {
      // Leave nothing half made: the RAG's unstarted job, our record, the file.
      if (job) {
        const created = job;
        await callRag(
          config,
          "DELETE",
          `/rag/${principal.userId}/${project._id}/jobs/${created.jobId}`,
        ).catch(() => undefined);
        await db
          .transaction(async (tx) =>
            tx.delete("knowledge_sources", created.ragId),
          )
          .catch(() => undefined);
      }
      await removeFile(filePath);
      throw error;
    }
  });

  app.delete(
    `${root}/:sourceId`,
    { preHandler: authenticated },
    async (request) => {
      const principal = p(request);
      const { org, project } = await platform.project(
        principal,
        uuidParam(request, "projectId"),
        "knowledge.manage",
      );
      const source = await findSource(
        project._id,
        uuidParam(request, "sourceId"),
      );
      // An agent's draft or published settings may use it.
      const assistants = await db.find("assistants", (q) =>
        q.where("project_id", "==", project._id),
      );
      const user = assistants.find(
        (assistant) =>
          assistant.status !== "archived" &&
          (assistant.draft.source_id === source._id ||
            assistant.published?.source_id === source._id),
      );
      if (user)
        throw new AppError(
          "SOURCE_IN_USE",
          `The agent "${user.name}" uses this document. Switch it to another document first.`,
          409,
        );
      // The RAG removes the knowledge base's chunks and records; a rag it no longer has is already gone.
      // It can't stop a job part way, so it refuses (409) while one is still reading the document.
      if (await db.get("rags", source._id))
        await callRag(
          config,
          "DELETE",
          `/rag/${principal.userId}/${project._id}/rags/${source._id}`,
        ).catch((error: unknown) => {
          if (error instanceof AppError && error.statusCode === 409)
            throw new AppError(
              "SOURCE_STILL_PROCESSING",
              "This document is still being read. You can delete it once it shows Ready or Failed.",
              409,
            );
          throw error;
        });
      await removeFile(source.file_path);
      await db.transaction(async (tx) => {
        tx.delete("knowledge_sources", source._id);
        platform.audit(
          tx,
          principal,
          org._id,
          "knowledge.source_removed",
          "knowledge_source",
          source._id,
          { before: { name: source.name } },
          project._id,
        );
      });
      return { deleted: true };
    },
  );

  // Where the RAG downloads an upload from. No sign-in: the signed, expiring link is the permission.
  app.get("/knowledge/files/:sourceId/:fileName", async (request, reply) => {
    const query = parse(
      z.object({
        expires: z.coerce.number().int(),
        signature: z.string().max(128),
      }),
      request.query,
    );
    const sourceId = uuidParam(request, "sourceId");
    if (!validSignature(config, sourceId, query.expires, query.signature))
      throw new AppError(
        "LINK_INVALID",
        "This file link is invalid or has expired.",
        403,
      );
    const source = await db.get("knowledge_sources", sourceId);
    if (!source?.file_path) throw notFound("File");
    const extension = extname(source.file_name).toLowerCase();
    return reply
      .type(CONTENT_TYPES[extension] ?? "application/octet-stream")
      .send(createReadStream(source.file_path));
  });
}
