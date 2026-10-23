// organizations and invitations collections for MongoDB: validators + indexes.
// plan_id points to plans in the Billing schema; that collection is set up there.
// Run with mongosh:  mongosh "<connection string>/<db>" organizations.mongo.js
// Safe to re-run. Extra fields are allowed, so the schema stays flexible.
// Firestore with MongoDB compatibility doesn't run validators ($jsonSchema, collMod):
// there, skip the validator part and let the API check the same rules. The indexes work on both.
// If an earlier version of this file was run, drop invitations.pending_invite_unique first.

const uuid = {
  bsonType: "string",
  pattern: "^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$", // v4
};
const timestamps = {
  created_at: { bsonType: "date" },
  updated_at: { bsonType: "date" },
};
const role = { enum: ["owner", "admin", "member"] };

const organizationsValidator = {
  $jsonSchema: {
    bsonType: "object",
    required: ["_id", "name", "slug", "plan_id", "status", "created_by", "created_at", "updated_at", "settings"],
    properties: {
      _id: uuid,
      name: { bsonType: "string", minLength: 1, maxLength: 120 },
      slug: { bsonType: "string", pattern: "^[a-z0-9]+(-[a-z0-9]+)*$", minLength: 2, maxLength: 48 },
      logo_url: { bsonType: "string" },
      plan_id: uuid, // FK → plans._id (Billing schema)
      status: { enum: ["active", "suspended", "deleted"] },
      created_by: uuid,
      ...timestamps,
      deleted_at: { bsonType: "date" },
      settings: {
        bsonType: "object",
        required: ["default_role", "allowed_providers"],
        properties: {
          default_role: { enum: ["admin", "member"] },
          allowed_providers: {
            bsonType: "array",
            minItems: 1,
            items: { enum: ["google", "email", "github"] },
          },
        },
      },
    },
    // "status deleted needs deleted_at" is checked in code.
    dependencies: {
      deleted_at: { properties: { status: { enum: ["deleted"] } } },
    },
  },
};

const invitationsValidator = {
  $jsonSchema: {
    bsonType: "object",
    required: [
      "_id", "org_id", "email", "role", "token_hash", "invited_by",
      "status", "expires_at", "created_at", "updated_at",
    ],
    properties: {
      _id: uuid,
      org_id: uuid,
      email: { bsonType: "string", pattern: "^[^@\\sA-Z]+@[^@\\sA-Z]+$" },
      role,
      token_hash: { bsonType: "string", pattern: "^[0-9a-f]{64}$" },
      pending_key: { bsonType: "string", minLength: 1 }, // "{org_id}:{email}" while pending
      invited_by: uuid,
      status: { enum: ["pending", "accepted", "revoked", "expired"] },
      expires_at: { bsonType: "date" },
      ...timestamps,
    },
    // pending_key exists only on a pending invite. "Pending needs pending_key" is checked in code.
    dependencies: {
      pending_key: { properties: { status: { enum: ["pending"] } } },
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

upsertCollection("organizations", organizationsValidator);
upsertCollection("invitations", invitationsValidator);

// UNIQUE: organizations.slug (used in URLs).
db.organizations.createIndex({ slug: 1 }, { name: "slug_unique", unique: true });

// organizations: find every org on a plan (e.g. before retiring it).
db.organizations.createIndex({ plan_id: 1 }, { name: "plan_id" });

// UNIQUE: invitations.pending_key, so one open invite per person per org. Sparse, because the
// field exists only while pending (Firestore with MongoDB compatibility has no partial indexes).
db.invitations.createIndex(
  { pending_key: 1 },
  { name: "pending_key_unique", unique: true, sparse: true },
);

// UNIQUE: invitations.token_hash. Finds the invite when someone opens the link.
db.invitations.createIndex({ token_hash: 1 }, { name: "token_hash_unique", unique: true });

// invitations: delete automatically 7 days after they expire (an invite is valid for 24 hours).
db.invitations.createIndex(
  { expires_at: 1 },
  { name: "expires_ttl", expireAfterSeconds: 60 * 60 * 24 * 7 },
);

// The index that lists an org's members (users.membership.org_id) is in users.mongo.js.

print("organizations and invitations ready");
