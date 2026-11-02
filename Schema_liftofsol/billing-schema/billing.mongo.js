// plans, billing_accounts, invoices, credit_ledger, usage_charges and billing_events for MongoDB: validators + indexes.
// Run with mongosh:  mongosh "<connection string>/<db>" billing.mongo.js
// Safe to re-run. Extra fields are allowed, so the schema stays flexible.
// Firestore with MongoDB compatibility doesn't run validators ($jsonSchema, collMod):
// there, skip the validator part and let the API check the same rules. The indexes work on both.
// Money is integer minor units (paise, cents). Credits are integers.

const uuid = {
  bsonType: "string",
  pattern: "^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$", // v4
};
const count = { bsonType: ["int", "long"], minimum: 0 };
const signedCount = { bsonType: ["int", "long"] };
const timestamps = {
  created_at: { bsonType: "date" },
  updated_at: { bsonType: "date" },
};
const currency = { enum: ["INR", "USD"] };
const interval = { enum: ["month", "year"] };
const provider = { enum: ["razorpay", "stripe"] };

const plansValidator = {
  $jsonSchema: {
    bsonType: "object",
    required: ["_id", "code", "name", "is_default", "status", "prices", "monthly_credits", "limits", "created_at", "updated_at"],
    properties: {
      _id: uuid,
      code: { bsonType: "string", pattern: "^[a-z0-9]+(-[a-z0-9]+)*$" },
      name: { bsonType: "string", minLength: 1, maxLength: 60 },
      is_default: { bsonType: "bool" },
      status: { enum: ["active", "retired"] },
      prices: {
        bsonType: "array",
        items: {
          bsonType: "object",
          required: ["currency", "interval", "amount_minor"],
          properties: {
            currency,
            interval,
            amount_minor: count,
            provider_price_id: { bsonType: "string" },
          },
        },
      },
      monthly_credits: count,
      limits: {
        bsonType: "object",
        required: ["projects", "agents", "members", "knowledge_documents"],
        properties: {
          projects: count,
          agents: count,
          members: count,
          knowledge_documents: count,
        },
      },
      ...timestamps,
    },
  },
};

const billingAccountsValidator = {
  $jsonSchema: {
    bsonType: "object",
    required: ["_id", "credit_period", "credit_period_cause", "subscription_revision", "included_credits_left", "purchased_credits_left", "credits_reset_at", "created_at", "updated_at"],
    properties: {
      _id: uuid, // = organizations._id
      provider,
      provider_customer_id: { bsonType: "string" },
      profile: {
        bsonType: "object",
        properties: {
          legal_name: { bsonType: "string" },
          email: { bsonType: "string", pattern: "^[^@\\sA-Z]+@[^@\\sA-Z]+$" },
          address: {
            bsonType: "object",
            required: ["line1", "city", "postal_code", "country"],
            properties: {
              line1: { bsonType: "string" },
              line2: { bsonType: "string" },
              city: { bsonType: "string" },
              state: { bsonType: "string" },
              postal_code: { bsonType: "string" },
              country: { bsonType: "string", pattern: "^[A-Z]{2}$" },
            },
          },
          tax_id: { bsonType: "string" },
        },
      },
      subscription: {
        bsonType: "object",
        required: [
          "plan_id", "status", "currency", "interval", "provider_subscription_id",
          "current_period_start", "current_period_end", "cancel_at_period_end", "started_at",
        ],
        properties: {
          plan_id: uuid,
          status: { enum: ["active", "past_due", "cancelled"] },
          currency,
          interval,
          provider_subscription_id: { bsonType: "string" },
          current_period_start: { bsonType: "date" },
          current_period_end: { bsonType: "date" },
          cancel_at_period_end: { bsonType: "bool" },
          started_at: { bsonType: "date" },
          cancelled_at: { bsonType: "date" },
        },
      },
      credit_period: { bsonType: ["int", "long"], minimum: 1 },
      credit_period_cause: { bsonType: "string", minLength: 1 }, // causeKey() of the current period
      subscription_revision: count, // checked at commit; see billing.types.ts
      included_credits_left: count,
      purchased_credits_left: count,
      credits_reset_at: { bsonType: "date" },
      ...timestamps,
    },
  },
};

const invoicesValidator = {
  $jsonSchema: {
    bsonType: "object",
    required: [
      "_id", "org_id", "provider", "provider_invoice_id", "status", "currency",
      "subtotal_minor", "tax_minor", "total_minor", "lines", "issued_at", "created_at", "updated_at",
    ],
    properties: {
      _id: uuid,
      org_id: uuid,
      provider,
      provider_invoice_id: { bsonType: "string", minLength: 1 },
      number: { bsonType: "string" },
      status: { enum: ["open", "paid", "failed", "void"] },
      currency,
      subtotal_minor: count,
      tax_minor: count,
      total_minor: count,
      lines: {
        bsonType: "array",
        items: {
          bsonType: "object",
          required: ["description", "quantity", "amount_minor"],
          properties: {
            description: { bsonType: "string" },
            quantity: count,
            amount_minor: count,
          },
        },
      },
      period_start: { bsonType: "date" },
      period_end: { bsonType: "date" },
      issued_at: { bsonType: "date" },
      paid_at: { bsonType: "date" },
      pdf_url: { bsonType: "string" },
      ...timestamps,
    },
  },
};

const creditLedgerValidator = {
  $jsonSchema: {
    bsonType: "object",
    required: ["_id", "org_id", "type", "idempotency_key", "credits", "pool", "created_at"],
    properties: {
      _id: uuid,
      org_id: uuid,
      type: { enum: ["grant", "purchase", "expiry", "adjustment"] },
      idempotency_key: { bsonType: "string", minLength: 1 }, // ledgerKey()
      credits: signedCount,
      pool: { enum: ["included", "purchased"] },
      invoice_id: uuid,
      reason: { bsonType: "string" },
      created_by: uuid,
      created_at: { bsonType: "date" },
    },
  },
};

const usageChargesValidator = {
  $jsonSchema: {
    bsonType: "object",
    required: [
      "_id", "org_id", "status", "project_id", "agent_id", "total_micros",
      "credits", "included", "purchased", "shortfall", "created_at",
    ],
    properties: {
      _id: uuid, // = transactions._id
      org_id: uuid, // chosen at admission
      status: { enum: ["pending", "settled"] },
      project_id: uuid,
      agent_id: uuid,
      total_micros: count,
      credits: count,
      included: count,
      purchased: count,
      shortfall: count,
      created_at: { bsonType: "date" },
      settled_at: { bsonType: "date" },
    },
    // settled_at only on a settled charge. "Settled needs settled_at" is checked in code.
    dependencies: {
      settled_at: { properties: { status: { enum: ["settled"] } } },
    },
  },
};

const billingEventsValidator = {
  $jsonSchema: {
    bsonType: "object",
    required: ["_id", "provider", "provider_event_id", "type", "payload", "status", "attempts", "received_at", "expires_at"],
    properties: {
      _id: uuid,
      provider,
      provider_event_id: { bsonType: "string", minLength: 1 },
      type: { bsonType: "string" },
      payload: { bsonType: "object" },
      status: { enum: ["received", "processed", "failed"] }, // only "processed" means finished
      attempts: count,
      error: { bsonType: "string" },
      received_at: { bsonType: "date" },
      processed_at: { bsonType: "date" },
      expires_at: { bsonType: "date" },
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

upsertCollection("plans", plansValidator);
upsertCollection("billing_accounts", billingAccountsValidator);
upsertCollection("invoices", invoicesValidator);
upsertCollection("credit_ledger", creditLedgerValidator);
upsertCollection("usage_charges", usageChargesValidator);
upsertCollection("billing_events", billingEventsValidator);

// UNIQUE: plans.code.
db.plans.createIndex({ code: 1 }, { name: "code_unique", unique: true });

// UNIQUE: billing_accounts.provider_customer_id and the subscription id, where present.
// Webhooks find the account by either one.
db.billing_accounts.createIndex(
  { provider_customer_id: 1 },
  { name: "provider_customer_unique", unique: true, sparse: true },
);
db.billing_accounts.createIndex(
  { "subscription.provider_subscription_id": 1 },
  { name: "provider_subscription_unique", unique: true, sparse: true },
);

// billing_accounts: accounts due for their monthly credit reset.
db.billing_accounts.createIndex({ credits_reset_at: 1 }, { name: "credits_reset_at" });

// UNIQUE together: invoices.provider + provider_invoice_id. An invoice webhook updates the same row.
db.invoices.createIndex(
  { provider: 1, provider_invoice_id: 1 },
  { name: "provider_invoice_unique", unique: true },
);

// invoices: an organization's invoices, newest first.
db.invoices.createIndex({ org_id: 1, issued_at: -1 }, { name: "org_issued" });

// credit_ledger: an organization's credit history, newest first.
db.credit_ledger.createIndex({ org_id: 1, created_at: -1 }, { name: "org_created" });

// UNIQUE: credit_ledger.idempotency_key, so the same payment, grant or expiry is applied once.
db.credit_ledger.createIndex({ idempotency_key: 1 }, { name: "idempotency_key_unique", unique: true });

// usage_charges: an organization's usage, newest first. (_id = transactions._id already makes
// each run's charge unique.)
db.usage_charges.createIndex({ org_id: 1, created_at: -1 }, { name: "org_created" });

// usage_charges: pending charges, oldest first, to settle runs that never reported back.
db.usage_charges.createIndex({ status: 1, created_at: 1 }, { name: "status_created" });

// UNIQUE together: billing_events.provider + provider_event_id. A repeat delivery finds the same
// row: skip it if "processed", process it again if "received" or "failed".
db.billing_events.createIndex(
  { provider: 1, provider_event_id: 1 },
  { name: "provider_event_unique", unique: true },
);

// billing_events: delete automatically at expires_at (90 days after they arrive).
db.billing_events.createIndex({ expires_at: 1 }, { name: "expires_ttl", expireAfterSeconds: 0 });

print("billing collections ready");
