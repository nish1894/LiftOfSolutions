import { createClient } from "@supabase/supabase-js";

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

// persistSession and detectSessionInUrl are on by default: the session lives in
// localStorage, and the OAuth redirect back to the app is consumed automatically,
// which is why no dedicated /callback route is needed.
export const supabase = createClient(supabaseUrl, supabaseKey);
