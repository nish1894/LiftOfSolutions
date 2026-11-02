// notifications collection for MongoDB: validator + indexes.
// Run with mongosh:  mongosh "<connection string>/<db>" notifications.mongo.js
// Safe to re-run. Extra fields are allowed, so the schema stays flexible.
// Firestore with MongoDB compatibility doesn't run validators ($jsonSchema, collMod):
// there, skip the validator part and let the API check the same rules. The indexes work on both.

const uuid = {
  bsonType: "string",
  pattern: "^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$", // v4
};

const notificationsValidator = {
  $jsonSchema: {
    bsonType: "object",
    required: ["_id", "user_id", "org_id", "type", "title", "body", "dedupe_key", "created_at", "expires_at"],
    properties: {
      _id: uuid,
      user_id: uuid, // FK → users._id
      org_id: uuid,  // FK → organizations._id
      type: { bsonType: "string", pattern: "^[a-z_]+\\.[a-z_]+$" },
      title: { bsonType: "string", minLength: 1, maxLength: 200 },
      body: { bsonType: "string", maxLength: 1000 },
      section: { bsonType: "string" },
      resource_type: { bsonType: "string" },
      resource_id: { bsonType: "string" },
      project_id: uuid,
      actor_user_id: uuid,
      dedupe_key: { bsonType: "string", minLength: 1 }, // dedupeKey(type, event_id, user_id)
      read_at: { bsonType: "date" },
      created_at: { bsonType: "date" },
      expires_at: { bsonType: "date" },
    },
  },
};

const options = { validator: notificationsValidator, validationLevel: "strict", validationAction: "error" };
if (db.getCollectionNames().includes("notifications")) {
  db.runCommand({ collMod: "notifications", ...options });
} else {
  db.createCollection("notifications", options);
}

// notifications: a person's bell, newest first.
db.notifications.createIndex({ user_id: 1, created_at: -1 }, { name: "user_created" });

// notifications: a person's unread count (read_at missing).
db.notifications.createIndex({ user_id: 1, read_at: 1 }, { name: "user_read" });

// UNIQUE: notifications.dedupe_key, so one event notifies a person once (and a later event again).
// If an earlier version of this file was run, drop dedupe_key_unique first (it was sparse).
db.notifications.createIndex({ dedupe_key: 1 }, { name: "dedupe_key_unique", unique: true });

// notifications: delete automatically at expires_at (90 days after they are created).
db.notifications.createIndex({ expires_at: 1 }, { name: "expires_ttl", expireAfterSeconds: 0 });

print("notifications collection ready");
