import { Link } from "react-router-dom";
import { PlusIcon, WorkflowIcon, ZapIcon } from "lucide-react";

import {
  EmptyState,
  LoadError,
  LoadingRows,
  Notice,
  PageContainer,
  PageHeader,
} from "@/components/app/page.tsx";
import { StatusPill } from "@/components/app/status-pill.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Card } from "@/components/ui/card.tsx";
import { NoAccess } from "@/features/shell/NotFound.tsx";
import { useWorkflows } from "@/features/workspace/resources.ts";
import { useWorkspace } from "@/features/workspace/workspace.ts";
import { timeAgo } from "@/lib/utils.ts";
import { WORKFLOW_STATUS } from "@/shared/statuses.ts";
import type { Workflow } from "@/shared/types.ts";

import { countSteps, TRIGGERS } from "./steps.ts";

/* The project's workflows, one card each, and the way to the template browser. */
export default function WorkflowsPage() {
  const { can } = useWorkspace();
  const workflows = useWorkflows();

  if (!can("workflows.view")) return <NoAccess what="workflows" />;
  const list = workflows.data ?? [];
  const browse = can("workflows.manage") && (
    <Button asChild>
      <Link to="/app/workflows/templates">
        <PlusIcon />
        New workflow
      </Link>
    </Button>
  );

  return (
    <PageContainer>
      <PageHeader
        title="Workflows"
        description="Automate what happens around a conversation: greet contacts, route them to the right teammate, or hand them to an AI agent."
        actions={!workflows.isError && list.length > 0 && browse}
      />
      <Notice className="mb-6">
        Workflows don't run yet. They start once a channel brings in real conversations; until then
        you can build, save and turn them on.
      </Notice>
      {workflows.isLoading ? (
        <LoadingRows />
      ) : workflows.isError ? (
        <LoadError what="workflows" query={workflows} />
      ) : list.length === 0 ? (
        <EmptyState
          icon={WorkflowIcon}
          title="No workflows yet"
          description="Start from a template, or build one from scratch."
          action={browse}
        />
      ) : (
        <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {list.map((workflow) => (
            <li key={workflow.id}>
              <WorkflowCard workflow={workflow} />
            </li>
          ))}
        </ul>
      )}
    </PageContainer>
  );
}

function WorkflowCard({ workflow }: { workflow: Workflow }) {
  const steps = countSteps(workflow.steps);
  return (
    <Card className="card-hover h-full gap-4 p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="truncate font-semibold">{workflow.name}</h2>
          <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
            <ZapIcon className="size-3.5 shrink-0" aria-hidden="true" />
            <span className="truncate">
              {TRIGGERS[workflow.trigger].label} · {steps} step{steps === 1 ? "" : "s"}
            </span>
          </p>
        </div>
        <StatusPill map={WORKFLOW_STATUS} value={workflow.status} />
      </div>
      {workflow.description && (
        <p className="line-clamp-2 text-sm text-subtle-foreground">{workflow.description}</p>
      )}
      <p className="text-xs text-muted-foreground">
        {workflow.incomplete && workflow.status === "off" ? "Unfinished · " : ""}
        Updated {timeAgo(workflow.updated_at)}
      </p>
      <div className="mt-auto flex gap-2 border-t pt-4">
        <Button asChild variant="outline" className="flex-1">
          <Link to={`/app/workflows/${workflow.id}`}>Open</Link>
        </Button>
      </div>
    </Card>
  );
}
