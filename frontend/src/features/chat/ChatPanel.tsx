import { useState } from "react";

import { sendChatMessage } from "./api.ts";
import type { ChatMessage, MessageRole } from "./types.ts";
import MessageInput from "./MessageInput.tsx";
import MessageList from "./MessageList.tsx";

let nextMessageId = 0;

function createMessage(role: MessageRole, text: string, isError = false): ChatMessage {
  return { id: (nextMessageId += 1), role, text, isError };
}

interface ChatPanelProps {
  businessId: string;
  agent?: { id: string } | null;
}

export default function ChatPanel({ businessId, agent }: ChatPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>(() => [createMessage("bot", "Ready.")]);
  const [pending, setPending] = useState(false);

  async function handleSend(text: string) {
    setMessages((current) => [...current, createMessage("user", text)]);
    setPending(true);

    try {
      if (!agent) throw new Error("Create an Agent first.");
      const data = await sendChatMessage(text, businessId, agent.id);
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
    <section className="platform-chat" aria-label="Chat playground">
      <MessageList messages={messages} pending={pending} />
      {!agent && <p className="status">Create an Agent before using the playground.</p>}
      <MessageInput onSend={handleSend} disabled={pending || !agent} />
    </section>
  );
}
