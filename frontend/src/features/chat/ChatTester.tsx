import { type FormEvent, useEffect, useRef, useState } from "react";
import { RotateCcwIcon, SendIcon } from "lucide-react";

import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { useOrgMutation } from "@/features/workspace/workspace.ts";
import { cn } from "@/lib/utils.ts";

interface TestMessage {
  id: number;
  /** "note" is a line from the studio itself, such as a restarted conversation. */
  role: "user" | "assistant" | "note";
  text: string;
  isError?: boolean;
}

interface TestResponse {
  answer: string;
  convo_id: string;
  /** The draft changed since the last question, so the agent has no memory of the chat so far. */
  restarted: boolean;
}

/** Sends test questions to an agent's saved draft, in one conversation until "New chat". */
export default function ChatTester({
  agentId,
  prepare,
  className,
}: {
  agentId: string;
  /** Runs before each question, e.g. to save unsaved changes first. */
  prepare?: () => Promise<void>;
  className?: string;
}) {
  const { request } = useOrgMutation();
  const [messages, setMessages] = useState<TestMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState(false);
  const [convoId, setConvoId] = useState(() => crypto.randomUUID());
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

  function restart() {
    setMessages([]);
    setConvoId(crypto.randomUUID());
  }

  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = draft.trim();
    if (!text || pending) return;
    const hadMessages = messages.length > 0;
    setDraft("");
    add({ role: "user", text });
    setPending(true);
    try {
      await prepare?.();
      const data = await request<TestResponse>(`/assistants/${agentId}/test`, {
        method: "POST",
        body: { message: text, convo_id: convoId },
      });
      if (data.restarted && hadMessages)
        add({
          role: "note",
          text: "The draft changed, so the agent started this conversation afresh.",
        });
      add({ role: "assistant", text: data.answer || "No reply." });
    } catch (error) {
      const message = error instanceof Error ? error.message : "The test failed.";
      add({ role: "assistant", text: message, isError: true });
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
        {messages.map((message) =>
          message.role === "note" ? (
            <p key={message.id} className="text-center text-xs text-muted-foreground">
              {message.text}
            </p>
          ) : (
            <div
              key={message.id}
              className={cn("flex", message.role === "user" ? "justify-end" : "justify-start")}
            >
              <div
                className={cn(
                  "max-w-[85%] rounded-lg px-3 py-2",
                  message.role === "user" && "bg-primary text-primary-foreground",
                  message.role === "assistant" && "border bg-card",
                  message.isError && "border-danger-border bg-danger-bg text-danger",
                )}
              >
                <p className="whitespace-pre-wrap">{message.text}</p>
              </div>
            </div>
          ),
        )}
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
        <Button
          type="button"
          variant="outline"
          size="icon"
          aria-label="New chat"
          title="New chat"
          onClick={restart}
          disabled={pending || messages.length === 0}
        >
          <RotateCcwIcon />
        </Button>
      </form>
    </div>
  );
}
