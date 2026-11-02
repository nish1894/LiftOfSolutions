import { Link } from "react-router-dom";
import {
  ArrowRightIcon,
  BellRingIcon,
  BotIcon,
  CheckCircle2Icon,
  CircleCheckIcon,
  CircleIcon,
  ClockIcon,
  MessagesSquareIcon,
  ShieldCheckIcon,
  TimerIcon,
} from "lucide-react";

import { BarChart, Sparkline } from "@/components/app/charts.tsx";
import { EmptyState, LoadError, PageContainer, PageHeader, Stat } from "@/components/app/page.tsx";
import { Pill, StatusPill } from "@/components/app/status-pill.tsx";
import { Button } from "@/components/ui/button.tsx";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card.tsx";
import {
  averageLatency,
  dailySeries,
  percentChange,
  sumValues,
} from "@/features/analytics/usage.ts";
import { CONVERSATION_LIMIT, conversationsQuery } from "@/features/inbox/inbox.ts";
import {
  useAgents,
  useMembers,
  useSources,
  useToolApprovals,
} from "@/features/workspace/resources.ts";
import { useOrgQuery, useWorkspace } from "@/features/workspace/workspace.ts";
import { cappedCount, formatNumber, timeUntil } from "@/lib/utils.ts";
import { AGENT_STATUS } from "@/shared/statuses.ts";
import type { AnalyticsSummary, Conversation, UsageBreakdownRow } from "@/shared/types.ts";

/* Overview from the design: an amber banner when people are waiting, four
   metric cards, a volume chart beside the agent fleet, then approvals and
   setup. Only numbers the API returns are shown; the design's CSAT, latency
   per agent and token runway have no source yet, so they are left out. */
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
  const approvals = useToolApprovals();
  const agents = useAgents();
  const sources = useSources();
  const members = useMembers();

  const firstName = (user.display_name || user.email).split(/[\s@]/)[0];
  const agentList = agents.data ?? [];
  const sourceList = sources.data ?? [];
  const waitingCount = waiting.data?.length ?? 0;
  const approvalList = approvals.data ?? [];

  const days14 = dailySeries(usage.data ?? [], 14);
  const repliesThisWeek = sumValues(days14.slice(7));
  const repliesLastWeek = sumValues(days14.slice(0, 7));
  const latency = averageLatency(usage.data ?? []);
  const data = summary.data;
  const resolutionRate = data?.conversations
    ? `${Math.round((data.resolved / data.conversations) * 100)}%`
    : "—";

  // Only facts the API can confirm; "installed on your site" can't be checked.
  // Each person sees only the steps they can do; with none, the card is hidden.
  const steps = [
    {
      label: "Create an agent",
      done: agentList.length > 0,
      to: "/app/assistants",
      allowed: can("agents.create"),
      available: !agents.isError,
    },
    {
      label: "Add knowledge",
      done: sourceList.length > 0,
      to: "/app/assistants",
      allowed: can("knowledge.manage"),
      available: !sources.isError,
    },
    {
      label: "Publish an agent",
      done: agentList.some((agent) => agent.status === "live"),
      to: "/app/assistants",
      allowed: can("agents.publish"),
      available: !agents.isError,
    },
    {
      label: "Invite your team",
      done: (members.data ?? []).length > 1,
      to: "/app/members",
      allowed: can("organization.members.manage"),
      available: true,
    },
  ].filter((step) => step.allowed);
  // A step whose feature isn't offered yet is shown but can't be counted as work to do.
  const openSteps = steps.filter((step) => step.available);
  const stepsDone = openSteps.filter((step) => step.done).length;

  return (
    <PageContainer>
      <PageHeader
        eyebrow={membership.business_name}
        title="Overview"
        description={`Welcome back, ${firstName}.`}
      />

      {waitingCount > 0 && (
        <div className="mb-6 flex flex-wrap items-center gap-4 rounded-xl border border-warning-border bg-warning-bg px-5 py-4">
          <span className="flex size-9 items-center justify-center rounded-lg bg-warning-border text-warning">
            <BellRingIcon className="size-4" aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-foreground">
              {cappedCount(waitingCount, CONVERSATION_LIMIT)}{" "}
              {waitingCount === 1 ? "customer needs" : "customers need"} a person
            </p>
            <p className="text-sm text-warning">The AI handed these conversations to your team.</p>
          </div>
          <Button asChild variant="escalation">
            <Link to="/app/inbox">
              Review queue
              <ArrowRightIcon aria-hidden="true" />
            </Link>
          </Button>
        </div>
      )}

      {summary.isError && <LoadError className="mb-6" what="conversation totals" query={summary} />}
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
            label="Avg. AI response"
            value={latency === null ? "—" : `${(latency / 1000).toFixed(1)}s`}
            icon={TimerIcon}
            hint="Across all AI replies"
          />
          <Stat
            label="AI replies, 7 days"
            value={formatNumber(repliesThisWeek)}
            trend={percentChange(repliesThisWeek, repliesLastWeek)}
            hint="vs. previous 7 days"
            chart={<Sparkline values={days14.map((point) => point.value)} />}
          />
        </dl>
      )}

      <div className="grid gap-6 lg:grid-cols-12">
        {can("usage.view") && (
          <Card className="lg:col-span-7">
            <CardHeader>
              <div className="grid gap-0.5">
                <CardTitle>AI reply volume</CardTitle>
                <CardDescription>Replies per day, last 14 days</CardDescription>
              </div>
              {!usage.isError && (
                <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <span className="size-2 rounded-full bg-chart-1" aria-hidden="true" />
                  AI replies
                </span>
              )}
            </CardHeader>
            <CardContent>
              {usage.isError ? (
                <LoadError what="reply volume" query={usage} />
              ) : sumValues(days14) === 0 ? (
                <EmptyState
                  icon={MessagesSquareIcon}
                  title="No AI replies yet"
                  description="Replies show up here once an agent answers customers."
                  className="border-0 py-10"
                />
              ) : (
                <BarChart data={days14} label="AI replies per day for the last 14 days" />
              )}
            </CardContent>
          </Card>
        )}

        {can("agents.view") && (
          <Card className={can("usage.view") ? "lg:col-span-5" : "lg:col-span-12"}>
            <CardHeader>
              <div className="grid gap-0.5">
                <CardTitle>Agent fleet</CardTitle>
                <CardDescription>Your agents and their state</CardDescription>
              </div>
              {!agents.isError && <Pill tone="neutral">{agentList.length} total</Pill>}
            </CardHeader>
            <CardContent className="py-3">
              {agents.isError ? (
                <LoadError what="agents" query={agents} />
              ) : agentList.length === 0 ? (
                <EmptyState icon={BotIcon} title="No agents yet" className="border-0 py-8" />
              ) : (
                <ul className="divide-y">
                  {agentList.slice(0, 5).map((agent) => (
                    <li key={agent.id} className="flex items-center gap-3 py-3">
                      <span
                        className={
                          agent.status === "live"
                            ? "size-2 rounded-full bg-success-solid"
                            : "size-2 rounded-full bg-warning-solid"
                        }
                        aria-hidden="true"
                      />
                      <div className="min-w-0 flex-1">
                        <Link
                          to={`/app/assistants/${agent.id}`}
                          className="block truncate text-sm font-medium hover:text-primary"
                        >
                          {agent.name}
                        </Link>
                        <p className="truncate text-xs text-muted-foreground">
                          {agent.draft.model}
                          {agent.unpublished_changes && " · Unpublished changes"}
                        </p>
                      </div>
                      <StatusPill map={AGENT_STATUS} value={agent.status} />
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
            <CardFooter className="justify-end">
              <Link
                to="/app/assistants"
                className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
              >
                All agents
                <ArrowRightIcon className="size-4" aria-hidden="true" />
              </Link>
            </CardFooter>
          </Card>
        )}

        {can("tools.view") && (
          <Card className="lg:col-span-7">
            <CardHeader>
              <div className="grid gap-0.5">
                <CardTitle>Pending approvals</CardTitle>
                <CardDescription>Tool calls an agent wants to make</CardDescription>
              </div>
              {approvalList.length > 0 && (
                <Pill tone="warning">{approvalList.length} required</Pill>
              )}
            </CardHeader>
            <CardContent>
              {approvals.isError ? (
                <LoadError what="approvals" query={approvals} />
              ) : approvalList.length === 0 ? (
                <EmptyState
                  icon={ShieldCheckIcon}
                  title="Nothing to approve"
                  description="Agents haven't asked to run any tools."
                  className="border-0 py-8"
                />
              ) : (
                <ul className="grid gap-3">
                  {approvalList.slice(0, 3).map((run) => (
                    <li
                      key={run.id}
                      className="flex flex-wrap items-center gap-3 rounded-xl border px-4 py-3"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="flex items-center gap-2 text-sm font-semibold">
                          {run.idempotent === false && <Pill tone="danger">Not retry-safe</Pill>}
                          <span className="truncate font-mono">{run.tool_name}</span>
                        </p>
                        {run.approval_expires_at && (
                          <p className="mt-1 flex items-center gap-1 text-xs text-warning">
                            <ClockIcon className="size-3.5" aria-hidden="true" />
                            {timeUntil(run.approval_expires_at) === "expired"
                              ? "Expired"
                              : `Expires ${timeUntil(run.approval_expires_at)}`}
                          </p>
                        )}
                      </div>
                      <Button asChild variant="outline" size="sm">
                        <Link to={`/app/requests?run=${run.id}`}>Review</Link>
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
            {approvalList.length > 0 && (
              <CardFooter>
                <Link
                  to="/app/requests"
                  className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
                >
                  View all approvals ({approvalList.length})
                  <ArrowRightIcon className="size-4" aria-hidden="true" />
                </Link>
              </CardFooter>
            )}
          </Card>
        )}

        {steps.length > 0 && (
          <Card className={can("tools.view") ? "lg:col-span-5" : "lg:col-span-12"}>
            <CardHeader>
              <div className="grid gap-0.5">
                <CardTitle>Workspace setup</CardTitle>
                <CardDescription>Getting {membership.business_name} ready</CardDescription>
              </div>
              {openSteps.length > 0 && (
                <Pill tone={stepsDone === openSteps.length ? "success" : "violet"}>
                  {stepsDone} of {openSteps.length} done
                </Pill>
              )}
            </CardHeader>
            <CardContent>
              <ol className="grid gap-1">
                {steps.map((step) =>
                  !step.available ? (
                    <li
                      key={step.label}
                      className="flex items-center gap-3 rounded-lg px-2 py-2 text-sm text-muted-foreground"
                    >
                      <CircleIcon className="size-4" aria-hidden="true" />
                      <span className="flex-1">{step.label}</span>
                      <span className="text-xs">Not available yet</span>
                    </li>
                  ) : (
                    <li key={step.label}>
                      <Link
                        to={step.to}
                        className="flex items-center gap-3 rounded-lg px-2 py-2 text-sm hover:bg-muted"
                      >
                        {step.done ? (
                          <CheckCircle2Icon
                            className="size-4 text-success-solid"
                            aria-hidden="true"
                          />
                        ) : (
                          <CircleIcon className="size-4 text-primary" aria-hidden="true" />
                        )}
                        <span
                          className={
                            step.done ? "flex-1 text-subtle-foreground" : "flex-1 font-medium"
                          }
                        >
                          {step.label}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {step.done ? "Done" : "To do"}
                        </span>
                      </Link>
                    </li>
                  ),
                )}
              </ol>
            </CardContent>
          </Card>
        )}
      </div>
    </PageContainer>
  );
}
