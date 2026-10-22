import {
  BotIcon,
  CircleCheckIcon,
  CoinsIcon,
  MessagesSquareIcon,
  SigmaIcon,
  UsersIcon,
} from "lucide-react";

import { AreaChart } from "@/components/app/charts.tsx";
import {
  EmptyState,
  LoadingRows,
  PageContainer,
  PageHeader,
  Stat,
} from "@/components/app/page.tsx";
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
import { NoAccess } from "@/features/shell/NotFound.tsx";
import { useAgents } from "@/features/workspace/resources.ts";
import { useOrgQuery, useWorkspace } from "@/features/workspace/workspace.ts";
import { formatNumber, formatUsd } from "@/lib/utils.ts";
import type { AnalyticsSummary, UsageBreakdownRow } from "@/shared/types.ts";

import { dailySeries, sumValues } from "./usage.ts";

export default function AnalyticsPage() {
  const { can } = useWorkspace();
  const usageAllowed = can("usage.view");
  const agents = useAgents();
  const summary = useOrgQuery<AnalyticsSummary | null>(
    ["analytics", "summary"],
    "/analytics/summary",
    null,
    { enabled: can("analytics.view") },
  );
  const byDate = useOrgQuery<UsageBreakdownRow[]>(
    ["usage", "date"],
    "/analytics/usage/breakdown?group_by=date",
    [],
    { enabled: usageAllowed },
  );
  const byAgent = useOrgQuery<UsageBreakdownRow[]>(
    ["usage", "agent"],
    "/analytics/usage/breakdown?group_by=agent",
    [],
    { enabled: usageAllowed },
  );
  const byModel = useOrgQuery<UsageBreakdownRow[]>(
    ["usage", "model"],
    "/analytics/usage/breakdown?group_by=model",
    [],
    { enabled: usageAllowed },
  );

  if (!can("analytics.view")) return <NoAccess what="analytics" />;
  if (summary.isLoading) return <LoadingRows />;

  const data = summary.data;
  const resolutionRate = data?.conversations
    ? Math.round((data.resolved / data.conversations) * 100)
    : 0;
  const agentName = (id: string) =>
    agents.data?.find((agent) => agent.id === id)?.name ?? "Unknown assistant";
  const days = dailySeries(byDate.data ?? [], 30);

  return (
    <PageContainer>
      <PageHeader
        title="Analytics"
        description="How conversations are going and what the AI costs to run."
      />

      {data && (
        <dl className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Stat
            label="Conversations"
            value={formatNumber(data.conversations)}
            icon={MessagesSquareIcon}
          />
          <Stat
            label="Resolved"
            value={formatNumber(data.resolved)}
            icon={CircleCheckIcon}
            hint={`${resolutionRate}% of all conversations`}
          />
          <Stat
            label="With a person now"
            value={formatNumber(data.human_active)}
            icon={UsersIcon}
          />
          <Stat label="AI replies" value={formatNumber(data.model_runs)} icon={BotIcon} />
          <Stat label="Messages" value={formatNumber(data.messages)} icon={MessagesSquareIcon} />
          <Stat
            label="Tokens"
            value={formatNumber(data.input_tokens + data.output_tokens)}
            icon={SigmaIcon}
          />
          <Stat
            label="Estimated AI cost"
            value={formatUsd(data.estimated_cost_usd)}
            icon={CoinsIcon}
          />
        </dl>
      )}

      {usageAllowed && (
        <div className="grid gap-6">
          <Card>
            <CardHeader>
              <div className="grid gap-1">
                <CardTitle>AI replies per day</CardTitle>
                <CardDescription>
                  {formatNumber(sumValues(days))} replies in the last 30 days
                </CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              {byDate.isLoading ? (
                <LoadingRows />
              ) : sumValues(days) === 0 ? (
                <EmptyState
                  icon={BotIcon}
                  title="No AI activity yet"
                  description="Replies appear here once customers start chatting."
                />
              ) : (
                <AreaChart data={days} label="AI replies per day for the last 30 days" />
              )}
            </CardContent>
          </Card>

          <div className="grid gap-6 lg:grid-cols-2">
            <UsageTable title="By assistant" rows={byAgent.data ?? []} label={agentName} />
            <UsageTable title="By model" rows={byModel.data ?? []} label={(key) => key} />
          </div>
        </div>
      )}
    </PageContainer>
  );
}

interface UsageTableProps {
  title: string;
  rows: UsageBreakdownRow[];
  label: (key: string) => string;
}

function UsageTable({ title, rows, label }: UsageTableProps) {
  const sorted = [...rows].sort((a, b) => b.model_runs - a.model_runs);
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="p-0 pt-4">
        {sorted.length === 0 ? (
          <p className="px-6 pb-6 text-sm text-muted-foreground">No usage recorded yet.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead className="text-right">Replies</TableHead>
                <TableHead className="text-right">Tokens</TableHead>
                <TableHead className="text-right">Cost</TableHead>
                <TableHead className="text-right">Avg. time</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sorted.map((row) => (
                <TableRow key={row.key}>
                  <TableCell className="font-medium">{label(row.key)}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatNumber(row.model_runs)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatNumber(row.input_tokens + row.output_tokens)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatUsd(row.estimated_cost_usd)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatNumber(Math.round(row.average_latency_ms))} ms
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
