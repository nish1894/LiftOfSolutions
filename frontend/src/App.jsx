import { useState } from "react";

import { sendChatMessage } from "./api.js";
import { useAuth } from "./auth/AuthProvider.jsx";
import MessageInput from "./components/MessageInput.jsx";
import MessageList from "./components/MessageList.jsx";
import SignIn from "./components/SignIn.jsx";

let nextMessageId = 0;

function createMessage(role, text, isError = false) {
  return { id: (nextMessageId += 1), role, text, isError };
}

export default function App() {
  const { user, loading, signOut } = useAuth();
  const [messages, setMessages] = useState(() => [createMessage("bot", "Ready.")]);
  const [pending, setPending] = useState(false);

  async function handleSend(text) {
    setMessages((current) => [...current, createMessage("user", text)]);
    setPending(true);

    try {
      const data = await sendChatMessage(text);
      setMessages((current) => [...current, createMessage("bot", data.reply || "No reply.")]);
    } catch {
      setMessages((current) => [
        ...current,
        createMessage("bot", "Something went wrong. Please try again.", true),
      ]);
    } finally {
      setPending(false);
    }
  }

  // Restoring a persisted session is async, so render nothing decisive until it
  // settles — otherwise a signed-in user sees the login screen flash on reload.
  if (loading) {
    return (
      <main>
        <p className="loading">Loading…</p>
      </main>
    );
  }

  if (!user) {
    return <SignIn />;
  }

  return (
    <main>
      <header>
        <h1>Chatbot</h1>
        <div className="account">
          <span className="email">{user.email}</span>
          <button type="button" className="link" onClick={signOut}>
            Sign out
          </button>
        </div>
      </header>

      <MessageList messages={messages} pending={pending} />
      <MessageInput onSend={handleSend} disabled={pending} />
    </main>
  );
}
