import { supabase } from "./lib/supabase.js";

export async function sendChatMessage(message) {
  // getSession() refreshes the access token when it is close to expiry, so this
  // is preferred over holding a token from render state.
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const response = await fetch("/api/chat", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(session ? { Authorization: `Bearer ${session.access_token}` } : {}),
    },
    body: JSON.stringify({ message }),
  });

  // The caller renders a failed turn as an error bubble, so a non-2xx has to
  // throw rather than fall through to response.json() on an error body.
  if (!response.ok) {
    throw new Error(`Chat request failed with status ${response.status}`);
  }

  return response.json();
}
