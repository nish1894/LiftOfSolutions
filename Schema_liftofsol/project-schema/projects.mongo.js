// projects collection for MongoDB: validator + indexes.
// Run with mongosh:  mongosh "<connection string>/<db>" projects.mongo.js
// Safe to re-run. Extra fields are allowed, so the schema stays flexible.
// Firestore with MongoDB compatibility doesn't run validators ($jsonSchema, collMod):
// there, skip the validator part and let the API check the same rules. The indexes work on both.
// An earlier version of this file also made project_members and project_roles; they are no longer used.

const uuid = {
  bsonType: "string",
  pattern: "^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$", // v4
};
const timestamps = {
  created_at: { bsonType: "date" },
  updated_at: { bsonType: "date" },
};

// Same list as ALL_PROJECT_PERMISSIONS in projects.types.ts.
const PERMISSIONS = [
  "agents.view", "agents.create", "agents.update", "agents.publish", "agents.test", "agents.archive",
  "contacts.view", "contacts.manage",
  "conversations.view", "conversations.reply", "conversations.assign", "conversations.manage",
  "channels.view", "channels.manage",
  "knowledge.view", "knowledge.manage",
  "integrations.view", "integrations.manage",
  "tools.view", "tools.manage", "tools.approve",
  "analytics.view", "usage.view",
];
const permissionList = { bsonType: "array", uniqueItems: true, items: { enum: PERMISSIONS } };

const projectsValidator = {
  $jsonSchema: {
    bsonType: "object",
    required: ["_id", "org_id", "name", "status", "members", "created_by", "created_at", "updated_at"],
    properties: {
      _id: uuid,
      org_id: uuid, // FK → organizations._id
      name: { bsonType: "string", minLength: 1, maxLength: 120 },
      description: { bsonType: "string", maxLength: 2000 },
      status: { enum: ["active", "archived", "deleted"] },
      role_permissions: {
        bsonType: "object",
        properties: { admin: permissionList, member: permissionList },
      },
      members: {
        bsonType: "array",
        items: {
          bsonType: "object",
          required: ["user_id", "grants", "denies", "added_by", "added_at"],
          properties: {
            user_id: uuid,
            grants: permissionList,
            denies: permissionList,
            added_by: uuid,
            added_at: { bsonType: "date" },
          },
        },
      },
      created_by: uuid,
      ...timestamps,
      deleted_at: { bsonType: "date" },
    },
    dependencies: {
      deleted_at: { properties: { status: { enum: ["deleted"] } } },
    },
  },
};

const options = { validator: projectsValidator, validationLevel: "strict", validationAction: "error" };
if (db.getCollectionNames().includes("projects")) {
  db.runCommand({ collMod: "projects", ...options });
} else {
  db.createCollection("projects", options);
}

// projects: an organization's projects, newest first. "Projects Ravi can see" reads these and
// filters members in code, so no index over the members list is needed.
db.projects.createIndex({ org_id: 1, created_at: -1 }, { name: "org_created" });

print("projects collection ready");
