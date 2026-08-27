import type { FastifyInstance } from "fastify";
import { authenticate, requireOrganization } from "../../common/context.js";

export async function eventRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    "/",
    { preHandler: [authenticate, requireOrganization("conversations.view")] },
    async (request, reply) => {
      reply.raw.writeHead(200, {
        "content-type": "text/event-stream",
        "cache-control": "no-cache, no-transform",
        connection: "keep-alive",
        "x-accel-buffering": "no",
      });
      reply.raw.write(
        `event: connected\ndata: ${JSON.stringify({ organization_id: request.organization!.id, request_id: request.id })}\n\n`,
      );
      const interval = setInterval(
        () =>
          reply.raw.write(
            `event: heartbeat\ndata: ${JSON.stringify({ at: new Date().toISOString() })}\n\n`,
          ),
        15_000,
      );
      request.raw.on("close", () => clearInterval(interval));
      return reply.hijack();
    },
  );
}
