import { describe, expect, it, vi } from "vitest";
import {
  membersWithPermission,
  notify,
  notifyQuietly,
  resolveNotifications,
} from "../src/modules/notifications/service.js";

const snapshot = (id, data) => ({
  id,
  data: () => data,
  get: (key) => data[key],
});

/** Minimal stand-in for the pieces of PlatformStore the service touches. */
function appWith({ members = [], notifications = [] } = {}) {
  const batch = { creates: [], updates: [], committed: false };
  const collection = (name) => ({
    _name: name,
    doc: () => ({ _ref: name }),
    where: () => collection(name),
    limit: () => collection(name),
    get: async () => ({
      docs: notifications.map((item) => snapshot(item.id, item)),
    }),
  });
  return {
    log: { warn: vi.fn() },
    store: {
      db: {
        collection,
        batch: () => ({
          create: (ref, value) => batch.creates.push({ ref, value }),
          update: (ref, value) => batch.updates.push({ ref, value }),
          commit: async () => {
            batch.committed = true;
          },
        }),
      },
      collection: () => ({
        limit: () => ({
          get: async () => ({
            docs: members.map((item) => snapshot(item.uid, item)),
          }),
        }),
      }),
    },
    _batch: batch,
  };
}

const member = (uid, role, extra = {}) => ({
  uid,
  role,
  status: "ACTIVE",
  permissions: [],
  deniedPermissions: [],
  ...extra,
});

describe("membersWithPermission", () => {
  const resolve = (members, prime = "prime-user") =>
    membersWithPermission(
      appWith({ members }) as never,
      "organization-a",
      "organization.members.manage",
      prime,
    );

  it("includes Prime, Owner, and Admin but not Agent or Viewer", async () =>
    expect(
      await resolve([
        member("prime-user", "PRIME"),
        member("owner-user", "OWNER"),
        member("admin-user", "ADMIN"),
        member("agent-user", "AGENT"),
        member("viewer-user", "VIEWER"),
      ]),
    ).toEqual(["prime-user", "owner-user", "admin-user"]));

  it("includes a CUSTOM member holding an explicit grant", async () =>
    expect(
      await resolve([
        member("custom-user", "CUSTOM", {
          permissions: ["organization.members.manage"],
        }),
      ]),
    ).toEqual(["custom-user"]));

  it("excludes an Admin whose permission is explicitly denied", async () =>
    expect(
      await resolve([
        member("admin-user", "ADMIN", {
          deniedPermissions: ["organization.members.manage"],
        }),
      ]),
    ).toEqual([]));

  it("never lets a deny strip Prime", async () =>
    expect(
      await resolve([
        member("prime-user", "PRIME", {
          deniedPermissions: ["organization.members.manage"],
        }),
      ]),
    ).toEqual(["prime-user"]));

  it("skips members who are not ACTIVE", async () =>
    expect(
      await resolve([member("owner-user", "OWNER", { status: "SUSPENDED" })]),
    ).toEqual([]));
});

describe("notify", () => {
  const input = (userId) => ({
    userId,
    type: "join_request.created" as const,
    title: "New join request",
    body: "Someone requested access.",
    organizationId: "organization-a",
    organizationName: "Allowed",
    section: "team",
  });

  it("writes one unread document per recipient in a single batch", async () => {
    const app = appWith();
    await notify(app as never, [input("a"), input("b")]);
    expect(app._batch.creates).toHaveLength(2);
    expect(app._batch.committed).toBe(true);
    expect(app._batch.creates[0].value).toMatchObject({
      userId: "a",
      type: "join_request.created",
      readAt: null,
    });
  });

  it("does not touch Firestore when there are no recipients", async () => {
    const app = appWith();
    await notify(app as never, []);
    expect(app._batch.committed).toBe(false);
  });

  it("swallows write failures so delivery never fails the caller", async () => {
    const app = appWith();
    app.store.db.batch = () => {
      throw new Error("firestore unavailable");
    };
    await expect(
      notifyQuietly(app as never, [input("a")]),
    ).resolves.toBeUndefined();
    expect(app.log.warn).toHaveBeenCalled();
  });
});

describe("resolveNotifications", () => {
  it("marks only the matching unread notifications read", async () => {
    const app = appWith({
      notifications: [
        {
          id: "n1",
          resourceType: "join_request",
          resourceId: "req-1",
          readAt: null,
        },
        {
          id: "n2",
          resourceType: "join_request",
          resourceId: "req-1",
          readAt: "2026-08-25T00:00:00.000Z",
        },
        {
          id: "n3",
          resourceType: "invitation",
          resourceId: "req-1",
          readAt: null,
        },
      ],
    });
    await resolveNotifications(app as never, "join_request", "req-1");
    expect(app._batch.updates).toHaveLength(1);
    expect(app._batch.committed).toBe(true);
  });

  it("commits nothing when every notification is already read", async () => {
    const app = appWith({
      notifications: [
        {
          id: "n1",
          resourceType: "join_request",
          resourceId: "req-1",
          readAt: "2026-08-25T00:00:00.000Z",
        },
      ],
    });
    await resolveNotifications(app as never, "join_request", "req-1");
    expect(app._batch.committed).toBe(false);
  });
});
