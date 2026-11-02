import { randomUUID } from "node:crypto";
import { expect } from "vitest";
import type { FastifyInstance } from "fastify";
import type { DecodedIdToken } from "firebase-admin/auth";
import { deleteApp, initializeApp, type App } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { loadConfig, type Config } from "../../src/config.js";
import { Database, type Name } from "../../src/firestore/database.js";
import { seedDevelopmentPlan } from "../../src/firestore/provision.js";
import { buildFirestoreApp } from "../../src/firestore/app.js";
import { Platform } from "../../src/firestore/platform.js";

// Runs only against the Firestore emulator (npm run test:firestore), never a real project.
export const emulator = process.env.FIRESTORE_EMULATOR_HOST;

/* One API on its own fresh named database, with fake sign-in tokens, and the helpers the
   Firestore tests share. Call start() in beforeAll and stop() in afterAll. */
export function createHarness(overrides: Record<string, string> = {}) {
  const tokens = new Map<string, DecodedIdToken>();
  const config: Config = loadConfig({
    APP_ENV: "test",
    TERMS_VERSION: "test-terms",
    DEFAULT_PLAN_PROJECTS: "3",
    DEFAULT_PLAN_MEMBERS: "10",
    ...overrides,
  });
  const harness = {
    tokens,
    config,
    firebaseApp: undefined as App | undefined,
    db: undefined as unknown as Database,
    app: undefined as unknown as FastifyInstance,
    platform: undefined as unknown as Platform,

    async start() {
      harness.firebaseApp = initializeApp(
        { projectId: "demo-liftof-test" },
        `test-${randomUUID()}`,
      );
      // A new named database per run keeps runs apart without deleting anything.
      const firestore = getFirestore(
        harness.firebaseApp,
        `test-${randomUUID().slice(0, 8)}`,
      );
      firestore.settings({ ignoreUndefinedProperties: true });
      harness.db = new Database(firestore);
      harness.platform = new Platform(harness.db, config);
      await seedDevelopmentPlan(harness.db, config);
      harness.app = await buildFirestoreApp(config, {
        database: harness.db,
        verifyToken: async (raw) => {
          const decoded = tokens.get(raw);
          if (!decoded) throw new Error("invalid test token");
          return decoded;
        },
        revokeTokens: async () => {},
      });
    },

    async stop() {
      await harness.app?.close();
      await harness.db?.close();
      if (harness.firebaseApp) await deleteApp(harness.firebaseApp);
    },

    token(uid: string, verified = true, email = `${uid}@example.test`) {
      tokens.set(uid, {
        uid,
        sub: uid,
        email,
        email_verified: verified,
        name: uid,
        firebase: {
          sign_in_provider: "password",
          identities: { email: [email] },
        },
      } as DecodedIdToken);
    },

    request(
      method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE",
      url: string,
      who: string,
      payload?: object,
    ) {
      return harness.app.inject({
        method,
        url: `/api/v1${url}`,
        headers: { authorization: `Bearer ${who}` },
        ...(payload ? { payload } : {}),
      });
    },

    async count(name: Name, field: string, value: string) {
      return (await harness.db.find(name, (q) => q.where(field, "==", value)))
        .length;
    },

    async copyExists(projectId: string, userId: string) {
      return (
        (await harness.db.get("project_members", `${projectId}_${userId}`)) !==
        undefined
      );
    },

    async acceptTerms(who: string) {
      const terms = await harness.request("POST", "/auth/terms", who, {
        accepted: true,
        version: "test-terms",
      });
      expect(terms.statusCode, terms.body).toBe(200);
    },

    async onboard(who: string, verified = true) {
      harness.token(who, verified);
      const response = await harness.request("POST", "/auth/onboard", who, {});
      expect(response.statusCode, response.body).toBe(200);
      await harness.acceptTerms(who);
      return {
        id: response.json().user.id as string,
        org: response.json().memberships[0].organization_id as string,
      };
    },

    // Invites `who` and lets them join at first sign-in.
    async join(inviter: string, org: string, who: string, role = "member") {
      const invitation = await harness.request(
        "POST",
        `/organizations/${org}/invitations`,
        inviter,
        { email: `${who}@example.test`, role },
      );
      expect(invitation.statusCode, invitation.body).toBe(200);
      harness.token(who);
      const response = await harness.request("POST", "/auth/onboard", who, {
        invitation_token: invitation.json().invitation_token,
      });
      expect(response.statusCode, response.body).toBe(200);
      await harness.acceptTerms(who);
      return response.json().user.id as string;
    },

    async newProject(who: string, org: string) {
      const created = await harness.request(
        "POST",
        `/organizations/${org}/projects`,
        who,
        { name: `Project ${randomUUID().slice(0, 6)}` },
      );
      expect(created.statusCode, created.body).toBe(201);
      return created.json().id as string;
    },

    // An active agent record, as the RAG's agent schema stores it, for the inbox to accept messages for.
    // Only the fields the inbox reads.
    async activeAgent(projectId: string) {
      const agentId = randomUUID();
      await harness.db
        .collection("agents")
        .doc(agentId)
        .set({ _id: agentId, project_id: projectId, status: "active" });
      return agentId;
    },
  };
  return harness;
}
