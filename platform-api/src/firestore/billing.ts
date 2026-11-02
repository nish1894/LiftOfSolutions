import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { parse } from "../common/schemas.js";
import { conflict, notFound, AppError } from "../common/errors.js";
import { Platform, id, nextMonth, type Principal } from "./platform.js";
import {
  authentication,
  dto,
  p,
  uuidParam,
  type TokenVerifier,
} from "./http.js";
import {
  causeKey,
  ledgerKey,
  dueCause,
  chargeUsage,
  creditsFor,
  type CreditEntry,
  type UsageCharge,
} from "../domain/schema/billing-schema/billing.types.js";
import type { Tx } from "./database.js";

// Billing writes don't lock the organization document. Each change rewrites the billing account
// or the usage charge it touches inside a transaction, so concurrent changes to one account conflict
// on that account and one is rerun; claimed ledger keys and usage-charge ids stop double counting.

// A ledger entry and its idempotency key, claimed so the same grant or expiry is never written twice.
function addLedgerEntry(tx: Tx, entry: CreditEntry) {
  tx.create("credit_ledger", entry);
  tx.claim("credit_ledger.idempotency_key", entry.idempotency_key, entry._id);
}

export class Billing {
  constructor(readonly platform: Platform) {}

  get db() {
    return this.platform.db;
  }

  // The default/free plan works without a payment provider. Called by the scheduled job, never by a
  // page view; dueCause and the claimed ledger key make repeated calls harmless.
  async rollDefaultPeriod(orgId: string, now = new Date()) {
    return this.db.transaction(async (tx) => {
      const org = await tx.get("organizations", orgId);
      if (!org || org.status !== "active") throw notFound("Organization");
      const account = await tx.get("billing_accounts", orgId);
      if (!account) throw notFound("Billing account");
      if (account.subscription && !account.subscription.cancelled_at)
        return account;

      const cause = dueCause(account, now);
      if (!cause || cause.kind !== "scheduled_reset") return account;
      const plan = await tx.get("plans", org.plan_id);
      if (!plan || plan.status !== "active") throw notFound("Current plan");

      const expired = account.included_credits_left;
      if (expired)
        addLedgerEntry(tx, {
          _id: id(),
          org_id: orgId,
          type: "expiry",
          idempotency_key: ledgerKey({
            type: "expiry",
            org_id: orgId,
            credit_period: account.credit_period,
          }),
          credits: -expired,
          pool: "included",
          created_at: now,
        });
      addLedgerEntry(tx, {
        _id: id(),
        org_id: orgId,
        type: "grant",
        idempotency_key: ledgerKey({ type: "grant", cause }),
        credits: plan.monthly_credits,
        pool: "included",
        created_at: now,
      });

      account.included_credits_left = plan.monthly_credits;
      account.credit_period += 1;
      account.credit_period_cause = causeKey(cause);
      account.credits_reset_at = nextMonth(account.credits_reset_at);
      account.subscription_revision += 1;
      account.updated_at = now;
      tx.set("billing_accounts", account);
      this.platform.audit(
        tx,
        null,
        orgId,
        "billing.period_rolled",
        "billing_account",
        orgId,
        {
          before: { included_credits_left: expired },
          after: {
            included_credits_left: plan.monthly_credits,
            credit_period: account.credit_period,
          },
        },
      );
      return account;
    });
  }

  // Read-only: a page view never writes. A due period is rolled by the scheduled job within a minute.
  async summary(principal: Principal, orgId: string) {
    const { org } = await this.platform.context(
      principal,
      orgId,
      "billing.manage",
    );
    const [account, plan] = await Promise.all([
      this.db.get("billing_accounts", orgId),
      this.db.get("plans", org.plan_id),
    ]);
    if (!account || !plan) throw notFound("Billing account");
    return { account, plan };
  }

  // Agent runtime integration only. Admission pins the organization before execution.
  async admitRun(
    projectId: string,
    agentId: string,
    transactionId: string,
    now = new Date(),
  ): Promise<UsageCharge> {
    return this.db.transaction(async (tx) => {
      const project = await tx.get("projects", projectId);
      if (!project || project.status !== "active")
        throw notFound("Active project");
      // A usage charge's id is the agent run's id, so a repeated admission finds it.
      const existing = await tx.get("usage_charges", transactionId);
      if (existing) {
        if (
          existing.project_id !== projectId ||
          existing.agent_id !== agentId
        ) {
          throw conflict(
            "RUN_SCOPE_MISMATCH",
            "This run belongs to another project or agent.",
          );
        }
        return existing;
      }

      const account = await tx.get("billing_accounts", project.org_id);
      if (
        !account ||
        account.included_credits_left + account.purchased_credits_left < 1
      ) {
        throw conflict(
          "OUT_OF_CREDITS",
          "This organization has no credits left.",
        );
      }
      const agent = await tx.get("agents", agentId);
      if (!agent || agent.project_id !== projectId || agent.status !== "active")
        throw notFound("Active agent");

      const charge: UsageCharge = {
        _id: transactionId,
        org_id: project.org_id,
        project_id: projectId,
        agent_id: agentId,
        status: "pending",
        total_micros: 0,
        credits: 0,
        included: 0,
        purchased: 0,
        shortfall: 0,
        created_at: now,
      };
      tx.create("usage_charges", charge);
      return charge;
    });
  }

  async settleRun(transactionId: string, now = new Date()) {
    return this.db.transaction(async (tx) => {
      const charge = await tx.get("usage_charges", transactionId);
      if (!charge) throw notFound("Usage charge");
      if (charge.status === "settled") return charge;

      // transactions belong to the RAG's transactions schema; only these fields are read.
      const transaction = await tx.get("transactions", transactionId);
      if (
        !transaction ||
        transaction.project_id !== charge.project_id ||
        transaction.agent_id !== charge.agent_id ||
        !["succeeded", "failed"].includes(transaction.status)
      )
        throw conflict("RUN_NOT_FINISHED", "Settle only a finished agent run.");
      // Charged to the organization pinned at admission, never the project's current organization.
      const account = await tx.get("billing_accounts", charge.org_id);
      if (!account) throw notFound("Billing account");

      const totalMicros = transaction.total_micros ?? 0;
      const credits = creditsFor(totalMicros);
      const parts = chargeUsage(credits, account);
      account.included_credits_left -= parts.included;
      account.purchased_credits_left -= parts.purchased;
      account.updated_at = now;
      tx.set("billing_accounts", account);

      charge.status = "settled";
      charge.total_micros = totalMicros;
      charge.credits = credits;
      charge.included = parts.included;
      charge.purchased = parts.purchased;
      charge.shortfall = parts.shortfall;
      charge.settled_at = now;
      tx.set("usage_charges", charge);
      this.platform.audit(
        tx,
        null,
        charge.org_id,
        "billing.usage_settled",
        "usage_charge",
        transactionId,
        {
          after: {
            credits,
            included: parts.included,
            purchased: parts.purchased,
            shortfall: parts.shortfall,
          },
        },
        charge.project_id,
      );
      return charge;
    });
  }
}

const profileInput = z
  .object({
    legal_name: z.string().trim().max(200).nullable().optional(),
    email: z.email().nullable().optional(),
    address: z
      .object({
        line1: z.string().min(1),
        line2: z.string().optional(),
        city: z.string().min(1),
        state: z.string().optional(),
        postal_code: z.string().min(1),
        country: z.string().regex(/^[A-Z]{2}$/),
      })
      .strict()
      .optional(),
    tax_id: z.string().max(100).optional(),
  })
  .strict();

export async function billingRoutes(
  app: FastifyInstance,
  platform: Platform,
  verify: TokenVerifier,
) {
  const { authenticated } = authentication(platform, verify);
  const billing = new Billing(platform);

  app.get("/plans", async () => {
    const plans = await platform.db.find("plans", (q) =>
      q.where("status", "==", "active"),
    );
    return plans.sort((a, b) => a.monthly_credits - b.monthly_credits).map(dto);
  });

  // "businesses" is the old name, kept at the HTTP boundary while the frontend moves over.
  for (const root of [
    "/organizations/:orgId/billing",
    "/businesses/:orgId/billing",
  ]) {
    app.get(
      `${root}/account`,
      { preHandler: authenticated },
      async (request) => {
        const { account, plan } = await billing.summary(
          p(request),
          uuidParam(request, "orgId"),
        );
        return { ...dto(account), plan: dto(plan) };
      },
    );

    app.get(
      `${root}/subscription`,
      { preHandler: authenticated },
      async (request) => {
        const { account, plan } = await billing.summary(
          p(request),
          uuidParam(request, "orgId"),
        );
        return (
          account.subscription ?? {
            plan_code: plan.code,
            status: "active",
            source: "default_plan",
          }
        );
      },
    );

    app.get(
      `${root}/profile`,
      { preHandler: authenticated },
      async (request) => {
        const { account } = await billing.summary(
          p(request),
          uuidParam(request, "orgId"),
        );
        return account.profile ?? {};
      },
    );

    app.patch(
      `${root}/profile`,
      { preHandler: authenticated },
      async (request) => {
        const input = parse(profileInput, request.body);
        return platform.db.transaction(async (tx) => {
          const { org } = await platform.context(
            p(request),
            uuidParam(request, "orgId"),
            "billing.manage",
            tx,
          );
          const account = await tx.get("billing_accounts", org._id);
          if (!account) throw notFound("Billing account");

          const profile = account.profile ?? {};
          if (input.legal_name === null) delete profile.legal_name;
          else if (input.legal_name !== undefined)
            profile.legal_name = input.legal_name;
          if (input.email === null) delete profile.email;
          else if (input.email !== undefined) profile.email = input.email;
          if (input.tax_id !== undefined) profile.tax_id = input.tax_id;
          if (input.address) {
            const a = input.address;
            profile.address = {
              line1: a.line1,
              city: a.city,
              postal_code: a.postal_code,
              country: a.country,
              ...(a.line2 ? { line2: a.line2 } : {}),
              ...(a.state ? { state: a.state } : {}),
            };
          }
          account.profile = profile;
          account.updated_at = new Date();
          tx.set("billing_accounts", account);
          platform.audit(
            tx,
            p(request),
            org._id,
            "billing.profile_updated",
            "billing_account",
            org._id,
            { after: { fields: Object.keys(input) } },
          );
          return profile;
        });
      },
    );

    app.get(
      `${root}/invoices`,
      { preHandler: authenticated },
      async (request) => {
        const { org } = await platform.context(
          p(request),
          uuidParam(request, "orgId"),
          "billing.manage",
        );
        // Index: invoices (org_id, issued_at desc).
        const invoices = await platform.db.find("invoices", (q) =>
          q
            .where("org_id", "==", org._id)
            .orderBy("issued_at", "desc")
            .limit(100),
        );
        return invoices.map(dto);
      },
    );

    app.get(
      `${root}/ledger`,
      { preHandler: authenticated },
      async (request) => {
        const { org } = await platform.context(
          p(request),
          uuidParam(request, "orgId"),
          "billing.manage",
        );
        // Index: credit_ledger (org_id, created_at desc).
        const entries = await platform.db.find("credit_ledger", (q) =>
          q
            .where("org_id", "==", org._id)
            .orderBy("created_at", "desc")
            .limit(100),
        );
        return entries.map(dto);
      },
    );

    app.post(
      `${root}/checkout`,
      { preHandler: authenticated },
      async (request) => {
        await platform.context(
          p(request),
          uuidParam(request, "orgId"),
          "billing.manage",
        );
        throw new AppError(
          "PAYMENT_PROVIDER_NOT_CONFIGURED",
          "A payment provider has not been selected for this platform.",
          501,
        );
      },
    );
  }
}
