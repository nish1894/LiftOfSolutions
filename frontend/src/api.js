export async function sendChatMessage(message) {
  const response = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message }),
  });

  // The caller renders a failed turn as an error bubble, so a non-2xx has to
  // throw rather than fall through to response.json() on an error body.
  if (!response.ok) {
    throw new Error(`Chat request failed with status ${response.status}`);
  }

  return response.json();
}
