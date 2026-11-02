// tool_runs collection for MongoDB: validator + indexes.
// Run with mongosh:  mongosh "<connection string>/<db>" tool_runs.mongo.js
// Safe to re-run. Extra fields are allowed, so the schema stays flexible.
// Firestore with MongoDB compatibility doesn't run validators ($jsonSchema, collMod):
// there, skip the validator part and let the API check the same rules. The indexes work on both.

const uuid = {
  bsonType: "string",
  pattern: "^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$", // v4
};

const toolRunsValidator = {
  $jsonSchema: {
    bsonType: "object",
    required: [
      "_id", "project_id", "agent_id", "transaction_id", "node_id", "tool_name", "idempotent",
      "idempotency_key", "arguments", "status", "attempts", "created_at", "updated_at",
    ],
    properties: {
      _id: uuid,
      project_id: uuid,
      agent_id: uuid,
      transaction_id: uuid,  // FK → transactions._id
      conversation_id: uuid, // FK → conversations._id
      node_id: uuid,         // → agent template nodes[].id
      tool_name: { bsonType: "string", minLength: 1, maxLength: 120 },
      idempotent: { bsonType: "bool" }, // the provider honours idempotency_key
      retry_window_seconds: { bsonType: ["int", "long"], minimum: 1 }, // safe retry window, per tool node
      idempotency_key: { bsonType: "string", minLength: 1 }, // toolRunKey()
      arguments: { bsonType: "object" },
      result: { bsonType: "object" },
      status: {
        enum: ["pending_approval", "approved", "rejected", "expired", "running", "succeeded", "failed", "needs_review"],
      },
      attempts: { bsonType: ["int", "long"], minimum: 0 }, // also the current claim number
      first_attempt_at: { bsonType: "date" },              // anchors the retry window
      lease_until: { bsonType: "date" },         // while "running"
      approval_expires_at: { bsonType: "date" }, // runs that needed approval
      error: { bsonType: "string" },
      decided_by: uuid,
      decided_at: { bsonType: "date" },
      decision_note: { bsonType: "string", maxLength: 2000 },
      created_at: { bsonType: "date" },
      updated_at: { bsonType: "date" },
      finished_at: { bsonType: "date" },
    },
    dependencies: {
      decided_by: ["decided_at"],
      decided_at: ["decided_by"],
      lease_until: { properties: { status: { enum: ["running"] } } },
    },
  },
};

const options = { validator: toolRunsValidator, validationLevel: "strict", validationAction: "error" };
if (db.getCollectionNames().includes("tool_runs")) {
  db.runCommand({ collMod: "tool_runs", ...options });
} else {
  db.createCollection("tool_runs", options);
}

// UNIQUE: tool_runs.idempotency_key, so a retried agent run can't call the same tool twice.
db.tool_runs.createIndex({ idempotency_key: 1 }, { name: "idempotency_key_unique", unique: true });

// tool_runs: the approvals queue (status "pending_approval"), and a project's history by status.
db.tool_runs.createIndex({ project_id: 1, status: 1, created_at: -1 }, { name: "project_status_created" });

// tool_runs: the calls made inside one conversation.
db.tool_runs.createIndex({ conversation_id: 1, created_at: 1 }, { name: "conversation_created" });

// tool_runs: overdue approvals to tidy up (scheduled job; approving checks the deadline itself).
db.tool_runs.createIndex({ status: 1, approval_expires_at: 1 }, { name: "status_approval_expires" });

// tool_runs: runs whose worker lease ended, for crash recovery.
db.tool_runs.createIndex({ status: 1, lease_until: 1 }, { name: "status_lease" });

// If an earlier version of this file was run, drop tool_runs.status_created.

print("tool_runs collection ready");
