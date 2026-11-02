import { useMemo, useState } from "react";
import { NavLink, useParams } from "react-router-dom";
import { InboxIcon, MessagesSquareIcon, SearchIcon } from "lucide-react";

import { EmptyState, LoadingRows, Notice } from "@/components/app/page.tsx";
import { StatusPill } from "@/components/app/status-pill.tsx";
import { Avatar } from "@/components/ui/avatar.tsx";
import { Checkbox, Input } from "@/components/ui/input.tsx";
import { NoAccess } from "@/features/shell/NotFound.tsx";
import { useAgents, useCustomers } from "@/features/workspace/resources.ts";
import { useOrgQuery, useWorkspace } from "@/features/workspace/workspace.ts";
import { cappedCount, cn, timeAgo } from "@/lib/utils.ts";
import { CONVERSATION_STATUS } from "@/shared/statuses.ts";
import type { Conversation } from "@/shared/types.ts";

import ConversationView from "./ConversationView.tsx";
import { CONVERSATION_LIMIT, conversationsQuery, INBOX_FILTERS } from "./inbox.ts";

/* Three panes from the design's shared inbox: the queue, the open thread and
   the contact panel (inside ConversationView). Phones show one pane at a time. */
export default function InboxPage() {
  const { conversationId } = useParams();
  const { user, can } = useWorkspace();
  const [status, setStatus] = useState("WAITING_FOR_AGENT");
  const [mineOnly, setMineOnly] = useState(false);
  const [search, setSearch] = useState("");

  const query = conversationsQuery(status, mineOnly ? user.id : undefined);
  const list = useOrgQuery<Conversation[]>(query.key, query.path, [], {
    enabled: can("conversations.view"),
    refetchInterval: 30_000,
  });
  const customers = useCustomers();
  const agents = useAgents();

  const customerNames = useMemo(
    () =>
      new Map(
        (customers.data ?? []).map((item) => [
          item.id,
          item.display_name || item.email || "Unnamed contact",
        ]),
      ),
    [customers.data],
  );
  const agentNames = useMemo(
    () => new Map((agents.data ?? []).map((item) => [item.id, item.name])),
    [agents.data],
  );

  if (!can("conversations.view")) return <NoAccess what="the inbox" />;

  const customerName = (id?: string) => customerNames.get(id ?? "") ?? "Contact";
  const term = search.trim().toLowerCase();
  const conversations = (list.data ?? []).filter(
    (item) => !term || customerName(item.customer_id).toLowerCase().includes(term),
  );
  const filterLabel = INBOX_FILTERS.find((item) => item.value === status)?.label ?? "All";

  return (
    <div className="flex min-h-0 tall:h-[calc(100dvh-7.5rem)] tall:md:h-[calc(100dvh-3.5rem)]">
      {/* The page's name for screen readers; the queue's own heading sits below it. */}
      <h1 className="sr-only">Inbox</h1>
      <section
        aria-label="Conversation queue"
        className={cn(
          "flex w-full flex-col border-r bg-card lg:w-80 lg:shrink-0 xl:w-96",
          conversationId && "hidden lg:flex",
        )}
      >
        <div className="flex h-14 shrink-0 items-center justify-between gap-2 px-4">
          <h2 className="flex items-center gap-2 text-sm font-medium">
            Conversations
            <span className="rounded-md bg-muted px-2 text-xs font-medium tabular-nums">
              {term ? conversations.length : cappedCount(conversations.length, CONVERSATION_LIMIT)}
            </span>
          </h2>
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <Checkbox
              aria-label="Only conversations assigned to me"
              checked={mineOnly}
              onChange={(event) => setMineOnly(event.target.checked)}
            />
            Mine
          </label>
        </div>

        <div className="grid shrink-0 grid-cols-1 gap-3 border-b px-4 py-3">
          <div className="relative">
            <SearchIcon
              className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <label htmlFor="inbox-search" className="sr-only">
              Search conversations by customer
            </label>
            <Input
              id="inbox-search"
              type="search"
              placeholder="Search by contact"
              className="pl-9"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
          <div
            role="group"
            aria-label="Filter by state"
            className="flex gap-0.5 overflow-x-auto rounded-lg bg-muted p-1"
          >
            {INBOX_FILTERS.map((filter) => (
              <button
                key={filter.label}
                type="button"
                aria-pressed={status === filter.value}
                onClick={() => setStatus(filter.value)}
                className={cn(
                  "h-7 flex-1 shrink-0 rounded-md px-2 text-xs font-medium whitespace-nowrap text-subtle-foreground hover:text-foreground",
                  status === filter.value && "bg-card text-primary shadow-xs",
                )}
              >
                {filter.label}
              </button>
            ))}
          </div>
        </div>

        {list.error && (
          <Notice tone="error" className="m-3">
            {list.error.message}
          </Notice>
        )}

        {(list.data ?? []).length >= CONVERSATION_LIMIT && (
          <p className="shrink-0 border-b px-4 py-2 text-xs text-muted-foreground">
            Showing the {CONVERSATION_LIMIT} most recent. Search covers only these.
          </p>
        )}
        <div className="min-h-0 flex-1 overflow-y-auto">
          {list.isLoading && <LoadingRows />}
          {!list.isLoading && conversations.length === 0 && (
            <EmptyState
              className="m-1 border-0"
              icon={InboxIcon}
              title={term ? "No contacts match your search" : `Nothing in "${filterLabel}"`}
              description={
                status === "WAITING_FOR_AGENT" && !term
                  ? "Nobody is waiting for a person right now."
                  : "Try another filter."
              }
            />
          )}
          <ul className="divide-y">
            {conversations.map((conversation) => {
              const name = customerName(conversation.customer_id);
              return (
                <li key={conversation.id}>
                  <NavLink
                    to={`/app/inbox/${conversation.id}`}
                    className={({ isActive }) =>
                      cn(
                        "flex items-start gap-3 border-l-2 border-transparent px-4 py-3.5 transition-colors hover:bg-background",
                        isActive && "border-primary bg-accent/60 hover:bg-accent/60",
                      )
                    }
                  >
                    <Avatar name={name} className="size-9" />
                    <span className="grid min-w-0 flex-1 gap-1">
                      <span className="flex items-baseline justify-between gap-2">
                        <span className="truncate text-sm font-medium">{name}</span>
                        <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                          {timeAgo(conversation.last_message_at)}
                        </span>
                      </span>
                      <span className="truncate text-sm text-muted-foreground">
                        {conversation.summary ||
                          agentNames.get(conversation.assistant_id ?? "") ||
                          "Conversation"}
                      </span>
                      <span className="flex flex-wrap items-center gap-2">
                        <StatusPill map={CONVERSATION_STATUS} value={conversation.status} />
                        {conversation.assigned_user_id === user.id && (
                          <span className="flex items-center gap-1 text-xs font-medium text-primary">
                            <span className="size-1.5 rounded-full bg-primary" aria-hidden="true" />
                            Active with you
                          </span>
                        )}
                      </span>
                    </span>
                  </NavLink>
                </li>
              );
            })}
          </ul>
        </div>
      </section>

      <section
        className={cn("flex min-w-0 flex-1 bg-background", !conversationId && "hidden lg:flex")}
      >
        {conversationId ? (
          <ConversationView
            key={conversationId}
            conversationId={conversationId}
            customerName={customerName}
            agentName={(id) => agentNames.get(id ?? "") ?? "AI agent"}
          />
        ) : (
          <EmptyState
            className="m-auto border-0"
            icon={MessagesSquareIcon}
            title="Select a conversation"
            description="Pick one from the queue to read it, take it over from the AI, or reply."
          />
        )}
      </section>
    </div>
  );
}
