// contacts and contact_identities collections for MongoDB: validators + indexes.
// Run with mongosh:  mongosh "<connection string>/<db>" contacts.mongo.js
// Safe to re-run. Extra fields are allowed, so the schema stays flexible.
// Firestore with MongoDB compatibility doesn't run validators ($jsonSchema, collMod):
// there, skip the validator part and let the API check the same rules. The indexes work on both.

const uuid = {
  bsonType: "string",
  pattern: "^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$", // v4
};
const timestamps = {
  created_at: { bsonType: "date" },
  updated_at: { bsonType: "date" },
};
const channel = { enum: ["web_widget", "whatsapp", "email", "line"] };

const contactsValidator = {
  $jsonSchema: {
    bsonType: "object",
    required: ["_id", "project_id", "metadata", "status", "created_at", "updated_at"],
    properties: {
      _id: uuid,
      project_id: uuid, // FK → projects._id
      display_name: { bsonType: "string", maxLength: 200 },
      email: { bsonType: "string", pattern: "^[^@\\sA-Z]+@[^@\\sA-Z]+$" },
      phone: { bsonType: "string", pattern: "^\\+[1-9][0-9]{6,14}$" },
      country: { bsonType: "string", pattern: "^[A-Z]{2}$" },
      language: { bsonType: "string" },
      metadata: { bsonType: "object" },
      status: { enum: ["active", "blocked", "merged", "deleted"] },
      merged_into: uuid,
      ...timestamps,
      deleted_at: { bsonType: "date" },
    },
    dependencies: {
      merged_into: { properties: { status: { enum: ["merged"] } } },
      deleted_at: { properties: { status: { enum: ["deleted"] } } },
    },
  },
};

const contactIdentitiesValidator = {
  $jsonSchema: {
    bsonType: "object",
    required: ["_id", "project_id", "contact_id", "channel", "external_id", "created_at"],
    properties: {
      _id: uuid,
      project_id: uuid,
      contact_id: uuid, // FK → contacts._id
      channel,
      external_id: { bsonType: "string", minLength: 1, maxLength: 320 }, // normaliseExternalId()
      created_at: { bsonType: "date" },
    },
    // A WhatsApp identity must be a phone number in E.164; the API also checks email and others.
    anyOf: [
      { properties: { channel: { enum: ["web_widget", "email", "line"] } } },
      { properties: { external_id: { pattern: "^\\+[1-9][0-9]{6,14}$" } } },
    ],
  },
};

function upsertCollection(name, validator) {
  const options = { validator, validationLevel: "strict", validationAction: "error" };
  if (db.getCollectionNames().includes(name)) {
    db.runCommand({ collMod: name, ...options });
  } else {
    db.createCollection(name, options);
  }
}

upsertCollection("contacts", contactsValidator);
upsertCollection("contact_identities", contactIdentitiesValidator);

// contacts: a project's contacts, newest first (the Contacts page).
db.contacts.createIndex({ project_id: 1, created_at: -1 }, { name: "project_created" });

// UNIQUE together: contact_identities.project_id + channel + external_id. Matches an incoming message.
db.contact_identities.createIndex(
  { project_id: 1, channel: 1, external_id: 1 },
  { name: "project_channel_external_unique", unique: true },
);

// contact_identities: a contact's identities (contact page, merging, erasure).
db.contact_identities.createIndex({ contact_id: 1 }, { name: "contact_id" });

print("contacts and contact_identities ready");
