import { describe, expect, it, vi } from "vitest";
import type { FastifyRequest } from "fastify";
import { authenticate, requireOrganization } from "../src/common/context.js";

const uid = "firebase-user-1";
const allowedOrganization = "organization-a";

function snapshot(id, data) {
  return { id, data: () => data };
}
function requestFor(
  organizationId,
  member = {
    role: "AGENT",
    status: "ACTIVE",
    permissions: [],
    deniedPermissions: [],
  },
) {
  const organizations = {
    [allowedOrganization]: {
      name: "Allowed",
      slug: "allowed",
      status: "ACTIVE",
      primeUserId: "prime-user",
    },
    "organization-b": {
      name: "Other",
      slug: "other",
      status: "ACTIVE",
      primeUserId: "other-prime",
    },
  };
  return {
    headers: { authorization: "Bearer firebase-id-token" },
    params: { businessId: organizationId },
    server: {
      config: { FIREBASE_CHECK_REVOKED_TOKENS: false },
      firebase: {
        auth: {
          verifyIdToken: vi
            .fn()
            .mockResolvedValue({
              uid,
              email: "agent@example.com",
              email_verified: true,
            }),
        },
      },
      store: {
        organization: (id) => ({
          get: async () => snapshot(id, organizations[id]),
        }),
        member: (id) => ({
          get: async () =>
            snapshot(uid, id === allowedOrganization ? member : undefined),
        }),
      },
    },
  } as unknown as FastifyRequest;
}

describe("Firebase organization isolation", () => {
  it("rejects a missing Firebase bearer token", async () => {
    const request = requestFor(allowedOrganization);
    request.headers.authorization = undefined;
    await expect(authenticate(request)).rejects.toMatchObject({
      code: "AUTHENTICATION_REQUIRED",
      statusCode: 401,
    });
  });

  it("rejects an invalid Firebase token", async () => {
    const request = requestFor(allowedOrganization);
    request.server.firebase.auth.verifyIdToken = vi
      .fn()
      .mockRejectedValue(new Error("expired"));
    await expect(authenticate(request)).rejects.toMatchObject({
      code: "AUTHENTICATION_REQUIRED",
      statusCode: 401,
    });
  });

  it("rejects cross-organization access even with a valid Firebase token", async () => {
    const request = requestFor("organization-b");
    await authenticate(request);
    await expect(
      requireOrganization("conversations.view")(request, {} as never),
    ).rejects.toMatchObject({ code: "PERMISSION_DENIED", statusCode: 403 });
  });

  it("applies granular permission denies", async () => {
    const request = requestFor(allowedOrganization, {
      role: "AGENT",
      status: "ACTIVE",
      permissions: [],
      deniedPermissions: ["conversations.reply"],
    });
    await authenticate(request);
    await expect(
      requireOrganization("conversations.reply")(request, {} as never),
    ).rejects.toMatchObject({ code: "PERMISSION_DENIED" });
  });

  it("allows an active member only inside their organization", async () => {
    const request = requestFor(allowedOrganization);
    await authenticate(request);
    await requireOrganization("conversations.view")(request, {} as never);
    expect(request.organization?.id).toBe(allowedOrganization);
  });

  it("never applies permission denies to the Prime user", async () => {
    const request = requestFor(allowedOrganization, {
      role: "PRIME",
      status: "ACTIVE",
      permissions: [],
      deniedPermissions: ["billing.manage"],
    });
    request.server.store.organization = (id) => ({
      get: async () =>
        snapshot(id, {
          name: "Allowed",
          slug: "allowed",
          status: "ACTIVE",
          primeUserId: uid,
        }),
    });
    await authenticate(request);
    await requireOrganization("billing.manage")(request, {} as never);
    expect(request.organization?.role).toBe("PRIME");
  });
});
