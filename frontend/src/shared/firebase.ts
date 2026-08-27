import { getApp, getApps, initializeApp } from "firebase/app";
import { connectAuthEmulator, getAuth } from "firebase/auth";

const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "demo-key",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "demo-erp-chatbot.firebaseapp.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "demo-erp-chatbot",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || undefined,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || undefined,
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "demo-app-id",
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || undefined,
};

export const firebaseApp = getApps().length ? getApp() : initializeApp(config);
export const firebaseAuth = getAuth(firebaseApp);

declare global {
  var __chatbotAuthEmulatorConnected: boolean | undefined;
}

if (import.meta.env.VITE_FIREBASE_AUTH_EMULATOR_URL && !globalThis.__chatbotAuthEmulatorConnected) {
  connectAuthEmulator(firebaseAuth, import.meta.env.VITE_FIREBASE_AUTH_EMULATOR_URL, {
    disableWarnings: true,
  });
  globalThis.__chatbotAuthEmulatorConnected = true;
}
