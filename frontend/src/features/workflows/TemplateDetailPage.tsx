import { Link, useParams } from "react-router-dom";
import { ArrowLeftIcon, CheckIcon } from "lucide-react";

import { EmptyState, Notice, PageContainer } from "@/components/app/page.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Card } from "@/components/ui/card.tsx";
import { NoAccess } from "@/features/shell/NotFound.tsx";
import { useWorkspace } from "@/features/workspace/workspace.ts";

import { StepDiagram } from "./StepDiagram.tsx";
import { CATEGORIES, WORKFLOW_TEMPLATES } from "./templates.ts";
import { useCreateWorkflow } from "./useCreateWorkflow.ts";

/* One template: what it's for and how it works on the left, its steps drawn on the right. */
export default function TemplateDetailPage() {
  const { templateId } = useParams();
  const { can } = useWorkspace();
  const create = useCreateWorkflow();
  const template = WORKFLOW_TEMPLATES.find((item) => item.id === templateId);

  if (!can("workflows.view")) return <NoAccess what="workflows" />;
  const back = (
    <Button asChild variant="link" className="mb-4 text-muted-foreground">
      <Link to="/app/workflows/templates">
        <ArrowLeftIcon />
        All templates
      </Link>
    </Button>
  );
  if (!template)
    return (
      <PageContainer size="narrow">
        {back}
        <EmptyState title="Template not found" />
      </PageContainer>
    );
  const category = CATEGORIES.find((item) => item.id === template.category)?.label;

  return (
    <PageContainer>
      {back}
      <div className="grid gap-8 lg:grid-cols-[2fr_3fr] lg:gap-10">
        <div className="grid content-start gap-6">
          <div className="grid gap-2">
            <p className="label-caps">{category}</p>
            <h1 className="text-2xl font-medium tracking-tight">{template.title}</h1>
            <p className="text-sm text-muted-foreground">{template.description}</p>
          </div>
          {can("workflows.manage") && (
            <div>
              <Button onClick={() => create.run(template)} disabled={create.busy}>
                {create.busy ? "Creating…" : "Use template"}
              </Button>
            </div>
          )}
          {create.error && <Notice tone="error">{create.error}</Notice>}
          <section className="grid gap-3">
            <h2 className="font-medium">Benefits</h2>
            <ul className="grid gap-2">
              {template.benefits.map((benefit) => (
                <li key={benefit} className="flex gap-2 text-sm text-subtle-foreground">
                  <CheckIcon className="mt-0.5 size-4 shrink-0 text-success" aria-hidden="true" />
                  {benefit}
                </li>
              ))}
            </ul>
          </section>
          <section className="grid gap-3">
            <h2 className="font-medium">How it works</h2>
            <ol className="grid gap-2">
              {template.howItWorks.map((step, index) => (
                <li key={step} className="flex gap-3 text-sm text-subtle-foreground">
                  <span className="flex size-5 shrink-0 items-center justify-center rounded-md border bg-card text-xs tabular-nums text-muted-foreground">
                    {index + 1}
                  </span>
                  {step}
                </li>
              ))}
            </ol>
          </section>
        </div>
        <Card className="bg-background p-4 sm:p-6">
          <StepDiagram trigger={template.trigger} steps={template.steps} />
        </Card>
      </div>
    </PageContainer>
  );
}
