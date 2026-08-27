import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { AiService } from "../../ai-gateway/index.js";
import { audit } from "../../common/audit.js";
import { authenticate, requireOrganization } from "../../common/context.js";
import { AppError, notFound } from "../../common/errors.js";
import { parse } from "../../common/schemas.js";
import { document, now } from "../../firebase/store.js";
import type { ObjectStorage } from "../../storage/index.js";

type Source = {
  name: string;
  sourceType: string;
  sourceUri: string | null;
  status: string;
  syncConfig: Record<string, unknown>;
  processingStatus: string;
  processingErrorCode: string | null;
  externalJobId: string | null;
  createdBy: string;
  createdAt: unknown;
  updatedAt: unknown;
};
type KnowledgeDocument = {
  sourceId: string;
  storageKey: string;
  title: string;
  mimeType: string;
  checksum: string;
  processingStatus: string;
  errorCode: string | null;
  metadata: Record<string, unknown>;
  ingestionVersion: number;
  externalJobId: string | null;
  createdAt: unknown;
  updatedAt: unknown;
};
const sourceApi = (value: Source & { id: string }, organizationId: string) => ({
  id: value.id,
  business_id: organizationId,
  organization_id: organizationId,
  name: value.name,
  source_type: value.sourceType,
  source_uri: value.sourceUri,
  status: value.status,
  sync_config_json: value.syncConfig,
  processing_status: value.processingStatus,
  processing_error_code: value.processingErrorCode,
  external_job_id: value.externalJobId,
  created_by_user_id: value.createdBy,
  created_at: value.createdAt,
  updated_at: value.updatedAt,
});
const documentApi = (
  value: KnowledgeDocument & { id: string },
  organizationId: string,
) => ({
  id: value.id,
  business_id: organizationId,
  organization_id: organizationId,
  source_id: value.sourceId,
  storage_key: value.storageKey,
  title: value.title,
  mime_type: value.mimeType,
  checksum: value.checksum,
  processing_status: value.processingStatus,
  error_code: value.errorCode,
  document_metadata: value.metadata,
  ingestion_version: value.ingestionVersion,
  external_job_id: value.externalJobId,
  created_at: value.createdAt,
  updated_at: value.updatedAt,
});

export function knowledgeRoutes(ai: AiService, storage: ObjectStorage) {
  return async (app: FastifyInstance): Promise<void> => {
    app.get(
      "/sources",
      { preHandler: [authenticate, requireOrganization("knowledge.view")] },
      async (request) =>
        (
          await app.store.list<Source>(
            app.store
              .collection(request.organization!.id, "knowledgeSources")
              .orderBy("createdAt", "desc")
              .limit(200),
          )
        ).map((item) => sourceApi(item, request.organization!.id)),
    );
    app.post(
      "/sources",
      { preHandler: [authenticate, requireOrganization("knowledge.manage")] },
      async (request, reply) => {
        const body = parse(
          z.object({
            name: z.string().trim().min(1).max(300),
            source_type: z
              .enum(["UPLOAD", "URL", "SITEMAP", "API", "NOTION", "OTHER"])
              .default("UPLOAD"),
            source_uri: z.string().max(5000).nullable().default(null),
            sync_config_json: z.record(z.string(), z.unknown()).default({}),
          }),
          request.body,
        );
        const ref = app.store.resource(
          request.organization!.id,
          "knowledgeSources",
        );
        const value: Source = {
          name: body.name,
          sourceType: body.source_type,
          sourceUri: body.source_uri,
          status: "ACTIVE",
          syncConfig: body.sync_config_json,
          processingStatus: "PENDING",
          processingErrorCode: null,
          externalJobId: null,
          createdBy: request.auth!.user.uid,
          createdAt: now(),
          updatedAt: now(),
        };
        await ref.create(value);
        await audit(
          request,
          "knowledge.source_created",
          "knowledge_source",
          ref.id,
          null,
          body,
        );
        return reply
          .status(201)
          .send(sourceApi({ id: ref.id, ...value }, request.organization!.id));
      },
    );
    app.get(
      "/sources/:sourceId",
      { preHandler: [authenticate, requireOrganization("knowledge.view")] },
      async (request) => {
        const { sourceId } = request.params as { sourceId: string };
        const value = document<Source>(
          await app.store
            .resource(request.organization!.id, "knowledgeSources", sourceId)
            .get(),
        );
        if (!value) throw notFound("knowledge_source");
        return sourceApi(value, request.organization!.id);
      },
    );
    app.patch(
      "/sources/:sourceId",
      { preHandler: [authenticate, requireOrganization("knowledge.manage")] },
      async (request) => {
        const { sourceId } = request.params as { sourceId: string };
        const body = parse(
          z.object({
            name: z.string().trim().min(1).max(300).optional(),
            source_uri: z.string().max(5000).nullable().optional(),
            status: z.enum(["ACTIVE", "DISABLED", "ARCHIVED"]).optional(),
            sync_config_json: z.record(z.string(), z.unknown()).optional(),
          }),
          request.body,
        );
        const ref = app.store.resource(
          request.organization!.id,
          "knowledgeSources",
          sourceId,
        );
        const current = document<Source>(await ref.get());
        if (!current) throw notFound("knowledge_source");
        const update = {
          ...(body.name !== undefined ? { name: body.name } : {}),
          ...(body.source_uri !== undefined
            ? { sourceUri: body.source_uri }
            : {}),
          ...(body.status !== undefined ? { status: body.status } : {}),
          ...(body.sync_config_json !== undefined
            ? { syncConfig: body.sync_config_json }
            : {}),
          updatedAt: now(),
        };
        await ref.update(update);
        await audit(
          request,
          "knowledge.source_updated",
          "knowledge_source",
          sourceId,
          current,
          body,
        );
        return sourceApi({ ...current, ...update }, request.organization!.id);
      },
    );
    app.delete(
      "/sources/:sourceId",
      { preHandler: [authenticate, requireOrganization("knowledge.manage")] },
      async (request, reply) => {
        const { sourceId } = request.params as { sourceId: string };
        const ref = app.store.resource(
          request.organization!.id,
          "knowledgeSources",
          sourceId,
        );
        if (!(await ref.get()).exists) throw notFound("knowledge_source");
        await ref.update({
          status: "ARCHIVED",
          processingStatus: "DISABLED",
          updatedAt: now(),
        });
        await audit(
          request,
          "knowledge.source_archived",
          "knowledge_source",
          sourceId,
        );
        return reply.status(204).send();
      },
    );
    app.get(
      "/sources/:sourceId/status",
      { preHandler: [authenticate, requireOrganization("knowledge.view")] },
      async (request) => {
        const { sourceId } = request.params as { sourceId: string };
        const ref = app.store.resource(
          request.organization!.id,
          "knowledgeSources",
          sourceId,
        );
        const source = document<Source>(await ref.get());
        if (!source) throw notFound("knowledge_source");
        if (!source.externalJobId)
          return { source_id: sourceId, status: source.processingStatus };
        try {
          const status = await ai.knowledgeStatus(source.externalJobId);
          await ref.update({
            processingStatus: status.status,
            processingErrorCode: status.errorCode ?? null,
            updatedAt: now(),
          });
          return { source_id: sourceId, ...status };
        } catch {
          return {
            source_id: sourceId,
            jobId: source.externalJobId,
            status: source.processingStatus,
            service_available: false,
          };
        }
      },
    );
    app.post(
      "/sources/:sourceId/submit",
      { preHandler: [authenticate, requireOrganization("knowledge.manage")] },
      async (request, reply) => {
        const { sourceId } = request.params as { sourceId: string };
        const ref = app.store.resource(
          request.organization!.id,
          "knowledgeSources",
          sourceId,
        );
        const source = document<Source>(await ref.get());
        if (!source) throw notFound("knowledge_source");
        try {
          const submitted = await ai.submitKnowledge({
            organizationId: request.organization!.id,
            sourceId,
            ...(source.sourceUri ? { sourceUri: source.sourceUri } : {}),
            metadata: source.syncConfig,
          });
          await ref.update({
            processingStatus: submitted.status,
            processingErrorCode: null,
            externalJobId: submitted.jobId,
            updatedAt: now(),
          });
          return reply.status(202).send({
            source_id: sourceId,
            external_job_id: submitted.jobId,
            status: submitted.status,
          });
        } catch (error) {
          await ref.update({
            processingStatus: "FAILED",
            processingErrorCode: "AI_SERVICE_UNAVAILABLE",
            updatedAt: now(),
          });
          throw error;
        }
      },
    );
    app.post(
      "/documents",
      { preHandler: [authenticate, requireOrganization("knowledge.manage")] },
      async (request, reply) => {
        const part = await request.file({
          limits: { fileSize: app.config.MAX_UPLOAD_BYTES, files: 1 },
        });
        if (!part)
          throw new AppError(
            "FILE_REQUIRED",
            "A document file is required.",
            422,
          );
        const sourceId = String(
          part.fields.source_id && "value" in part.fields.source_id
            ? part.fields.source_id.value
            : "",
        );
        const sourceRef = app.store.resource(
          request.organization!.id,
          "knowledgeSources",
          sourceId,
        );
        if (!sourceId || !(await sourceRef.get()).exists)
          throw notFound("knowledge_source");
        const data = await part.toBuffer();
        const stored = await storage.put(
          request.organization!.id,
          part.filename,
          data,
          part.mimetype,
        );
        const documentRef = app.store.resource(
          request.organization!.id,
          "knowledgeDocuments",
        );
        const submitted = await ai.submitKnowledge({
          organizationId: request.organization!.id,
          sourceId,
          documentId: documentRef.id,
          storageKey: stored.key,
          metadata: {
            title: part.filename,
            mimeType: part.mimetype,
            checksum: stored.checksum,
          },
        });
        const jobRef = app.store.resource(request.organization!.id, "jobs");
        const value: KnowledgeDocument = {
          sourceId,
          storageKey: stored.key,
          title: part.filename,
          mimeType: part.mimetype,
          checksum: stored.checksum,
          processingStatus: submitted.status,
          errorCode: null,
          metadata: { size: stored.size },
          ingestionVersion: 1,
          externalJobId: submitted.jobId,
          createdAt: now(),
          updatedAt: now(),
        };
        await app.store.db.runTransaction(async (transaction) => {
          transaction.create(documentRef, value);
          transaction.create(jobRef, {
            jobType: "KNOWLEDGE_PROCESS",
            resourceType: "knowledge_document",
            resourceId: documentRef.id,
            status: submitted.status,
            progress: 0,
            attemptCount: 0,
            externalJobId: submitted.jobId,
            createdAt: now(),
            updatedAt: now(),
          });
          transaction.update(sourceRef, {
            processingStatus: submitted.status,
            externalJobId: submitted.jobId,
            updatedAt: now(),
          });
        });
        return reply.status(202).send({
          job_id: jobRef.id,
          resource_id: documentRef.id,
          status: submitted.status,
          external_job_id: submitted.jobId,
        });
      },
    );
    app.get(
      "/documents/:documentId",
      { preHandler: [authenticate, requireOrganization("knowledge.view")] },
      async (request) => {
        const { documentId } = request.params as { documentId: string };
        const value = document<KnowledgeDocument>(
          await app.store
            .resource(
              request.organization!.id,
              "knowledgeDocuments",
              documentId,
            )
            .get(),
        );
        if (!value) throw notFound("knowledge_document");
        return documentApi(value, request.organization!.id);
      },
    );
    app.post(
      "/documents/:documentId/reprocess",
      { preHandler: [authenticate, requireOrganization("knowledge.manage")] },
      async (request, reply) => {
        const { documentId } = request.params as { documentId: string };
        const ref = app.store.resource(
          request.organization!.id,
          "knowledgeDocuments",
          documentId,
        );
        const value = document<KnowledgeDocument>(await ref.get());
        if (!value) throw notFound("knowledge_document");
        const submitted = await ai.submitKnowledge({
          organizationId: request.organization!.id,
          sourceId: value.sourceId,
          documentId,
          storageKey: value.storageKey,
          metadata: value.metadata,
        });
        const jobRef = app.store.resource(request.organization!.id, "jobs");
        const version = value.ingestionVersion + 1;
        await app.store.db.runTransaction(async (transaction) => {
          transaction.update(ref, {
            processingStatus: submitted.status,
            errorCode: null,
            externalJobId: submitted.jobId,
            ingestionVersion: version,
            updatedAt: now(),
          });
          transaction.create(jobRef, {
            jobType: "KNOWLEDGE_REPROCESS",
            resourceType: "knowledge_document",
            resourceId: documentId,
            status: submitted.status,
            progress: 0,
            attemptCount: 0,
            externalJobId: submitted.jobId,
            createdAt: now(),
            updatedAt: now(),
          });
        });
        return reply.status(202).send({
          job_id: jobRef.id,
          resource_id: documentId,
          status: submitted.status,
          external_job_id: submitted.jobId,
        });
      },
    );
  };
}
