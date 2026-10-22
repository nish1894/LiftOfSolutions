import { type FormEvent, useEffect, useRef, useState } from "react";
import { SendIcon } from "lucide-react";

import { Citations } from "@/components/app/citations.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { useOrgMutation } from "@/features/workspace/workspace.ts";
import { cn } from "@/lib/utils.ts";
import type { Citation } from "@/shared/types.ts";

interface TestMessage {
  id: number;
  role: "user" | "assistant";
  text: string;
  citations: Citation[];
  isError?: boolean;
}

interface TestResponse {
  result?: { content?: string; citations?: Citation[] };
}

/** Sends test questions to an assistant's saved draft and shows its sources. */
export default function ChatTester({
  agentId,
  className,
}: {
  agentId: string;
  className?: string;
}) {
  const { request } = useOrgMutation();
  const [messages, setMessages] = useState<TestMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState(false);
  const nextId = useRef(0);
  const endRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView?.({ block: "nearest" });
  }, [messages, pending]);

  function add(message: Omit<TestMessage, "id">) {
    nextId.current += 1;
    const id = nextId.current;
    setMessages((current) => [...current, { ...message, id }]);
  }

  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = draft.trim();
    if (!text || pending) return;
    setDraft("");
    add({ role: "user", text, citations: [] });
    setPending(true);
    try {
      const data = await request<TestResponse>(`/assistants/${agentId}/test`, {
        method: "POST",
        body: { message: text },
      });
      add({
        role: "assistant",
        text: data.result?.content || "No reply.",
        citations: data.result?.citations ?? [],
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "The test failed.";
      add({ role: "assistant", text: message, citations: [], isError: true });
    } finally {
      setPending(false);
    }
  }

  return (
    <div className={cn("flex min-h-80 flex-col", className)}>
      <div className="flex-1 space-y-3 overflow-y-auto pb-3" aria-live="polite" aria-busy={pending}>
        {messages.length === 0 && (
          <p className="py-8 text-center text-sm text-muted-foreground">
            Ask something a customer would ask.
          </p>
        )}
        {messages.map((message) => (
          <div
            key={message.id}
            className={cn("flex", message.role === "user" ? "justify-end" : "justify-start")}
          >
            <div
              className={cn(
                "max-w-[85%] rounded-lg px-3 py-2",
                message.role === "user" && "bg-primary text-primary-foreground",
                message.role === "assistant" && "border bg-card",
                message.isError && "border-danger/30 bg-danger-bg text-danger",
              )}
            >
              <p className="whitespace-pre-wrap">{message.text}</p>
              {message.role === "assistant" && !message.isError && (
                <Citations citations={message.citations} />
              )}
            </div>
          </div>
        ))}
        {pending && <p className="text-sm text-muted-foreground">Thinking…</p>}
        <div ref={endRef} />
      </div>
      <form className="flex gap-2 border-t pt-3" onSubmit={send}>
        <label htmlFor={`test-message-${agentId}`} className="sr-only">
          Test message
        </label>
        <Input
          id={`test-message-${agentId}`}
          autoComplete="off"
          placeholder="Type a question"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          disabled={pending}
        />
        <Button type="submit" disabled={pending || !draft.trim()}>
          <SendIcon />
          Send
        </Button>
      </form>
    </div>
  );
}
