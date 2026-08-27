import {
  applicationDefault,
  cert,
  getApps,
  initializeApp,
  type App,
} from "firebase-admin/app";
import { getAuth, type Auth } from "firebase-admin/auth";
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
        ...(credentials
          ? { credential: cert(credentials) }
          : process.env.FIRESTORE_EMULATOR_HOST
            ? {}
            : { credential: applicationDefault() }),
      },
      config.FIREBASE_APP_NAME,
    );
  const firestore = getFirestore(app);
  firestore.settings({ ignoreUndefinedProperties: true });
  return { app, auth: getAuth(app), firestore };
}
