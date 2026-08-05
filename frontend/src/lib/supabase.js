import { createClient } from "@supabase/supabase-js";

import { cookieStorage } from "./cookieStorage.js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

// Fail loudly at startup rather than letting every auth call reject with an
// opaque "Invalid API key" once the app is already running.
if (!supabaseUrl || !supabaseKey) {
  throw new Error(
    "Missing VITE_SUPABASE_URL or VITE_SUPABASE_PUBLISHABLE_KEY. " +
      "Copy frontend/.env.example to frontend/.env.local and fill both in.",
  );
}

export const SESSION_COOKIE_KEY = "chatbot-auth";

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    // Cookies rather than the default localStorage, so the session is attached
    // to same-origin API requests and is readable by the backend later.
    storage: cookieStorage,
    storageKey: SESSION_COOKIE_KEY,
    persistSession: true,
    autoRefreshToken: true,
    // Consumes the OAuth redirect back into the app; no callback route needed.
    detectSessionInUrl: true,
  },
});
