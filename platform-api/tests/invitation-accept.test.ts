import Fastify from "fastify";
import { describe, expect, it, vi } from "vitest";
import { authRoutes } from "../src/modules/auth/routes.js";

async function appFor(emailVerified: boolean) {
  const runTransaction = vi.fn();
  const app = Fastify();
  app.decorate("config", { FIREBASE_CHECK_REVOKED_TOKENS: false } as never);
  app.decorate("firebase", {
    auth: {
      verifyIdToken: vi.fn().mockResolvedValue({
        uid: "firebase-user-1",
        email: "ravi@acme.com",
        email_verified: emailVerified,
      }),
    },
  } as never);
  app.decorate("store", {
    db: { collection: () => ({ doc: () => ({}) }), runTransaction },
  } as never);
  await app.register(authRoutes);
  return { app, runTransaction };
}

describe("accepting an invitation", () => {
  it("refuses an unverified email before touching the invitation", async () => {
    const { app, runTransaction } = await appFor(false);
    const response = await app.inject({
      method: "POST",
      url: "/invitations/accept",
      headers: { authorization: "Bearer firebase-id-token" },
      payload: { token: "x".repeat(32) },
    });
    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: "EMAIL_NOT_VERIFIED" });
    expect(runTransaction).not.toHaveBeenCalled();
  });
});
