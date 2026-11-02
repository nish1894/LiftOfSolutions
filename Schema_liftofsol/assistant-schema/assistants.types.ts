// assistants collection: the platform's agent, the one the team edits in the studio.
// The RAG (LiftOfMain agent schema: agents, agent_templates, node_types) runs agents but has no drafts, and caches
// those records in memory without reading them again. So the platform keeps the draft and the published settings
// here, and gives the RAG a fresh agent of its own (an agents record and its agent_templates record) for each set of
// settings it should run. Those are never edited, only created and deleted.
// Keys: PK = primary key, FK = foreign key.
//
// Rules enforced in code:
// - live_agent_id runs the published settings, for customers. Publishing or resuming writes a new one;
//   pausing and archiving delete it.
// - test_agent_id runs the saved draft, for the studio's test chat. It is written when someone tests a draft
//   version that has none yet (test_version !== version), and replaces the previous one.
// - A RAG agent's template has the same _id. A replaced RAG agent is deleted with its template and its chat
//   history (agent_memory).
// - Each RAG template is input → reply → history (chat_history) → output for the "direct" flow. The "checked" flow
//   adds review after reply: it sends the reply back to be written again (at most CHECK_ROUNDS times) or on to
//   history. Both run the chosen model, on the handler ASSISTANT_MODELS gives for it. The reply searches the
//   knowledge source when there is one: the template's rag_id is source_id.
// - The "checked" flow needs an OpenAI model. When review sends a reply back, the RAG asks the model with a request
//   that ends with review's own message, and Gemini refuses that ("Requests ending with a model turn are not
//   supported"). DeepSeek is untested with it.
// - One knowledge source per agent: source_id → knowledge_sources._id (= rags._id) in the same project.
//   Publishing needs that source to be ready. A source an agent uses can't be deleted.
// - Saving the draft adds 1 to version, and needs the version the editor started from (expected_version).
// - Permissions (project): agents.view to read, agents.create, agents.update to save the draft, agents.test,
//   agents.publish to publish, pause and resume, agents.archive.
// - The plan's limits.agents counts the organization's agents that aren't archived.
// - Archived agents are kept, hidden, and never run again.

// The chat models the agent can use, from the RAG's LiftOfMain/src/LLM/configLLM.json, and the node handler that
// runs each. grok-4.5 is left out until the RAG has an xAI key (README 13.1).
export const ASSISTANT_MODELS = {
  "gpt-5.4-mini": "openai_chat",
  "gpt-5.5": "openai_chat",
  "gpt-5.4-nano": "openai_chat",
  "gemini-3.5-flash": "gemini_chat",
  "gemini-3.1-pro-preview": "gemini_chat",
  "gemini-3.1-flash-lite": "gemini_chat",
  "deepseek-v4-flash": "deepseek_chat",
  "deepseek-v4-pro": "deepseek_chat",
} as const;
export type AssistantModel = keyof typeof ASSISTANT_MODELS;
export const DEFAULT_MODEL: AssistantModel = "gpt-5.4-mini";

// direct = one step writes the reply. checked = a second step reviews each reply first.
export type AssistantFlow = "direct" | "checked";
export const CHECK_ROUNDS = 2;
export const CHECKED_FLOW_HANDLER = "openai_chat";

// draft = never published; live = customers get the published settings; paused = published, but nothing runs.
export type AssistantStatus = "draft" | "live" | "paused" | "archived";

// What the agent says and knows. The draft and the published copy have the same shape.
export interface AssistantSettings {
  instructions: string;  // how it should behave; the core of its system prompt
  tone?: string;         // e.g. "friendly, concise"
  languages: string[];   // language codes, e.g. ["en", "hi"]
  source_id?: string;    // FK → knowledge_sources._id, same project. Missing = no knowledge
  model: AssistantModel;
  flow: AssistantFlow;
}

export interface Assistant {
  _id: string;                   // PK. UUID v4
  org_id: string;                // FK → organizations._id
  project_id: string;            // FK → projects._id
  name: string;                  // e.g. "Returns agent"
  description?: string;          // shown to the team only
  status: AssistantStatus;
  draft: AssistantSettings;
  version: number;               // the draft's version, from 1
  published?: AssistantSettings; // set by the first publish
  published_version?: number;    // the draft version that was published
  published_at?: Date;
  published_by?: string;         // FK → users._id
  live_agent_id?: string;        // FK → agents._id (RAG agent schema); set while live
  test_agent_id?: string;        // FK → agents._id (RAG agent schema)
  test_version?: number;         // the draft version test_agent_id runs
  created_by: string;            // FK → users._id
  created_at: Date;
  updated_at: Date;
}
