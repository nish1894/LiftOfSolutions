import { type FormEvent, type KeyboardEvent, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeftIcon, BotIcon, PanelRightIcon, SendIcon } from "lucide-react";
import { toast } from "sonner";

import { Citations } from "@/components/app/citations.tsx";
import { EmptyState, LoadingRows, Notice } from "@/components/app/page.tsx";
import { StatusPill } from "@/components/app/status-pill.tsx";
import { Avatar } from "@/components/ui/avatar.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Dialog, DialogTitle, SheetContent } from "@/components/ui/dialog.tsx";
import { NativeSelect } from "@/components/ui/input.tsx";
import { useMembers } from "@/features/workspace/resources.ts";
import { useOrgMutation, useOrgQuery, useWorkspace } from "@/features/workspace/workspace.ts";
import { cn, sentenceCase, timeAgo, toDate } from "@/lib/utils.ts";
import { citationsOf, describeCitation } from "@/shared/citations.ts";
import { CONVERSATION_STATUS } from "@/shared/statuses.ts";
import type {
  Conversation,
  ConversationMessage,
  Customer,
  Member,
  MessagePage,
} from "@/shared/types.ts";
import { useAction } from "@/shared/useAction.ts";

import { conversationActions, replyBlockedReason } from "./inbox.ts";

interface ConversationViewProps {
  conversationId: string;
  customerName: (id?: string) => string;
  agentName: (id?: string) => string;
}

const EMPTY_PAGE: MessagePage = { items: [], next_cursor: null };

function memberName(members: Member[], uid: string | null | undefined) {
  const member = members.find((item) => item.user_id === uid);
  return member?.display_name || member?.email || "An agent";
}

function clockTime(value: unknown) {
  return toDate(value)?.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) ?? "";
}

function dayLabel(value: unknown) {
  const date = toDate(value);
  if (!date) return "";
  const day = date.toDateString();
  if (day === new Date().toDateString()) return "Today";
  if (day === new Date(Date.now() - 86_400_000).toDateString()) return "Yesterday";
  return date.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
}

export default function ConversationView({
  conversationId,
  customerName,
  agentName,
}: ConversationViewProps) {
  const { user, can } = useWorkspace();
  const { request, invalidate } = useOrgMutation();
  const [contextOpen, setContextOpen] = useState(false);

  // Poll only the conversation that is open; the queue refreshes on its own.
  const conversation = useOrgQuery<Conversation | null>(
    ["conversation", conversationId],
    `/conversations/${conversationId}`,
    null,
    { refetchInterval: 15_000 },
  );
  const messages = useOrgQuery<MessagePage>(
    ["messages", conversationId],
    `/conversations/${conversationId}/messages?limit=50`,
    EMPTY_PAGE,
    { refetchInterval: 10_000 },
  );
  const members = useMembers();

  const refresh = () =>
    Promise.all([
      invalidate("conversation", conversationId),
      invalidate("messages", conversationId),
      invalidate("conversations"),
    ]);

  const action = useAction(async (path: string, body: unknown, done: string) => {
    await request(`/conversations/${conversationId}/${path}`, { method: "POST", body });
    await refresh();
    toast.success(done);
  });

  /* The API has no single "take over" call: escalating hands the
     conversation to people, and claiming assigns it to you. */
  const takeOver = useAction(async () => {
    await request(`/conversations/${conversationId}/escalate`, {
      method: "POST",
      body: { reason: "An agent took over from the AI." },
    });
    await request(`/conversations/${conversationId}/claim`, { method: "POST", body: {} });
    await refresh();
    toast.success("You're handling this conversation. AI replies are paused.");
  });

  if (conversation.isLoading) return <LoadingRows />;
  const data = conversation.data;
  if (!data) {
    return (
      <EmptyState
        className="m-auto border-0"
        title="Conversation not found"
        description="It may have been removed, or it belongs to another organization."
      />
    );
  }

  const memberList = members.data ?? [];
  const actions = conversationActions(data, user.uid, can);
  const busy = action.busy || takeOver.busy;
  const error = action.error || takeOver.error;
  const customerLabel = customerName(data.customer_id);
  const assignee = data.assigned_user_id
    ? data.assigned_user_id === user.uid
      ? "Assigned to you"
      : `Assigned to ${memberName(memberList, data.assigned_user_id)}`
    : "Unassigned";

  const details = (
    <ContextPanel
      conversation={data}
      customerLabel={customerLabel}
      assistantLabel={agentName(data.assistant_id)}
      assignee={assignee}
      messages={messages.data?.items ?? []}
      members={memberList}
      canTransfer={actions.transfer && memberList.length > 0}
      onTransfer={(userId) =>
        action.run(
          "transfer",
          { user_id: userId },
          `Transferred to ${memberName(memberList, userId)}`,
        )
      }
      busy={busy}
    />
  );

  return (
    <div className="flex min-h-0 min-w-0 flex-1">
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex min-h-14 shrink-0 flex-wrap items-center gap-3 border-b px-4 py-2">
          <Button asChild variant="ghost" size="icon-sm" className="-ml-2 md:hidden">
            <Link to="/app/inbox" aria-label="Back to inbox">
              <ArrowLeftIcon />
            </Link>
          </Button>
          <Avatar name={customerLabel} className="size-9" />
          <div className="grid min-w-0">
            <h2 className="truncate font-semibold">{customerLabel}</h2>
            <p className="truncate text-xs text-muted-foreground">{assignee}</p>
          </div>
          <StatusPill map={CONVERSATION_STATUS} value={data.status} />
          <div className="ml-auto flex flex-wrap items-center gap-2">
            {actions.takeOver && (
              <Button size="sm" disabled={busy} onClick={() => takeOver.run()}>
                Take over
              </Button>
            )}
            {actions.claim && (
              <Button size="sm" disabled={busy} onClick={() => action.run("claim", {}, "Claimed")}>
                Claim
              </Button>
            )}
            {actions.returnToAi && (
              <Button
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() => action.run("return-to-ai", {}, "Handed back to the AI")}
              >
                Hand back to AI
              </Button>
            )}
            {actions.resolve && (
              <Button
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() => action.run("resolve", { close_conversation: false }, "Resolved")}
              >
                Resolve
              </Button>
            )}
            {actions.reopen && (
              <Button
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() => action.run("reopen", {}, "Reopened")}
              >
                Reopen
              </Button>
            )}
            <Button
              size="icon-sm"
              variant="ghost"
              className="xl:hidden"
              onClick={() => setContextOpen(true)}
              aria-label="Conversation details"
            >
              <PanelRightIcon />
            </Button>
          </div>
        </div>

        {error && (
          <Notice tone="error" className="m-3 mb-0">
            {error}
          </Notice>
        )}

        <MessageThread
          messages={messages.data?.items ?? []}
          hasOlder={Boolean(messages.data?.next_cursor)}
          customerLabel={customerLabel}
          authorLabel={(uid) => (uid === user.uid ? "You" : memberName(memberList, uid))}
        />

        <Composer
          conversationId={conversationId}
          blockedReason={replyBlockedReason(data, user.uid, can)}
          onSent={refresh}
        />
      </div>

      <aside className="hidden w-80 shrink-0 overflow-y-auto border-l xl:block">{details}</aside>
      <Dialog open={contextOpen} onOpenChange={setContextOpen}>
        <SheetContent aria-describedby={undefined}>
          <DialogTitle className="sr-only">Conversation details</DialogTitle>
          {details}
        </SheetContent>
      </Dialog>
    </div>
  );
}

interface MessageThreadProps {
  messages: ConversationMessage[];
  hasOlder: boolean;
  customerLabel: string;
  authorLabel: (uid: string | null) => string;
}

function MessageThread({ messages, hasOlder, customerLabel, authorLabel }: MessageThreadProps) {
  const listRef = useRef<HTMLOListElement | null>(null);

  // Keep the newest message in view when the thread changes.
  useEffect(() => {
    const list = listRef.current;
    if (list) list.scrollTop = list.scrollHeight;
  }, [messages.length]);

  function senderLabel(message: ConversationMessage) {
    if (message.sender_type === "CUSTOMER") return customerLabel;
    if (message.sender_type === "ASSISTANT") return "AI assistant";
    if (message.sender_type === "AGENT") return authorLabel(message.sender_user_id);
    return sentenceCase(message.sender_type);
  }

  return (
    <ol
      ref={listRef}
      className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4"
      aria-live="polite"
    >
      {hasOlder && (
        <li className="text-center text-xs text-muted-foreground">
          Showing the latest 50 messages
        </li>
      )}
      {messages.length === 0 && (
        <li className="py-10 text-center text-sm text-muted-foreground">No messages yet.</li>
      )}
      {messages.map((message, index) => {
        const type = message.sender_type;
        const isCustomer = type === "CUSTOMER";
        const day = dayLabel(message.created_at);
        const showDay = index === 0 || dayLabel(messages[index - 1]?.created_at) !== day;
        const label = senderLabel(message);
        return (
          <li key={message.id} className="grid gap-4">
            {showDay && day && (
              <span className="justify-self-center rounded-full border bg-background px-3 py-0.5 text-xs text-muted-foreground">
                {day}
              </span>
            )}
            <div className={cn("flex gap-3", !isCustomer && "flex-row-reverse")}>
              {type === "ASSISTANT" ? (
                <span className="flex size-8 shrink-0 items-center justify-center rounded-full border bg-background">
                  <BotIcon className="size-4 text-muted-foreground" aria-hidden="true" />
                </span>
              ) : (
                <Avatar name={label} />
              )}
              <div
                className={cn(
                  "flex max-w-[75%] min-w-0 flex-col gap-1",
                  !isCustomer && "items-end",
                )}
              >
                <span className="text-xs text-muted-foreground">
                  {label} · {clockTime(message.created_at)}
                </span>
                <div
                  className={cn(
                    "rounded-lg px-3 py-2 text-sm break-words",
                    isCustomer && "bg-muted",
                    type === "ASSISTANT" && "border bg-card",
                    type === "AGENT" && "bg-primary text-primary-foreground",
                  )}
                >
                  <p className="whitespace-pre-wrap">{message.content}</p>
                  {type === "ASSISTANT" && <Citations citations={citationsOf(message)} />}
                </div>
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

interface ComposerProps {
  conversationId: string;
  blockedReason: string | null;
  onSent: () => Promise<unknown>;
}

function Composer({ conversationId, blockedReason, onSent }: ComposerProps) {
  const { request } = useOrgMutation();
  const [draft, setDraft] = useState("");
  const send = useAction(async () => {
    await request(`/conversations/${conversationId}/messages`, {
      method: "POST",
      body: { content: draft.trim() },
    });
    setDraft("");
    await onSent();
  });

  if (blockedReason) {
    return (
      <p className="m-3 rounded-lg border border-dashed bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
        {blockedReason}
      </p>
    );
  }

  function submit(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    if (draft.trim() && !send.busy) void send.run();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) submit();
  }

  return (
    <form className="shrink-0 border-t p-3" onSubmit={submit}>
      <div className="rounded-xl border bg-background shadow-xs focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50">
        <label htmlFor="reply" className="sr-only">
          Reply to the customer
        </label>
        <textarea
          id="reply"
          rows={3}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Write a reply…"
          disabled={send.busy}
          className="block w-full resize-none bg-transparent px-3 py-2.5 text-sm outline-none placeholder:text-muted-foreground"
        />
        <div className="flex items-center justify-between gap-2 px-2 pb-2">
          <span className="px-1 text-xs text-muted-foreground">Ctrl/⌘ + Enter to send</span>
          <Button type="submit" size="sm" disabled={send.busy || !draft.trim()}>
            <SendIcon />
            {send.busy ? "Sending…" : "Send reply"}
          </Button>
        </div>
      </div>
      {send.error && (
        <Notice tone="error" className="mt-2">
          {send.error}
        </Notice>
      )}
    </form>
  );
}

interface ContextPanelProps {
  conversation: Conversation;
  customerLabel: string;
  assistantLabel: string;
  assignee: string;
  messages: ConversationMessage[];
  members: Member[];
  canTransfer: boolean;
  onTransfer: (userId: string) => void;
  busy: boolean;
}

function ContextPanel({
  conversation,
  customerLabel,
  assistantLabel,
  assignee,
  messages,
  members,
  canTransfer,
  onTransfer,
  busy,
}: ContextPanelProps) {
  const { can } = useWorkspace();
  const [transferTo, setTransferTo] = useState("");
  const customer = useOrgQuery<Customer | null>(
    ["customer", conversation.customer_id],
    `/customers/${conversation.customer_id}`,
    null,
    { enabled: Boolean(conversation.customer_id) && can("customers.view") },
  );

  // Every document the AI cited in this conversation, once each.
  const cited = [
    ...new Set(
      messages.flatMap((message) =>
        citationsOf(message).map((citation, index) => describeCitation(citation, index).title),
      ),
    ),
  ];
  const activeMembers = members.filter((item) => item.status === "ACTIVE");
  const heading = "text-xs font-medium tracking-wide text-muted-foreground uppercase";

  return (
    <div className="grid gap-6 p-5">
      <section className="flex items-center gap-3">
        <Avatar name={customerLabel} className="size-11" />
        <div className="grid min-w-0">
          <p className="truncate font-semibold">{customerLabel}</p>
          {customer.data?.email && (
            <p className="truncate text-sm text-muted-foreground">{customer.data.email}</p>
          )}
          {customer.data?.phone && (
            <p className="truncate text-sm text-muted-foreground">{customer.data.phone}</p>
          )}
        </div>
      </section>

      <section className="grid gap-2">
        <h3 className={heading}>Details</h3>
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-2 text-sm">
          <dt className="text-muted-foreground">Assistant</dt>
          <dd>{assistantLabel}</dd>
          <dt className="text-muted-foreground">Handled by</dt>
          <dd>{assignee}</dd>
          <dt className="text-muted-foreground">Started</dt>
          <dd>{timeAgo(conversation.created_at) || "—"}</dd>
        </dl>
      </section>

      {canTransfer && (
        <section className="grid gap-2">
          <h3 className={heading}>Transfer</h3>
          <div className="flex gap-2">
            <label htmlFor="transfer-to" className="sr-only">
              Transfer to
            </label>
            <NativeSelect
              id="transfer-to"
              className="h-8"
              value={transferTo}
              onChange={(event) => setTransferTo(event.target.value)}
            >
              <option value="">Choose a teammate</option>
              {activeMembers.map((member) => (
                <option key={member.user_id} value={member.user_id}>
                  {member.display_name || member.email}
                </option>
              ))}
            </NativeSelect>
            <Button
              size="sm"
              variant="outline"
              disabled={!transferTo || busy}
              onClick={() => onTransfer(transferTo)}
            >
              Transfer
            </Button>
          </div>
        </section>
      )}

      <section className="grid gap-2">
        <h3 className={heading}>Cited in this conversation</h3>
        {cited.length === 0 ? (
          <p className="text-sm text-muted-foreground">No sources cited yet.</p>
        ) : (
          <ul className="grid gap-1 text-sm">
            {cited.map((title) => (
              <li key={title} className="truncate rounded-md border px-2 py-1">
                {title}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
