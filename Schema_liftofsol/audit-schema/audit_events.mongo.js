// audit_events collection for MongoDB: validator + indexes.
// Run with mongosh:  mongosh "<connection string>/<db>" audit_events.mongo.js
// Safe to re-run. Extra fields are allowed, so the schema stays flexible.
// Firestore with MongoDB compatibility doesn't run validators ($jsonSchema, collMod):
// there, skip the validator part and let the API check the same rules. The indexes work on both.

const uuid = {
  bsonType: "string",
  pattern: "^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$", // v4
};

const auditEventsValidator = {
  $jsonSchema: {
    bsonType: "object",
    required: ["_id", "org_id", "actor_type", "action", "resource_type", "created_at", "expires_at"],
    properties: {
      _id: uuid,
      org_id: uuid,     // FK → organizations._id
      project_id: uuid, // FK → projects._id
      actor_type: { enum: ["user", "system", "platform"] },
      actor_user_id: uuid,
      action: { bsonType: "string", pattern: "^[a-z_]+\\.[a-z_]+$" },
      resource_type: { bsonType: "string", minLength: 1 },
      resource_id: { bsonType: "string" },
      changes: {
        bsonType: "object",
        properties: { before: { bsonType: "object" }, after: { bsonType: "object" } },
      },
      request_id: { bsonType: "string" },
      ip_address: { bsonType: "string" },
      user_agent: { bsonType: "string", maxLength: 500 },
      created_at: { bsonType: "date" },
      expires_at: { bsonType: "date" },
    },
  },
};

const options = { validator: auditEventsValidator, validationLevel: "strict", validationAction: "error" };
if (db.getCollectionNames().includes("audit_events")) {
  db.runCommand({ collMod: "audit_events", ...options });
} else {
  db.createCollection("audit_events", options);
}

// audit_events: an organization's log, newest first.
db.audit_events.createIndex({ org_id: 1, created_at: -1 }, { name: "org_created" });

// audit_events: the history of one thing, e.g. every change to one agent.
db.audit_events.createIndex(
  { org_id: 1, resource_type: 1, resource_id: 1, created_at: -1 },
  { name: "org_resource_created" },
);

// audit_events: delete automatically at expires_at (365 days after they are created).
db.audit_events.createIndex({ expires_at: 1 }, { name: "expires_ttl", expireAfterSeconds: 0 });

print("audit_events collection ready");
