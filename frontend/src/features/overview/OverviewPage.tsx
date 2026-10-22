import { Link } from "react-router-dom";
import {
  BotIcon,
  CheckCircle2Icon,
  ChevronRightIcon,
  CircleCheckIcon,
  CircleIcon,
  InboxIcon,
  type LucideIcon,
  MessagesSquareIcon,
  TimerIcon,
  TriangleAlertIcon,
  UserCheckIcon,
} from "lucide-react";

import { AreaChart, Sparkline } from "@/components/app/charts.tsx";
import { EmptyState, PageContainer, PageHeader, Stat } from "@/components/app/page.tsx";
import { StatusPill } from "@/components/app/status-pill.tsx";
import { Button } from "@/components/ui/button.tsx";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card.tsx";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table.tsx";
import { hasUnpublishedChanges } from "@/features/assistants/agentState.ts";
import {
  averageLatency,
  dailySeries,
  percentChange,
  sumValues,
} from "@/features/analytics/usage.ts";
import { conversationsQuery } from "@/features/inbox/inbox.ts";
import { useAgents, useCustomers, useMembers, useSources } from "@/features/workspace/resources.ts";
import { useOrgQuery, useWorkspace } from "@/features/workspace/workspace.ts";
import { formatNumber, timeAgo } from "@/lib/utils.ts";
import { CONVERSATION_STATUS } from "@/shared/statuses.ts";
import type {
  AnalyticsSummary,
  Conversation,
  JoinRequest,
  UsageBreakdownRow,
} from "@/shared/types.ts";

interface AttentionItem {
  label: string;
  count: number;
  to: string;
  icon: LucideIcon;
  show: boolean;
}

export default function OverviewPage() {
  const { user, membership, can } = useWorkspace();
  const summary = useOrgQuery<AnalyticsSummary | null>(
    ["analytics", "summary"],
    "/analytics/summary",
    null,
    { enabled: can("analytics.view") },
  );
  const usage = useOrgQuery<UsageBreakdownRow[]>(
    ["usage", "date"],
    "/analytics/usage/breakdown?group_by=date",
    [],
    { enabled: can("usage.view") },
  );
  const waitingQuery = conversationsQuery("WAITING_FOR_AGENT");
  const waiting = useOrgQuery<Conversation[]>(waitingQuery.key, waitingQuery.path, [], {
    enabled: can("conversations.view"),
  });
  const recentQuery = conversationsQuery("");
  const recent = useOrgQuery<Conversation[]>(recentQuery.key, recentQuery.path, [], {
    enabled: can("conversations.view"),
  });
  const requests = useOrgQuery<JoinRequest[]>(["joinRequests"], "/join-requests", [], {
    enabled: can("organization.members.manage"),
  });
  const agents = useAgents();
  const sources = useSources();
  const members = useMembers();
  const customers = useCustomers();

  const firstName = (user.display_name || user.email).split(/[\s@]/)[0];
  const agentList = agents.data ?? [];
  const sourceList = (sources.data ?? []).filter((source) => source.status !== "ARCHIVED");
  const customerName = (id?: string) => {
    const customer = customers.data?.find((item) => item.id === id);
    return customer?.display_name || customer?.email || "Customer";
  };
  const agentName = (id?: string) => agentList.find((agent) => agent.id === id)?.name ?? "—";

  const days30 = dailySeries(usage.data ?? [], 30);
  const days14 = days30.slice(-14);
  const repliesThisWeek = sumValues(days14.slice(7));
  const repliesLastWeek = sumValues(days14.slice(0, 7));
  const latency = averageLatency(usage.data ?? []);
  const data = summary.data;
  const resolutionRate = data?.conversations
    ? `${Math.round((data.resolved / data.conversations) * 100)}%`
    : "—";

  const attention: AttentionItem[] = [
    {
      label: "Waiting for an agent",
      count: waiting.data?.length ?? 0,
      to: "/app/inbox",
      icon: InboxIcon,
      show: can("conversations.view"),
    },
    {
      label: "Knowledge sources failed",
      count: sourceList.filter((source) => source.processing_status === "FAILED").length,
      to: "/app/knowledge",
      icon: TriangleAlertIcon,
      show: can("knowledge.view"),
    },
    {
      label: "Access requests",
      count: (requests.data ?? []).filter((item) => item.status === "PENDING").length,
      to: "/app/requests",
      icon: UserCheckIcon,
      show: can("organization.members.manage"),
    },
    {
      label: "Assistants with unpublished changes",
      count: agentList.filter(
        (agent) => agent.lifecycle_status !== "ARCHIVED" && hasUnpublishedChanges(agent),
      ).length,
      to: "/app/assistants",
      icon: BotIcon,
      show: can("agents.publish"),
    },
  ].filter((item) => item.show);
  const needsAttention = attention.filter((item) => item.count > 0);

  // Only facts the API can confirm; "installed on your site" can't be checked.
  const steps = [
    { label: "Create an assistant", done: agentList.length > 0, to: "/app/assistants" },
    { label: "Add knowledge", done: sourceList.length > 0, to: "/app/knowledge" },
    {
      label: "Publish an assistant",
      done: agentList.some((agent) => agent.lifecycle_status === "ACTIVE"),
      to: "/app/assistants",
    },
    { label: "Invite your team", done: (members.data ?? []).length > 1, to: "/app/members" },
  ];
  const setupComplete = steps.every((step) => step.done);

  return (
    <PageContainer>
      <PageHeader
        title="Overview"
        description={`Welcome back, ${firstName}. Here's what's happening in ${membership.business_name}.`}
      />

      {data && (
        <dl className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Stat
            label="Conversations"
            value={formatNumber(data.conversations)}
            icon={MessagesSquareIcon}
            hint="All time"
          />
          <Stat
            label="Resolution rate"
            value={resolutionRate}
            icon={CircleCheckIcon}
            hint={`${formatNumber(data.resolved)} resolved`}
          />
          <Stat
            label="Avg. AI response time"
            value={latency === null ? "—" : `${(latency / 1000).toFixed(1)}s`}
            icon={TimerIcon}
            hint="Across all AI replies"
          />
          <Stat
            label="AI replies, last 7 days"
            value={formatNumber(repliesThisWeek)}
            icon={BotIcon}
            trend={percentChange(repliesThisWeek, repliesLastWeek)}
            hint="vs. previous 7 days"
            chart={<Sparkline values={days14.map((point) => point.value)} />}
          />
        </dl>
      )}

      <div className="grid gap-6 lg:grid-cols-12">
        {can("usage.view") && (
          <Card className="lg:col-span-8">
            <CardHeader>
              <div className="grid gap-1">
                <CardTitle>AI replies</CardTitle>
                <CardDescription>Last 30 days</CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              <AreaChart data={days30} label="AI replies per day for the last 30 days" />
            </CardContent>
          </Card>
        )}

        <Card className={can("usage.view") ? "lg:col-span-4" : "lg:col-span-12"}>
          <CardHeader>
            <div className="grid gap-1">
              <CardTitle>Needs attention</CardTitle>
              <CardDescription>Work waiting for someone on your team</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            {needsAttention.length === 0 ? (
              <EmptyState
                icon={CheckCircle2Icon}
                title="All clear"
                description="Nothing is waiting right now."
              />
            ) : (
              <ul className="grid gap-2">
                {needsAttention.map((item) => (
                  <li key={item.label}>
                    <Link
                      to={item.to}
                      className="flex items-center gap-3 rounded-lg border px-3 py-2.5 hover:bg-muted/60"
                    >
                      <span className="flex size-8 items-center justify-center rounded-md border bg-background shadow-xs">
                        <item.icon className="size-4 text-muted-foreground" aria-hidden="true" />
                      </span>
                      <span className="flex-1 text-sm font-medium">{item.label}</span>
                      <span className="rounded-md bg-muted px-2 py-0.5 text-sm font-semibold tabular-nums">
                        {item.count}
                      </span>
                      <ChevronRightIcon
                        className="size-4 text-muted-foreground"
                        aria-hidden="true"
                      />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {!setupComplete && (can("agents.view") || can("knowledge.view")) && (
          <Card className="lg:col-span-12">
            <CardHeader>
              <div className="grid gap-1">
                <CardTitle>Get set up</CardTitle>
                <CardDescription>
                  {steps.filter((step) => step.done).length} of {steps.length} done
                </CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              <ol className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                {steps.map((step) => (
                  <li key={step.label}>
                    <Link
                      to={step.to}
                      className="flex items-center gap-2 rounded-lg border px-3 py-2.5 text-sm hover:bg-muted/60"
                    >
                      {step.done ? (
                        <CheckCircle2Icon className="size-4 text-success" aria-hidden="true" />
                      ) : (
                        <CircleIcon className="size-4 text-muted-foreground" aria-hidden="true" />
                      )}
                      <span className={step.done ? "text-muted-foreground line-through" : ""}>
                        {step.label}
                      </span>
                      <span className="sr-only">{step.done ? "(done)" : "(to do)"}</span>
                    </Link>
                  </li>
                ))}
              </ol>
            </CardContent>
          </Card>
        )}

        {can("conversations.view") && (
          <Card className="lg:col-span-12">
            <CardHeader>
              <div className="grid gap-1">
                <CardTitle>Recent conversations</CardTitle>
                <CardDescription>The latest activity across every channel</CardDescription>
              </div>
              <Button asChild variant="outline" size="sm">
                <Link to="/app/inbox">Open inbox</Link>
              </Button>
            </CardHeader>
            <CardContent className="p-0 pt-4">
              {(recent.data ?? []).length === 0 ? (
                <EmptyState
                  className="m-6 mt-0"
                  icon={MessagesSquareIcon}
                  title="No conversations yet"
                />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Customer</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Assistant</TableHead>
                      <TableHead className="text-right">Last activity</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(recent.data ?? []).slice(0, 8).map((conversation) => (
                      <TableRow key={conversation.id}>
                        <TableCell>
                          <Link
                            to={`/app/inbox/${conversation.id}`}
                            className="font-medium hover:underline"
                          >
                            {customerName(conversation.customer_id)}
                          </Link>
                        </TableCell>
                        <TableCell>
                          <StatusPill map={CONVERSATION_STATUS} value={conversation.status} />
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {agentName(conversation.assistant_id)}
                        </TableCell>
                        <TableCell className="text-right text-muted-foreground tabular-nums">
                          {timeAgo(conversation.last_message_at)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </PageContainer>
  );
}
