import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { AppError, conflict, notFound } from "../common/errors.js";
import { parse } from "../common/schemas.js";
import type { Reader, Tx } from "./database.js";
import { id, type Platform } from "./platform.js";
import { authentication, p, uuidParam, type TokenVerifier } from "./http.js";
import {
  projectPermissions,
  type Project,
} from "../domain/schema/project-schema/projects.types.js";
import {
  MAX_STEPS,
  MAX_WAIT_MINUTES,
  type Workflow,
  type WorkflowAction,
  type WorkflowStep,
} from "../domain/schema/workflow-schema/workflows.types.js";

// Workflows: a project's automations, one trigger and the steps it runs. Nothing runs them yet; they start once a
// channel delivers real conversations (Schema_liftofsol README 13.2). The templates live in the frontend.

const stepId = z.string().min(1).max(64);
const text = z.string().trim().min(1).max(2_000);

const actionInput = z.discriminatedUnion("type", [
  z.object({ id: stepId, type: z.literal("send_message"), text }),
  z.object({
    id: stepId,
    type: z.literal("hand_to_agent"),
    assistant_id: z.uuid().optional(),
  }),
  z.object({
    id: stepId,
    type: z.literal("assign"),
    to: z.enum(["round_robin", "member", "nobody"]),
    member_id: z.uuid().optional(),
  }),
  z.object({
    id: stepId,
    type: z.literal("ask"),
    text,
    save_to: z.enum(["display_name", "email", "phone"]),
  }),
  z.object({ id: stepId, type: z.literal("add_note"), text }),
  z.object({
    id: stepId,
    type: z.literal("wait"),
    minutes: z.number().int().min(1).max(MAX_WAIT_MINUTES),
  }),
  z.object({ id: stepId, type: z.literal("close") }),
]);

const stepInput = z.union([
  actionInput,
  z.object({
    id: stepId,
    type: z.literal("branch"),
    condition: z.enum(["business_hours", "returning_contact", "has_email"]),
    yes: z.array(actionInput),
    no: z.array(actionInput),
  }),
]);

const workflowInput = z.object({
  name: z.string().trim().min(2).max(100),
  description: z.string().trim().max(300).nullish(),
  trigger: z.enum([
    "conversation_opened",
    "message_received",
    "conversation_closed",
  ]),
  steps: z.array(stepInput),
});

const view = (workflow: Workflow) => ({
  id: workflow._id,
  name: workflow.name,
  description: workflow.description ?? null,
  template_id: workflow.template_id ?? null,
  status: workflow.status,
  trigger: workflow.trigger,
  steps: workflow.steps,
  version: workflow.version,
  incomplete: unfinished(workflow.steps),
  created_at: workflow.created_at,
  updated_at: workflow.updated_at,
});

// Every action, including those inside branches.
const actions = (steps: WorkflowStep[]): WorkflowAction[] =>
  steps.flatMap((step) =>
    step.type === "branch" ? [...step.yes, ...step.no] : [step],
  );

// Why the workflow can't run yet, or null when every step is complete.
function unfinished(steps: WorkflowStep[]) {
  for (const action of actions(steps)) {
    if (action.type === "hand_to_agent" && !action.assistant_id)
      return "Pick the agent for each “Hand to an AI agent” step.";
    if (action.type === "assign" && action.to === "member" && !action.member_id)
      return "Pick the teammate for each “Assign” step.";
  }
  if (!steps.length) return "Add at least one step.";
  return null;
}

// The input as stored: no step count over MAX_STEPS, and only agents and teammates of this project.
async function checkSteps(tx: Tx, project: Project, steps: WorkflowStep[]) {
  if (stepCount(steps) > MAX_STEPS)
    throw new AppError(
      "TOO_MANY_STEPS",
      `A workflow can have at most ${MAX_STEPS} steps.`,
      422,
    );
  for (const action of actions(steps)) {
    if (action.type === "hand_to_agent" && action.assistant_id) {
      const assistant = await tx.get("assistants", action.assistant_id);
      if (
        !assistant ||
        assistant.project_id !== project._id ||
        assistant.status === "archived"
      )
        throw notFound("Agent");
    }
    if (action.type === "assign" && action.member_id) {
      const user = await tx.get("users", action.member_id);
      const canReply =
        user?.status === "active" &&
        user.membership.org_id === project.org_id &&
        projectPermissions(user.membership.role, project, user._id).has(
          "conversations.reply",
        );
      if (!canReply) throw notFound("Teammate");
    }
  }
}

// Each branch counts as one step, plus the steps inside it.
const stepCount = (steps: WorkflowStep[]) =>
  steps.reduce(
    (count, step) =>
      count +
      1 +
      (step.type === "branch" ? step.yes.length + step.no.length : 0),
    0,
  );

// Leaves out empty optional fields, so stored steps match the schema's types.
function cleanSteps(steps: z.infer<typeof stepInput>[]): WorkflowStep[] {
  const clean = (action: z.infer<typeof actionInput>): WorkflowAction => {
    if (action.type === "assign")
      return action.to === "member" && action.member_id
        ? {
            id: action.id,
            type: "assign",
            to: "member",
            member_id: action.member_id,
          }
        : { id: action.id, type: "assign", to: action.to };
    if (action.type === "hand_to_agent")
      return action.assistant_id
        ? {
            id: action.id,
            type: action.type,
            assistant_id: action.assistant_id,
          }
        : { id: action.id, type: action.type };
    return action;
  };
  return steps.map((step) =>
    step.type === "branch"
      ? { ...step, yes: step.yes.map(clean), no: step.no.map(clean) }
      : clean(step),
  );
}

async function findWorkflow(
  reader: Reader,
  projectId: string,
  workflowId: string,
) {
  const workflow = await reader.get("workflows", workflowId);
  if (!workflow || workflow.project_id !== projectId)
    throw notFound("Workflow");
  return workflow;
}

export async function workflowRoutes(
  app: FastifyInstance,
  platform: Platform,
  verify: TokenVerifier,
) {
  const { authenticated } = authentication(platform, verify);
  const { db } = platform;
  const root = "/projects/:projectId/workflows";
  const projectId = (request: FastifyRequest) =>
    uuidParam(request, "projectId");
  const workflowId = (request: FastifyRequest) =>
    uuidParam(request, "workflowId");

  app.get(root, { preHandler: authenticated }, async (request) => {
    const { project } = await platform.project(
      p(request),
      projectId(request),
      "workflows.view",
    );
    const workflows = await db.find("workflows", (q) =>
      q.where("project_id", "==", project._id),
    );
    return workflows
      .sort((a, b) => b.updated_at.getTime() - a.updated_at.getTime())
      .map(view);
  });

  app.get(
    `${root}/:workflowId`,
    { preHandler: authenticated },
    async (request) => {
      const { project } = await platform.project(
        p(request),
        projectId(request),
        "workflows.view",
      );
      return view(await findWorkflow(db, project._id, workflowId(request)));
    },
  );

  // A new workflow starts off, from a template's trigger and steps or from none.
  app.post(root, { preHandler: authenticated }, async (request, reply) => {
    const principal = p(request);
    const input = parse(
      workflowInput.extend({
        template_id: z.string().trim().min(1).max(50).optional(),
      }),
      request.body,
    );
    const created = await db.transaction(async (tx) => {
      const { org, project } = await platform.project(
        principal,
        projectId(request),
        "workflows.manage",
        tx,
      );
      const steps = cleanSteps(input.steps);
      await checkSteps(tx, project, steps);
      const now = new Date();
      const workflow: Workflow = {
        _id: id(),
        org_id: org._id,
        project_id: project._id,
        name: input.name,
        ...(input.description ? { description: input.description } : {}),
        ...(input.template_id ? { template_id: input.template_id } : {}),
        status: "off",
        trigger: input.trigger,
        steps,
        version: 1,
        created_by: principal.userId,
        created_at: now,
        updated_at: now,
      };
      tx.create("workflows", workflow);
      platform.audit(
        tx,
        principal,
        org._id,
        "workflow.created",
        "workflow",
        workflow._id,
        { after: { name: workflow.name } },
        project._id,
      );
      return workflow;
    });
    return reply.code(201).send(view(created));
  });

  app.patch(
    `${root}/:workflowId`,
    { preHandler: authenticated },
    async (request) => {
      const principal = p(request);
      const input = parse(
        workflowInput.extend({ expected_version: z.number().int().min(1) }),
        request.body,
      );
      return db.transaction(async (tx) => {
        const { org, project } = await platform.project(
          principal,
          projectId(request),
          "workflows.manage",
          tx,
        );
        const workflow = await findWorkflow(
          tx,
          project._id,
          workflowId(request),
        );
        if (workflow.version !== input.expected_version)
          throw conflict(
            "VERSION_CONFLICT",
            "Someone saved this workflow after you opened it. Reload to see their changes.",
          );
        const steps = cleanSteps(input.steps);
        await checkSteps(tx, project, steps);
        const problem = unfinished(steps);
        if (workflow.status === "on" && problem)
          throw new AppError(
            "WORKFLOW_INCOMPLETE",
            `${problem} Or turn the workflow off first.`,
            422,
          );
        const next: Workflow = {
          ...workflow,
          name: input.name,
          trigger: input.trigger,
          steps,
          version: workflow.version + 1,
          updated_at: new Date(),
        };
        if (input.description) next.description = input.description;
        else delete next.description;
        tx.set("workflows", next);
        platform.audit(
          tx,
          principal,
          org._id,
          "workflow.saved",
          "workflow",
          workflow._id,
          { after: { version: next.version } },
          project._id,
        );
        return view(next);
      });
    },
  );

  // On marks the workflow to run once channels deliver conversations; it needs every step complete.
  for (const status of ["on", "off"] as const)
    app.post(
      `${root}/:workflowId/turn-${status}`,
      { preHandler: authenticated },
      async (request) => {
        const principal = p(request);
        return db.transaction(async (tx) => {
          const { org, project } = await platform.project(
            principal,
            projectId(request),
            "workflows.manage",
            tx,
          );
          const workflow = await findWorkflow(
            tx,
            project._id,
            workflowId(request),
          );
          const problem = unfinished(workflow.steps);
          if (status === "on" && problem)
            throw new AppError("WORKFLOW_INCOMPLETE", problem, 422);
          const next: Workflow = {
            ...workflow,
            status,
            updated_at: new Date(),
          };
          tx.set("workflows", next);
          platform.audit(
            tx,
            principal,
            org._id,
            `workflow.turned_${status}`,
            "workflow",
            workflow._id,
            undefined,
            project._id,
          );
          return view(next);
        });
      },
    );

  app.delete(
    `${root}/:workflowId`,
    { preHandler: authenticated },
    async (request) => {
      const principal = p(request);
      await db.transaction(async (tx) => {
        const { org, project } = await platform.project(
          principal,
          projectId(request),
          "workflows.manage",
          tx,
        );
        const workflow = await findWorkflow(
          tx,
          project._id,
          workflowId(request),
        );
        tx.delete("workflows", workflow._id);
        platform.audit(
          tx,
          principal,
          org._id,
          "workflow.deleted",
          "workflow",
          workflow._id,
          { before: { name: workflow.name } },
          project._id,
        );
      });
      return { deleted: true };
    },
  );
}
