import {
  applicationDefault,
  cert,
  getApps,
  initializeApp,
  type App,
} from "firebase-admin/app";
import { getAuth, type Auth, type DecodedIdToken } from "firebase-admin/auth";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import type { Config } from "../config.js";

export interface FirebaseServices {
  app: App;
  auth: Auth;
  firestore: Firestore;
}

function serviceAccount(config: Config) {
  if (!config.FIREBASE_SERVICE_ACCOUNT_JSON) return null;
  const raw = config.FIREBASE_SERVICE_ACCOUNT_JSON.trim().startsWith("{")
    ? config.FIREBASE_SERVICE_ACCOUNT_JSON
    : Buffer.from(config.FIREBASE_SERVICE_ACCOUNT_JSON, "base64").toString(
        "utf8",
      );
  const parsed = JSON.parse(raw) as {
    project_id: string;
    client_email: string;
    private_key: string;
  };
  return {
    projectId: parsed.project_id,
    clientEmail: parsed.client_email,
    privateKey: parsed.private_key.replace(/\\n/g, "\n"),
  };
}

export function createFirebaseServices(config: Config): FirebaseServices {
  const existing = getApps().find(
    (candidate) => candidate.name === config.FIREBASE_APP_NAME,
  );
  const credentials = serviceAccount(config);
  const app =
    existing ??
    initializeApp(
      {
        projectId: config.FIREBASE_PROJECT_ID,
        // The emulators need no credential; real Firebase Auth does, even beside the Firestore
        // emulator (GOOGLE_APPLICATION_CREDENTIALS names its key).
        ...(credentials
          ? { credential: cert(credentials) }
          : process.env.FIRESTORE_EMULATOR_HOST &&
              !process.env.GOOGLE_APPLICATION_CREDENTIALS
            ? {}
            : { credential: applicationDefault() }),
      },
      config.FIREBASE_APP_NAME,
    );
  const firestore = getFirestore(app);
  firestore.settings({ ignoreUndefinedProperties: true });
  return { app, auth: getAuth(app), firestore };
}

// Checking for revoked tokens asks Firebase about the user, about 350 ms per request. The answer is kept
// per user for a minute, so a revocation or a disabled account elsewhere applies within that time;
// "sign out everywhere" through this API applies at once on this server.
const REVOCATION_CACHE_MS = 60_000;
const REVOCATION_CACHE_MAX = 10_000;

export function firebaseTokens(auth: Auth, checkRevoked: boolean) {
  const users = new Map<
    string,
    { validSince: number; disabled: boolean; expires: number }
  >();

  async function userState(uid: string) {
    const hit = users.get(uid);
    if (hit && hit.expires > Date.now()) return hit;
    const record = await auth.getUser(uid);
    if (users.size >= REVOCATION_CACHE_MAX) users.clear();
    const state = {
      // Firebase compares in whole seconds, against the token's auth_time.
      validSince: record.tokensValidAfterTime
        ? Math.floor(Date.parse(record.tokensValidAfterTime) / 1000)
        : 0,
      disabled: record.disabled,
      expires: Date.now() + REVOCATION_CACHE_MS,
    };
    users.set(uid, state);
    return state;
  }

  return {
    async verify(raw: string): Promise<DecodedIdToken> {
      const decoded = await auth.verifyIdToken(raw);
      if (!checkRevoked) return decoded;
      const state = await userState(decoded.uid);
      if (state.disabled) throw new Error("The account is disabled.");
      if (decoded.auth_time < state.validSince)
        throw new Error("The token was revoked.");
      return decoded;
    },
    async revoke(uid: string) {
      await auth.revokeRefreshTokens(uid);
      users.delete(uid);
    },
  };
}
