import { useNavigate } from "react-router-dom";

import { useOrgMutation } from "@/features/workspace/workspace.ts";
import type { Workflow } from "@/shared/types.ts";
import { useAction } from "@/shared/useAction.ts";

import type { WorkflowTemplate } from "./templates.ts";

/** Creates a workflow from a template, or empty without one, and opens it in the editor. */
export function useCreateWorkflow() {
  const { request, invalidate } = useOrgMutation();
  const navigate = useNavigate();
  return useAction(async (template?: WorkflowTemplate) => {
    const workflow = await request<Workflow>("/workflows", {
      method: "POST",
      body: template
        ? {
            name: template.title,
            description: template.summary,
            template_id: template.id,
            trigger: template.trigger,
            steps: template.steps,
          }
        : { name: "New workflow", trigger: "conversation_opened", steps: [] },
    });
    await invalidate("workflows");
    navigate(`/app/workflows/${workflow.id}`);
  });
}
