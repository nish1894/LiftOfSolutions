import {
  type FormEvent,
  type KeyboardEvent,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { Link } from "react-router-dom";
import {
  ArrowLeftIcon,
  BotIcon,
  CircleCheckIcon,
  PanelRightIcon,
  SendIcon,
  ShieldAlertIcon,
} from "lucide-react";
import { toast } from "sonner";

import { Citations } from "@/components/app/citations.tsx";
import { EmptyState, LoadError, LoadingRows, Notice } from "@/components/app/page.tsx";
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
  return member?.display_name || member?.email || "A teammate";
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
      body: { reason: "A teammate took over from the AI." },
    });
    await request(`/conversations/${conversationId}/claim`, { method: "POST", body: {} });
    await refresh();
    toast.success("You're handling this conversation. AI replies are paused.");
  });

  if (conversation.isLoading) return <LoadingRows />;
  if (conversation.isError)
    return <LoadError className="m-auto" what="this conversation" query={conversation} />;
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
  const actions = conversationActions(data, user.id, can);
  const busy = action.busy || takeOver.busy;
  const error = action.error || takeOver.error;
  const customerLabel = customerName(data.customer_id);
  const assignee = data.assigned_user_id
    ? data.assigned_user_id === user.id
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
        <div className="flex min-h-14 shrink-0 flex-wrap items-center gap-3 border-b bg-card px-4 py-2">
          <Button asChild variant="ghost" size="icon-sm" className="-ml-2 lg:hidden">
            <Link to="/app/inbox" aria-label="Back to inbox">
              <ArrowLeftIcon />
            </Link>
          </Button>
          <div className="grid min-w-0">
            <h2 className="truncate font-semibold">{customerLabel}</h2>
            <p className="flex items-center gap-1.5 truncate text-xs text-muted-foreground">
              <span className="size-1.5 rounded-full bg-primary" aria-hidden="true" />
              {assignee}
            </p>
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
                className="gap-1.5"
                disabled={busy}
                onClick={() => action.run("return-to-ai", {}, "Handed back to the AI")}
              >
                <BotIcon />
                Return to AI
              </Button>
            )}
            {actions.resolve && (
              <Button
                size="sm"
                disabled={busy}
                onClick={() => action.run("resolve", { close_conversation: false }, "Resolved")}
              >
                <CircleCheckIcon />
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
          key={conversationId}
          conversationId={conversationId}
          messages={messages.data?.items ?? []}
          nextCursor={messages.data?.next_cursor ?? null}
          customerLabel={customerLabel}
          authorLabel={(uid) => (uid === user.id ? "You" : memberName(memberList, uid))}
        />

        <Composer
          conversationId={conversationId}
          blockedReason={replyBlockedReason(data, user.id, can)}
          onSent={refresh}
        />
      </div>

      <aside className="hidden w-80 shrink-0 overflow-y-auto border-l bg-card xl:block">
        {details}
      </aside>
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
  conversationId: string;
  messages: ConversationMessage[];
  nextCursor: string | null;
  customerLabel: string;
  authorLabel: (uid: string | null) => string;
}

/* Older messages, oldest first, merged with the latest page without repeats. The latest page
   keeps polling, so its oldest messages can move out of it; `earlier` keeps a copy of it as it
   was when older pages were loaded, so no message falls between the two. */
const mergeMessages = (earlier: ConversationMessage[], latest: ConversationMessage[]) => {
  const seen = new Set<string>();
  return [...earlier, ...latest].filter((message) => !seen.has(message.id) && seen.add(message.id));
};

function MessageThread({
  conversationId,
  messages,
  nextCursor,
  customerLabel,
  authorLabel,
}: MessageThreadProps) {
  const { request } = useOrgMutation();
  const listRef = useRef<HTMLOListElement | null>(null);
  const nearBottom = useRef(true);
  const fromBottom = useRef<number | null>(null);
  const [earlier, setEarlier] = useState<{
    items: ConversationMessage[];
    cursor: string | null;
  } | null>(null);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const cursor = earlier ? earlier.cursor : nextCursor;
  const shown = mergeMessages(earlier?.items ?? [], messages);
  const newestId = messages[messages.length - 1]?.id;

  // Follow new messages only while the reader is at the bottom; reading back isn't interrupted.
  useEffect(() => {
    const list = listRef.current;
    if (list && nearBottom.current) list.scrollTop = list.scrollHeight;
  }, [newestId]);

  // After older messages are added above, keep the same messages in view.
  useLayoutEffect(() => {
    const list = listRef.current;
    if (list && fromBottom.current !== null) {
      list.scrollTop = list.scrollHeight - fromBottom.current;
      fromBottom.current = null;
    }
  }, [earlier]);

  async function loadOlder() {
    if (!cursor) return;
    setLoadingOlder(true);
    try {
      const page = await request<MessagePage>(
        `/conversations/${conversationId}/messages?limit=50&before=${cursor}`,
      );
      const list = listRef.current;
      if (list) fromBottom.current = list.scrollHeight - list.scrollTop;
      setEarlier({
        items: [...page.items, ...(earlier?.items ?? messages)],
        cursor: page.next_cursor,
      });
    } catch {
      toast.error("Older messages couldn't be loaded.");
    } finally {
      setLoadingOlder(false);
    }
  }

  function senderLabel(message: ConversationMessage) {
    if (message.sender_type === "CUSTOMER") return customerLabel;
    if (message.sender_type === "ASSISTANT") return "AI agent";
    if (message.sender_type === "AGENT") return authorLabel(message.sender_user_id);
    return sentenceCase(message.sender_type);
  }

  return (
    <ol
      ref={listRef}
      className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 py-5 lg:px-6"
      aria-live="polite"
      onScroll={(event) => {
        const list = event.currentTarget;
        nearBottom.current = list.scrollHeight - list.scrollTop - list.clientHeight < 80;
      }}
    >
      {cursor && (
        <li className="text-center">
          <Button variant="outline" size="sm" onClick={loadOlder} disabled={loadingOlder}>
            {loadingOlder ? "Loading…" : "Load older messages"}
          </Button>
        </li>
      )}
      {shown.length === 0 && (
        <li className="py-10 text-center text-sm text-muted-foreground">No messages yet.</li>
      )}
      {shown.map((message, index) => {
        const type = message.sender_type;
        const isCustomer = type === "CUSTOMER";
        const day = dayLabel(message.created_at);
        const showDay = index === 0 || dayLabel(shown[index - 1]?.created_at) !== day;
        const label = senderLabel(message);
        const dayChip = showDay && day && (
          <span className="justify-self-center rounded-full border bg-card px-3 py-0.5 text-xs text-muted-foreground">
            {day}
          </span>
        );
        // System events (a hand-off, a transfer) sit in the middle as an amber note.
        if (type === "SYSTEM") {
          return (
            <li key={message.id} className="grid gap-4">
              {dayChip}
              <p className="mx-auto flex max-w-lg items-center gap-2 rounded-xl border border-warning-border bg-warning-bg px-4 py-2.5 text-sm text-warning">
                <ShieldAlertIcon className="size-4 shrink-0" aria-hidden="true" />
                {message.content}
              </p>
            </li>
          );
        }
        return (
          <li key={message.id} className="grid gap-4">
            {dayChip}
            <div className={cn("flex gap-3", !isCustomer && "flex-row-reverse")}>
              {type === "ASSISTANT" ? (
                <span className="flex size-8 shrink-0 items-center justify-center rounded-full border border-accent-border bg-accent">
                  <BotIcon className="size-4 text-accent-foreground" aria-hidden="true" />
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
                <span className="flex items-center gap-2 text-xs text-muted-foreground">
                  {type === "ASSISTANT" ? (
                    <span className="rounded-full border border-accent-border bg-accent px-2 font-medium text-accent-foreground">
                      {label}
                    </span>
                  ) : (
                    <span className="font-semibold text-foreground">{label}</span>
                  )}
                  {clockTime(message.created_at)}
                </span>
                <div
                  className={cn(
                    "rounded-2xl border px-4 py-3 text-sm leading-relaxed break-words shadow-xs",
                    isCustomer && "rounded-tl-sm bg-card",
                    type === "ASSISTANT" && "rounded-tr-sm border-accent-border bg-accent/60",
                    type === "AGENT" &&
                      "rounded-tr-sm border-transparent bg-foreground text-background",
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
      <p className="m-4 rounded-xl border border-dashed bg-card px-4 py-3 text-sm text-muted-foreground">
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
    <form className="shrink-0 border-t bg-card p-4" onSubmit={submit}>
      <div className="rounded-xl border border-input bg-card shadow-xs transition-shadow focus-within:border-primary focus-within:shadow-(--focus-glow)">
        <label htmlFor="reply" className="sr-only">
          Reply to the customer
        </label>
        <textarea
          id="reply"
          rows={3}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type a reply…"
          disabled={send.busy}
          className="block w-full resize-none bg-transparent px-3 py-2.5 text-sm outline-none placeholder:text-muted-foreground"
        />
        <div className="flex items-center justify-between gap-2 border-t px-2 py-2">
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
  const heading = "label-caps";

  return (
    <div className="grid gap-6 p-5">
      <section className="flex items-center gap-3">
        <Avatar
          name={customerLabel}
          shape="square"
          className="size-12 rounded-xl bg-accent text-accent-foreground"
        />
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
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-2 rounded-xl border bg-background p-3 text-sm">
          <dt className="text-muted-foreground">Agent</dt>
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
              <li
                key={title}
                className="truncate rounded-lg border border-citation-border bg-citation-bg px-2.5 py-1.5 font-mono text-xs text-citation"
              >
                {title}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
