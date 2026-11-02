import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { loadConfig, type Config } from "../config.js";
import { createFirebaseServices } from "../firebase/admin.js";
import { Database } from "./database.js";

// Onboarding needs exactly one active default plan. Creates it once, for development and tests.
export async function seedDevelopmentPlan(db: Database, config: Config) {
  if (config.APP_ENV === "production")
    throw new Error("Development seeding is forbidden in production.");
  await db.transaction(async (tx) => {
    const defaults = await tx.find("plans", (q) =>
      q.where("is_default", "==", true),
    );
    if (defaults.some((plan) => plan.status === "active")) return;
    const now = new Date(),
      planId = randomUUID();
    tx.create("plans", {
      _id: planId,
      code: "development-free",
      name: "Development Free",
      status: "active",
      is_default: true,
      prices: [],
      monthly_credits: config.DEFAULT_PLAN_CREDITS,
      limits: {
        projects: config.DEFAULT_PLAN_PROJECTS,
        members: config.DEFAULT_PLAN_MEMBERS,
        agents: 5,
        knowledge_documents: 20,
      },
      created_at: now,
      updated_at: now,
    });
    tx.claim("plans.code", "development-free", planId);
  });
}

// The RAG's platform node types the agents use (assistants.ts): a chat model per provider and the chat history.
// Creates each once, for development and tests, as the RAG's agent schema example has them.
export async function seedNodeTypes(db: Database, config: Config) {
  if (config.APP_ENV === "production")
    throw new Error("Development seeding is forbidden in production.");
  const types = [
    {
      category: "chat_model",
      handler: "openai_chat",
      name: "OpenAI chat",
      config: { model: "gpt-5.4-mini", temperature: 0.7, max_tokens: 1024 },
    },
    {
      category: "chat_model",
      handler: "gemini_chat",
      name: "Gemini chat",
      config: { model: "gemini-3.5-flash", temperature: 0.7, max_tokens: 1024 },
    },
    {
      category: "chat_model",
      handler: "deepseek_chat",
      name: "DeepSeek chat",
      config: {
        model: "deepseek-v4-flash",
        temperature: 0.7,
        max_tokens: 1024,
      },
    },
    {
      category: "memory",
      handler: "chat_history",
      name: "Chat history",
      config: {
        provider: "openai",
        model: "gpt-5.4-mini",
        summarise_after_tokens: 10000,
      },
    },
  ];
  await db.transaction(async (tx) => {
    const now = new Date();
    for (const type of types) {
      const existing = await tx.find("node_types", (q) =>
        q.where("handler", "==", type.handler),
      );
      if (existing.some((item) => !item.project_id)) continue;
      tx.create("node_types", {
        _id: randomUUID(),
        ...type,
        is_active: true,
        created_at: now,
        updated_at: now,
      });
    }
  });
}

// Run as its own step: node dist/firestore/provision.js. Locally it is limited to the emulator.
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const config = loadConfig();
  if (!process.env.FIRESTORE_EMULATOR_HOST)
    throw new Error("Seeding runs only against the Firestore emulator.");
  const db = new Database(createFirebaseServices(config).firestore);
  try {
    await seedDevelopmentPlan(db, config);
    await seedNodeTypes(db, config);
    console.log("Development plan and agent node types are ready.");
  } finally {
    await db.close();
  }
}
