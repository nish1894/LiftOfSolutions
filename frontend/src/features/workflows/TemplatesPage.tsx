import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeftIcon, PlusIcon, SearchIcon, ZapIcon } from "lucide-react";

import { EmptyState, Notice, PageContainer, PageHeader } from "@/components/app/page.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Card } from "@/components/ui/card.tsx";
import { Input } from "@/components/ui/input.tsx";
import { NoAccess } from "@/features/shell/NotFound.tsx";
import { useWorkspace } from "@/features/workspace/workspace.ts";
import { cn } from "@/lib/utils.ts";

import { STEP_TYPES, TRIGGERS } from "./steps.ts";
import {
  CATEGORIES,
  type CategoryId,
  WORKFLOW_TEMPLATES,
  type WorkflowTemplate,
} from "./templates.ts";
import { useCreateWorkflow } from "./useCreateWorkflow.ts";

const matches = (template: WorkflowTemplate, search: string) =>
  `${template.title} ${template.summary}`.toLowerCase().includes(search.trim().toLowerCase());

/* Browse workflow templates: categories and search on the left, the templates on the right. */
export default function TemplatesPage() {
  const { can } = useWorkspace();
  const [category, setCategory] = useState<CategoryId>("all");
  const [search, setSearch] = useState("");
  const create = useCreateWorkflow();

  if (!can("workflows.view")) return <NoAccess what="workflows" />;
  const canCreate = can("workflows.manage");
  const shown = WORKFLOW_TEMPLATES.filter(
    (template) =>
      (category === "all" || template.category === category) && matches(template, search),
  );
  const count = (id: CategoryId) =>
    WORKFLOW_TEMPLATES.filter((template) => id === "all" || template.category === id).length;

  return (
    <PageContainer>
      <Button asChild variant="link" className="mb-4 text-muted-foreground">
        <Link to="/app/workflows">
          <ArrowLeftIcon />
          Workflows
        </Link>
      </Button>
      <PageHeader
        title="Workflow templates"
        description="Start from a template and change anything you like, or start from scratch."
      />
      {create.error && (
        <Notice tone="error" className="mb-6">
          {create.error}
        </Notice>
      )}
      <div className="grid gap-6 lg:grid-cols-[14rem_1fr] lg:gap-8">
        <nav aria-label="Template categories" className="grid content-start gap-3">
          <div className="relative">
            <SearchIcon
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              type="search"
              aria-label="Search templates"
              placeholder="Search templates"
              className="pl-9"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
          <ul className="-mx-4 flex gap-1 overflow-x-auto px-4 lg:mx-0 lg:flex-col lg:px-0">
            {CATEGORIES.map((item) => (
              <li key={item.id} className="shrink-0">
                <button
                  type="button"
                  aria-current={category === item.id ? "true" : undefined}
                  onClick={() => setCategory(item.id)}
                  className={cn(
                    "flex w-full items-center justify-between gap-3 rounded-md px-3 py-2 text-left text-sm transition-colors outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring",
                    category === item.id && "bg-accent font-medium text-accent-foreground",
                  )}
                >
                  {item.label}
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {count(item.id)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </nav>

        <div className="grid content-start gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {canCreate && category === "all" && !search.trim() && (
            <Card className="h-full gap-3 border-dashed p-5">
              <h2 className="font-semibold">Start from scratch</h2>
              <p className="text-sm text-muted-foreground">
                Pick a trigger and add your own steps.
              </p>
              <div className="mt-auto pt-2">
                <Button variant="outline" onClick={() => create.run()} disabled={create.busy}>
                  <PlusIcon />
                  Start from scratch
                </Button>
              </div>
            </Card>
          )}
          {shown.map((template) => (
            <TemplateCard
              key={template.id}
              template={template}
              onUse={canCreate ? () => create.run(template) : undefined}
              busy={create.busy}
            />
          ))}
          {shown.length === 0 && (
            <EmptyState
              className="sm:col-span-2 xl:col-span-3"
              title="No templates match"
              description="Try another word, or start from scratch."
            />
          )}
        </div>
      </div>
    </PageContainer>
  );
}

interface CardProps {
  template: WorkflowTemplate;
  onUse?: (() => void) | undefined;
  busy: boolean;
}

function TemplateCard({ template, onUse, busy }: CardProps) {
  const link = `/app/workflows/templates/${template.id}`;
  return (
    <Card className="card-hover h-full gap-4 p-5">
      <FlowPreview template={template} />
      <div className="grid gap-1">
        <h2 className="font-semibold">
          <Link to={link} className="outline-none hover:underline focus-visible:underline">
            {template.title}
          </Link>
        </h2>
        <p className="text-sm text-muted-foreground">{template.summary}</p>
      </div>
      <div className="mt-auto flex gap-2 pt-2">
        {onUse && (
          <Button size="sm" onClick={onUse} disabled={busy}>
            Use template
          </Button>
        )}
        <Button asChild size="sm" variant="ghost">
          <Link to={link} aria-label={`About ${template.title}`}>
            Details
          </Link>
        </Button>
      </div>
    </Card>
  );
}

/* The template's trigger and first steps, as a small outline of what it does. */
function FlowPreview({ template }: { template: WorkflowTemplate }) {
  const rows = [
    { icon: ZapIcon, label: TRIGGERS[template.trigger].label },
    ...template.steps.map((step) => ({
      icon: STEP_TYPES[step.type].icon,
      label: STEP_TYPES[step.type].label,
    })),
  ].slice(0, 4);
  return (
    <ol className="grid gap-1.5 rounded-lg border bg-background p-3" aria-label="Steps">
      {rows.map(({ icon: Icon, label }, index) => (
        <li key={index} className="flex items-center gap-2 text-xs text-subtle-foreground">
          <Icon className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
          <span className="truncate">{label}</span>
        </li>
      ))}
    </ol>
  );
}
