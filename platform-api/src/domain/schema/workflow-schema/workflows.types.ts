// Generated from Schema_liftofsol; run npm run schema:sync. Do not edit by hand.
// workflows collection: a project's automations. Each has one trigger and the steps it runs, in order.
// Nothing runs them yet: they start once a channel delivers real conversations (README 13.2). Until then the team
// can build, save and turn them on, and the editor says they don't run yet.
// Keys: PK = primary key, FK = foreign key.
//
// Rules enforced in code:
// - Steps run top to bottom. A branch asks one yes/no question, runs its yes or its no steps, then the workflow
//   carries on with the step after the branch. A branch can't hold another branch.
// - "close" ends the workflow. "hand_to_agent" lets the agent answer until it hands the conversation over; then the
//   next step runs. "wait" pauses. "ask" sends a question and saves the reply on the contact.
// - assistant_id → assistants._id in the same project, not archived. member_id → users._id of someone who can reply
//   in the project (conversations.reply). Both are checked on save, when set.
// - A workflow can be saved unfinished, but turning it on, or saving it while on, needs every step complete: an
//   agent picked for hand_to_agent and a teammate for assign "member".
// - At most MAX_STEPS steps, counting those inside branches.
// - Saving adds 1 to version, and needs the version the editor started from (expected_version).
// - Permissions (project): workflows.view to read; workflows.manage to create, save, turn on or off, and delete.
// - Deleting removes the workflow; nothing refers to it yet.

export const MAX_STEPS = 30;
export const MAX_WAIT_MINUTES = 7 * 24 * 60;

// conversation_opened = a contact starts a new conversation. message_received = any message from the contact.
// conversation_closed = a conversation is resolved or closed.
export type WorkflowTrigger = "conversation_opened" | "message_received" | "conversation_closed";

// The yes/no questions a branch can ask. business_hours needs the organization's hours, which aren't set up yet.
// returning_contact = the contact has an earlier conversation in the project.
export type BranchCondition = "business_hours" | "returning_contact" | "has_email";

// The contact fields an "ask" step can fill (Contact schema).
export type ContactField = "display_name" | "email" | "phone";

export type WorkflowAction =
  | { id: string; type: "send_message"; text: string }
  | { id: string; type: "hand_to_agent"; assistant_id?: string }
  // round_robin = the next teammate who can reply in the project, in turn. nobody = unassign.
  | { id: string; type: "assign"; to: "round_robin" | "member" | "nobody"; member_id?: string }
  | { id: string; type: "ask"; text: string; save_to: ContactField }
  | { id: string; type: "add_note"; text: string }       // an internal note only the team sees
  | { id: string; type: "wait"; minutes: number }        // 1 to MAX_WAIT_MINUTES
  | { id: string; type: "close" };

export interface WorkflowBranch {
  id: string;
  type: "branch";
  condition: BranchCondition;
  yes: WorkflowAction[];
  no: WorkflowAction[];
}

export type WorkflowStep = WorkflowAction | WorkflowBranch; // id: made by the editor, unique in the workflow

export type WorkflowStatus = "off" | "on";

export interface Workflow {
  _id: string;                   // PK. UUID v4
  org_id: string;                // FK → organizations._id
  project_id: string;            // FK → projects._id
  name: string;                  // e.g. "Welcome message"
  description?: string;          // shown to the team only
  template_id?: string;          // the template it started from, e.g. "welcome"; the templates live in the frontend
  status: WorkflowStatus;
  trigger: WorkflowTrigger;
  steps: WorkflowStep[];
  version: number;               // from 1
  created_by: string;            // FK → users._id
  created_at: Date;
  updated_at: Date;
}
