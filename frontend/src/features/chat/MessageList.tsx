import { useEffect, useRef } from "react";

import type { ChatMessage } from "./types.ts";

interface MessageListProps {
  messages: ChatMessage[];
  pending: boolean;
}

export default function MessageList({ messages, pending }: MessageListProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Pin to the newest message. `pending` is a dependency too, so the typing
  // indicator appearing scrolls as well as a real message would.
  useEffect(() => {
    const container = containerRef.current;
    if (container) container.scrollTop = container.scrollHeight;
  }, [messages, pending]);

  return (
    <section id="messages" aria-live="polite" aria-busy={pending} ref={containerRef}>
      {messages.map((message) => (
        <div
          key={message.id}
          className={`message ${message.role}${message.isError ? " error" : ""}`}
        >
          {message.text}
        </div>
      ))}

      {pending && <div className="message bot pending">Thinking…</div>}
    </section>
  );
}
