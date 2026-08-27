import type { FastifyRequest } from "fastify";
import { now } from "../firebase/store.js";

export async function audit(
  request: FastifyRequest,
  action: string,
  resourceType: string,
  resourceId: string | null,
  before: unknown = null,
  after: unknown = null,
): Promise<void> {
  if (!request.organization) return;
  await request.server.store
    .resource(request.organization.id, "auditEvents")
    .create({
      actorUserId: request.auth?.user.uid ?? null,
      action,
      resourceType,
      resourceId,
      before,
      after,
      requestId: request.id,
      ipAddress: request.ip,
      createdAt: now(),
    });
}
