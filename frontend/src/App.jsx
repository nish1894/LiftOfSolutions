import { useState } from "react";

import { sendChatMessage } from "./api.js";
import MessageInput from "./components/MessageInput.jsx";
import MessageList from "./components/MessageList.jsx";

let nextMessageId = 0;

function createMessage(role, text, isError = false) {
  return { id: (nextMessageId += 1), role, text, isError };
}

export default function App() {
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

  return (
    <main>
      <header>
        <h1>Chatbot</h1>
      </header>

      <MessageList messages={messages} pending={pending} />
      <MessageInput onSend={handleSend} disabled={pending} />
    </main>
  );
}
