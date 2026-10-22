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
import { cn, timeAgo } from "@/lib/utils.ts";
import { CONVERSATION_STATUS } from "@/shared/statuses.ts";
import type { Conversation } from "@/shared/types.ts";

import ConversationView from "./ConversationView.tsx";
import { conversationsQuery, INBOX_FILTERS } from "./inbox.ts";

/* Two panes, styled after the ShadcnStore chat app (MIT): a 360px queue and
   the open conversation. Phones show one pane at a time. */
export default function InboxPage() {
  const { conversationId } = useParams();
  const { user, can } = useWorkspace();
  const [status, setStatus] = useState("WAITING_FOR_AGENT");
  const [mineOnly, setMineOnly] = useState(false);
  const [search, setSearch] = useState("");

  const query = conversationsQuery(status, mineOnly ? user.uid : undefined);
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
          item.display_name || item.email || "Unnamed customer",
        ]),
      ),
    [customers.data],
  );
  const agentNames = useMemo(
    () => new Map((agents.data ?? []).map((item) => [item.id, item.name])),
    [agents.data],
  );

  if (!can("conversations.view")) return <NoAccess what="the inbox" />;

  const customerName = (id?: string) => customerNames.get(id ?? "") ?? "Customer";
  const term = search.trim().toLowerCase();
  const conversations = (list.data ?? []).filter(
    (item) => !term || customerName(item.customer_id).toLowerCase().includes(term),
  );
  const filterLabel = INBOX_FILTERS.find((item) => item.value === status)?.label ?? "All";

  return (
    <div className="flex h-[calc(100svh-7.5rem)] min-h-0 md:h-[calc(100svh-4.5rem)]">
      <section
        aria-label="Conversation queue"
        className={cn(
          "flex w-full flex-col border-r md:w-90 md:shrink-0",
          conversationId && "hidden md:flex",
        )}
      >
        <div className="flex h-14 shrink-0 items-center justify-between gap-2 border-b px-4">
          <h1 className="text-lg font-semibold">Inbox</h1>
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <Checkbox checked={mineOnly} onChange={(event) => setMineOnly(event.target.checked)} />
            Assigned to me
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
              placeholder="Search by customer"
              className="pl-9"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
          <div
            role="group"
            aria-label="Filter by state"
            className="flex gap-0.5 overflow-x-auto rounded-lg bg-muted p-0.75"
          >
            {INBOX_FILTERS.map((filter) => (
              <button
                key={filter.label}
                type="button"
                aria-pressed={status === filter.value}
                onClick={() => setStatus(filter.value)}
                className={cn(
                  "h-7 flex-1 shrink-0 rounded-md px-2 text-xs font-medium whitespace-nowrap text-muted-foreground hover:text-foreground",
                  status === filter.value &&
                    "bg-background text-foreground shadow-sm dark:bg-input/30",
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

        <div className="min-h-0 flex-1 overflow-y-auto p-2">
          {list.isLoading && <LoadingRows />}
          {!list.isLoading && conversations.length === 0 && (
            <EmptyState
              className="m-1 border-0"
              icon={InboxIcon}
              title={term ? "No customers match your search" : `Nothing in "${filterLabel}"`}
              description={
                status === "WAITING_FOR_AGENT" && !term
                  ? "Nobody is waiting for a person right now."
                  : "Try another filter."
              }
            />
          )}
          <ul className="grid gap-0.5">
            {conversations.map((conversation) => {
              const name = customerName(conversation.customer_id);
              return (
                <li key={conversation.id}>
                  <NavLink
                    to={`/app/inbox/${conversation.id}`}
                    className={({ isActive }) =>
                      cn(
                        "flex items-start gap-3 rounded-lg p-3 transition-colors hover:bg-muted/60",
                        isActive && "bg-accent hover:bg-accent",
                      )
                    }
                  >
                    <Avatar name={name} className="size-10" />
                    <span className="grid min-w-0 flex-1 gap-1">
                      <span className="flex items-baseline justify-between gap-2">
                        <span className="truncate font-medium">{name}</span>
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
                        {conversation.assigned_user_id === user.uid && (
                          <span className="text-xs text-muted-foreground">Assigned to you</span>
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

      <section className={cn("flex min-w-0 flex-1", !conversationId && "hidden md:flex")}>
        {conversationId ? (
          <ConversationView
            key={conversationId}
            conversationId={conversationId}
            customerName={customerName}
            agentName={(id) => agentNames.get(id ?? "") ?? "AI assistant"}
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
