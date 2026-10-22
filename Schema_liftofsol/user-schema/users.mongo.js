// users and auth_identities collections for MongoDB: validators + indexes.
// Run with mongosh:  mongosh "<connection string>/<db>" users.mongo.js
// Safe to re-run. Extra fields are allowed, so the schema stays flexible.
// Firestore with MongoDB compatibility doesn't run validators ($jsonSchema, collMod):
// there, skip the validator part and let the API check the same rules. The indexes work on both.
// If an earlier version of this file was run, drop users.email_unique, users.identity_uid_unique
// and users.identity_subject_unique first.

const uuid = {
  bsonType: "string",
  pattern: "^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$", // v4
};
const timestamps = {
  created_at: { bsonType: "date" },
  updated_at: { bsonType: "date" },
};

const usersValidator = {
  $jsonSchema: {
    bsonType: "object",
    required: ["_id", "display_name", "status", "membership", "created_at", "updated_at"],
    properties: {
      _id: uuid,
      display_name: { bsonType: "string", minLength: 1, maxLength: 100 },
      email: { bsonType: "string", pattern: "^[^@\\sA-Z]+@[^@\\sA-Z]+$" },
      phone: { bsonType: "string", pattern: "^\\+[1-9][0-9]{6,14}$" },
      avatar_url: { bsonType: "string" },
      dob: { bsonType: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
      gender: { bsonType: "string", maxLength: 50 },
      status: { enum: ["active", "suspended", "deleted"] },

      membership: {
        bsonType: "object",
        required: ["org_id", "role", "created_at", "updated_at"],
        properties: {
          org_id: uuid, // FK → organizations._id
          role: { enum: ["owner", "admin", "member"] },
          ...timestamps,
        },
      },

      settings: {
        bsonType: "object",
        properties: {
          theme: { enum: ["light", "dark", "system"] },
          language: { bsonType: "string" },
          timezone: { bsonType: "string" },
          notifications: {
            bsonType: "object",
            properties: {
              email: { bsonType: "bool" },
              product_updates: { bsonType: "bool" },
            },
          },
        },
      },

      terms_accepted_at: { bsonType: "date" },
      terms_version: { bsonType: "string", minLength: 1 },
      ...timestamps,
      deleted_at: { bsonType: "date" },
    },
    // Fields that only make sense together. "status deleted needs deleted_at" is checked in code.
    dependencies: {
      terms_accepted_at: ["terms_version"],
      terms_version: ["terms_accepted_at"],
      deleted_at: { properties: { status: { enum: ["deleted"] } } },
    },
  },
};

const authIdentitiesValidator = {
  $jsonSchema: {
    bsonType: "object",
    required: ["_id", "user_id", "provider", "subject", "created_at"],
    properties: {
      _id: uuid,
      user_id: uuid, // FK → users._id
      provider: { enum: ["firebase", "local"] },
      subject: { bsonType: "string", minLength: 1 },
      created_at: { bsonType: "date" },
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

upsertCollection("users", usersValidator);
upsertCollection("auth_identities", authIdentitiesValidator);

// UNIQUE: users.email, only where one exists. Sparse rather than partial,
// because Firestore with MongoDB compatibility has no partial indexes.
db.users.createIndex({ email: 1 }, { name: "email_unique", unique: true, sparse: true });

// users: list every member of an org.
db.users.createIndex({ "membership.org_id": 1 }, { name: "membership_org" });

// UNIQUE together: auth_identities.provider + subject. Finds the user on sign-in.
db.auth_identities.createIndex(
  { provider: 1, subject: 1 },
  { name: "provider_subject_unique", unique: true },
);

// auth_identities: a user's sign-in methods (e.g. to remove them when the account is deleted).
db.auth_identities.createIndex({ user_id: 1 }, { name: "user_id" });

print("users and auth_identities ready");
