// conversations and messages collections for MongoDB: validators + indexes.
// Run with mongosh:  mongosh "<connection string>/<db>" inbox.mongo.js
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
const status = { enum: ["ai_active", "waiting_for_agent", "agent_active", "resolved", "closed"] };

const conversationsValidator = {
  $jsonSchema: {
    bsonType: "object",
    required: [
      "_id", "project_id", "agent_id", "contact_id", "identity_id", "channel", "connection_id",
      "status", "last_message_at", "created_at", "updated_at",
    ],
    properties: {
      _id: uuid,
      project_id: uuid,  // FK → projects._id
      agent_id: uuid,    // FK → agents._id
      contact_id: uuid,  // FK → contacts._id
      identity_id: uuid, // FK → contact_identities._id
      channel,
      connection_id: { bsonType: "string", minLength: 1 }, // credential id, or widget id for web chat
      open_key: { bsonType: "string", minLength: 1 }, // openKey(); only while not closed
      external_thread_id: { bsonType: "string" },
      status,
      assigned_user_id: uuid, // FK → users._id
      handoff_reason: { bsonType: "string", maxLength: 2000 },
      summary: { bsonType: "string", maxLength: 5000 },
      last_message_at: { bsonType: "date" },
      last_message_preview: { bsonType: "string", maxLength: 140 },
      ...timestamps,
      resolved_at: { bsonType: "date" },
      closed_at: { bsonType: "date" },
    },
    // Checked in code as well: "agent_active needs assigned_user_id", "closed has no open_key".
    dependencies: {
      assigned_user_id: { properties: { status: { enum: ["agent_active"] } } },
      resolved_at: { properties: { status: { enum: ["resolved", "closed"] } } },
      closed_at: { properties: { status: { enum: ["closed"] } } },
    },
  },
};

const messagesValidator = {
  $jsonSchema: {
    bsonType: "object",
    required: ["_id", "conversation_id", "project_id", "sender_type", "content_type", "content", "created_at"],
    properties: {
      _id: uuid,
      conversation_id: uuid, // FK → conversations._id
      project_id: uuid,
      sender_type: { enum: ["contact", "ai", "agent", "system"] },
      sender_user_id: uuid,
      content_type: { enum: ["text", "image", "file"] },
      content: { bsonType: "string", maxLength: 20000 },
      attachments: {
        bsonType: "array",
        items: {
          bsonType: "object",
          required: ["url", "mime_type"],
          properties: {
            url: { bsonType: "string" },
            mime_type: { bsonType: "string" },
            name: { bsonType: "string" },
            size_bytes: { bsonType: ["int", "long"], minimum: 0 },
          },
        },
      },
      citations: {
        bsonType: "array",
        items: {
          bsonType: "object",
          required: ["rag_id", "document_id", "title"],
          properties: {
            rag_id: uuid,
            document_id: uuid,
            title: { bsonType: "string" },
            url: { bsonType: "string" },
            snippet: { bsonType: "string", maxLength: 2000 },
          },
        },
      },
      transaction_id: uuid, // FK → transactions._id
      event: {
        enum: ["handoff_requested", "assigned", "transferred", "returned_to_ai", "resolved", "reopened", "closed"],
      },
      event_data: {
        bsonType: "object",
        properties: {
          from_user_id: uuid,
          to_user_id: uuid,
          reason: { bsonType: "string", maxLength: 2000 },
        },
      },
      external_key: { bsonType: "string", minLength: 1 }, // externalKey(project, connection, provider id)
      delivery: { enum: ["sent", "delivered", "read", "failed"] },
      created_at: { bsonType: "date" },
    },
    dependencies: {
      citations: { properties: { sender_type: { enum: ["ai"] } } },
      transaction_id: { properties: { sender_type: { enum: ["ai"] } } },
      event: { properties: { sender_type: { enum: ["system"] } } },
    },
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

upsertCollection("conversations", conversationsValidator);
upsertCollection("messages", messagesValidator);

// UNIQUE: conversations.open_key, so one open conversation per agent, connected account and contact identity.
// Sparse, because closed conversations don't have it.
db.conversations.createIndex({ open_key: 1 }, { name: "open_key_unique", unique: true, sparse: true });

// conversations: the inbox, newest activity first: everything, by status, and "assigned to me".
db.conversations.createIndex({ project_id: 1, last_message_at: -1 }, { name: "project_recent" });
db.conversations.createIndex({ project_id: 1, status: 1, last_message_at: -1 }, { name: "project_status_recent" });
db.conversations.createIndex(
  { project_id: 1, assigned_user_id: 1, last_message_at: -1 },
  { name: "project_assigned_recent" },
);

// conversations: a contact's history.
db.conversations.createIndex({ contact_id: 1, last_message_at: -1 }, { name: "contact_recent" });

// conversations: resolved ones due to be closed (scheduled job).
db.conversations.createIndex({ status: 1, resolved_at: 1 }, { name: "status_resolved" });

// messages: a conversation's messages in order.
db.messages.createIndex({ conversation_id: 1, created_at: 1 }, { name: "conversation_created" });

// UNIQUE: messages.external_key, so a webhook delivered twice stores the message once. The key
// includes the project and the connected account, so two accounts' message ids never collide.
db.messages.createIndex({ external_key: 1 }, { name: "external_key_unique", unique: true, sparse: true });

print("conversations and messages ready");
