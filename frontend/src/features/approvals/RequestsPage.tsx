import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { CheckIcon, ClockIcon, ShieldCheckIcon, XIcon } from "lucide-react";
import { toast } from "sonner";

import {
  EmptyState,
  LoadError,
  LoadingRows,
  Notice,
  PageContainer,
  PageHeader,
} from "@/components/app/page.tsx";
import { Pill } from "@/components/app/status-pill.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Card, CardFooter } from "@/components/ui/card.tsx";
import { NoAccess } from "@/features/shell/NotFound.tsx";
import {
  TOOL_RUN_LIMIT,
  type ToolApproval,
  useAgents,
  useToolApprovals,
} from "@/features/workspace/resources.ts";
import { useOrgMutation, useWorkspace } from "@/features/workspace/workspace.ts";
import { useNow } from "@/hooks/use-now.ts";
import { cappedCount, cn, timeAgo, timeUntil } from "@/lib/utils.ts";
import { useAction } from "@/shared/useAction.ts";

type Filter = "all" | "unsafe";

/* Approval queue from the design: filter pills, the waiting calls on the left
   and the selected call's details on the right. The design's risk scores and
   reasoning trace have no source in the API, so the only risk signal shown is
   whether the call is safe to retry. */
export default function RequestsPage() {
  const now = useNow();
  const { can } = useWorkspace();
  const runs = useToolApprovals();
  const agents = useAgents();
  const [params, setParams] = useSearchParams();
  const [filter, setFilter] = useState<Filter>("all");
  if (!can("tools.view")) return <NoAccess what="approvals" />;

  const all = runs.data ?? [];
  const unsafeCount = all.filter((run) => run.idempotent === false).length;
  const shown = filter === "unsafe" ? all.filter((run) => run.idempotent === false) : all;
  const selected = shown.find((run) => run.id === params.get("run")) ?? shown[0];
  const agentName = (id?: string) =>
    agents.data?.find((agent) => agent.id === id)?.name ?? "An agent";

  const pillClass = (active: boolean) =>
    cn(
      "inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-sm font-medium transition-colors",
      active
        ? "border-primary bg-primary text-primary-foreground"
        : "bg-card text-subtle-foreground hover:border-input hover:text-foreground",
    );

  return (
    <PageContainer>
      <PageHeader
        title="Approvals"
        description="Tool calls agents want to make, waiting for a person before they run."
        actions={
          all.length > 0 && (
            <Pill tone="danger">{cappedCount(all.length, TOOL_RUN_LIMIT)} pending</Pill>
          )
        }
      />

      {runs.isLoading ? (
        <LoadingRows />
      ) : runs.isError ? (
        <LoadError what="approvals" query={runs} />
      ) : all.length === 0 ? (
        <EmptyState
          icon={ShieldCheckIcon}
          title="No tool calls waiting for approval"
          description="When an agent needs permission to act, the request shows up here."
        />
      ) : (
        <>
          <div className="mb-4 flex flex-wrap gap-2" role="group" aria-label="Filter approvals">
            <button
              type="button"
              aria-pressed={filter === "all"}
              className={pillClass(filter === "all")}
              onClick={() => setFilter("all")}
            >
              All ({all.length})
            </button>
            <button
              type="button"
              aria-pressed={filter === "unsafe"}
              className={pillClass(filter === "unsafe")}
              onClick={() => setFilter("unsafe")}
            >
              <span className="size-1.5 rounded-full bg-danger-solid" aria-hidden="true" />
              Not retry-safe ({unsafeCount})
            </button>
          </div>

          <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
            <ul className="grid content-start gap-3">
              {shown.map((run) => (
                <li key={run.id}>
                  <button
                    type="button"
                    onClick={() => setParams({ run: run.id })}
                    aria-current={run.id === selected?.id ? "true" : undefined}
                    className={cn(
                      "grid w-full gap-2 rounded-xl border bg-card p-4 text-left shadow-xs transition-colors hover:border-input",
                      run.id === selected?.id && "border-primary ring-1 ring-primary",
                    )}
                  >
                    <span className="flex items-center justify-between gap-2">
                      {run.idempotent === false ? (
                        <Pill tone="danger">Not retry-safe</Pill>
                      ) : (
                        <Pill tone="neutral">Retry-safe</Pill>
                      )}
                      {run.approval_expires_at && (
                        <span className="flex items-center gap-1 font-mono text-xs text-warning">
                          <ClockIcon className="size-3.5" aria-hidden="true" />
                          {timeUntil(run.approval_expires_at, now)}
                        </span>
                      )}
                    </span>
                    <span className="truncate font-mono text-sm font-semibold">
                      {run.tool_name}
                    </span>
                    <span className="text-sm text-muted-foreground">
                      {agentName(run.agent_id)} · {timeAgo(run.created_at)}
                    </span>
                  </button>
                </li>
              ))}
              {shown.length === 0 && (
                <li className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
                  No calls match this filter.
                </li>
              )}
            </ul>

            {selected && (
              <ApprovalDetail
                key={selected.id}
                run={selected}
                agentLabel={agentName(selected.agent_id)}
                canApprove={can("tools.approve")}
                now={now}
              />
            )}
          </div>
        </>
      )}
    </PageContainer>
  );
}

interface ApprovalDetailProps {
  run: ToolApproval;
  agentLabel: string;
  canApprove: boolean;
  now: number;
}

function ApprovalDetail({ run, agentLabel, canApprove, now }: ApprovalDetailProps) {
  const { request, invalidate } = useOrgMutation();
  const expired = timeUntil(run.approval_expires_at, now) === "expired";
  const decide = useAction(async (decision: "approve" | "reject") => {
    try {
      await request(`/tool-runs/${run.id}/${decision}`, { method: "POST" });
    } finally {
      // Refused because someone else decided or it expired: show the queue as it is now.
      await invalidate("toolApprovals");
    }
    toast.success(decision === "approve" ? "Tool call approved" : "Tool call rejected");
  });

  return (
    <Card className="self-start lg:sticky lg:top-20">
      <div className="grid gap-1 border-b px-6 py-5">
        <span className="w-fit rounded-md bg-accent px-2 py-0.5 font-mono text-sm font-semibold text-accent-foreground">
          {run.tool_name}
        </span>
        <p className="text-sm text-muted-foreground">
          Requested by <span className="font-medium text-foreground">{agentLabel}</span>{" "}
          {timeAgo(run.created_at)}
          {run.conversation_id && (
            <>
              {" · "}
              <Link
                to={`/app/inbox/${run.conversation_id}`}
                className="text-primary hover:underline"
              >
                Open conversation
              </Link>
            </>
          )}
        </p>
      </div>

      <div className="grid gap-4 px-6 py-5">
        {run.idempotent === false && (
          <Notice tone="warning">
            This call is not safe to retry: approving it twice would do the action twice.
          </Notice>
        )}
        <section className="overflow-hidden rounded-xl border">
          <h3 className="border-b bg-muted px-4 py-2 text-sm font-semibold">Arguments</h3>
          <pre className="overflow-x-auto bg-card p-4 font-mono text-xs leading-relaxed">
            {JSON.stringify(run.arguments, null, 2)}
          </pre>
        </section>
        {run.approval_expires_at && (
          <p className="text-sm text-muted-foreground">
            Expires {new Date(run.approval_expires_at).toLocaleString()}
          </p>
        )}
        {expired && (
          <Notice tone="warning">
            This request has expired, so it can't be approved or rejected.
          </Notice>
        )}
        {decide.error && <Notice tone="error">{decide.error}</Notice>}
      </div>

      {canApprove && (
        <CardFooter className="justify-between">
          <Button
            variant="destructive-outline"
            disabled={decide.busy || expired}
            onClick={() => void decide.run("reject")}
          >
            <XIcon />
            Reject
          </Button>
          <Button disabled={decide.busy || expired} onClick={() => void decide.run("approve")}>
            <CheckIcon />
            Approve and run
          </Button>
        </CardFooter>
      )}
    </Card>
  );
}
