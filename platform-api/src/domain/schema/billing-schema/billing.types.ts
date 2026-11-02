// Generated from Schema_liftofsol; run npm run schema:sync. Do not edit by hand.
// Billing schema: plans, billing_accounts, invoices, credit_ledger, usage_charges, billing_events.
// Connected to the Organization schema (organizations.plan_id, billing_accounts._id = organizations._id)
// and to the Transactions schema (usage_charges._id = transactions._id).
// Keys: PK = primary key, FK = foreign key, UNIQUE = no two documents share the value.
//
// Money: integer minor units of the currency (paise for INR, cents for USD), the same way the
// payment providers count it. Our own costs stay in micro-USD in the Transactions schema;
// credits connect the two.
//
// Rules enforced in code:
// - Only a verified webhook from the payment provider changes a subscription or an invoice.
//   The browser only starts a checkout; it never marks anything paid.
// - Webhook events: insert the billing_event if it is new (UNIQUE provider + provider_event_id).
//   If it already exists with status "processed", stop: it is finished. If it exists as "received"
//   or "failed", process it again. The billing changes and status "processed" are written in one
//   transaction, so an event is never marked processed without its changes, or the reverse.
//   A failure sets status "failed", adds 1 to attempts and keeps the error.
// - Events can arrive out of order, so an event is only a signal. For a subscription event,
//   fetch the subscription's current state from the provider and apply that, never the event body.
//   A late "activated" after a cancellation then still ends as cancelled.
// - Concurrent writes: billing_accounts.subscription_revision goes up by 1 on every write that changes
//   the subscription or the credit period. A worker reads the account (revision r), fetches the
//   provider state, then commits in a transaction only if the revision is still r. If it changed,
//   another worker got there first: fetch the provider state again and retry (at most 3 times, then
//   the event is left "failed" for a later retry). An older fetch can never overwrite a newer one.
//   Usage settlements don't change the revision, so busy agents don't block webhooks.
// - Only the account's current subscription (subscription.provider_subscription_id) can change
//   billing_accounts.subscription. An event for another subscription id replaces it only when it is
//   a new subscription and the current one is "cancelled" (a new checkout). Events for an older
//   subscription only update its invoices.
// - Every balance change other than agent usage is a credit_ledger entry with a UNIQUE
//   idempotency_key (see ledgerKey()). The entry and the balance change are written in one
//   transaction; a duplicate key means it was already applied, so nothing changes. This stops the
//   same payment, or the same monthly grant, from adding credits twice, even when it arrives
//   through different webhook events.
// - Every agent run is charged once, through one usage_charges document whose _id is the
//   transaction's _id:
//   - Admission (before the run): the project's organization is read once; the run starts only if
//     that billing account has included + purchased credits of at least 1. The usage charge is
//     created as "pending" with that org_id.
//   - Settlement (after the run): the real cost is charged with chargeUsage() to the org_id stored
//     at admission, never the project's current organization, and the charge becomes "settled"
//     in the same transaction as the balance change. A run is billed to the organization that
//     admitted it, even if the project moves while it runs.
//   - If the balance can't cover the cost, the balances go to 0 and the rest is recorded as
//     shortfall. Balances never go below 0, so an organization overruns by at most the runs
//     already in progress.
//   - A charge still "pending" after its transaction has finished or failed is settled with that
//     transaction's total_micros (0 if it has none).
// - organizations.plan_id equals billing_accounts.subscription.plan_id while the subscription is
//   "active" or "past_due"; otherwise it is the default plan. Both change in the same transaction,
//   so a request reads the plan from the organization it already loaded.
// - Credit periods: billing_accounts.credit_period numbers them (1 from sign-up), and
//   credit_period_cause records which cause (causeKey) started the current one. Every trigger
//   (the scheduled worker, any webhook, a checkout) does the same thing: in one transaction it
//   calls dueCause(account, now). The cause comes from the account's state, never from the trigger,
//   so the worker and the cancellation webhook both arrive at the same "subscription_ended" cause,
//   and every path handling a renewal arrives at the same "subscription_period" cause.
//   If dueCause returns null, the transition has already been applied (or nothing is due) and
//   nothing changes. Otherwise rollCreditPeriod, in that transaction:
//   1. if the cause is "subscription_ended": set subscription.status = "cancelled" and
//      subscription.cancelled_at (only this step sets cancelled_at), and move organizations.plan_id
//      to the default plan. A scheduled cancellation can still be "active" until this step;
//   2. decide the plan that applies now (the subscription's while it isn't ended, else default);
//   3. expire unused included credits of period N (key "expiry:{org}:N");
//   4. grant that plan's monthly_credits (key "grant:" + causeKey(cause));
//   5. set credit_period = N + 1, credit_period_cause = causeKey(cause), the next credits_reset_at
//      (the subscription's current_period_end, or one month on for the default plan), and
//      subscription_revision + 1.
//   Subscription causes use the provider state fetched as described above. A scheduled reset is
//   due only on the default plan, once credits_reset_at <= now, read inside the transaction.
//   The unique grant key stays as a second guard: if two transitions ever compute the same cause,
//   the second hits the duplicate key and the whole transaction is dropped. Purchased credits are
//   never touched.
// - Cancelling sets cancel_at_period_end; the subscription stays on the account as "cancelled"
//   (the last subscription), with cancelled_at set by the transition above.
// - A billing account is created with its organization (same transaction as sign-up),
//   on the default plan with that plan's monthly credits, in credit period 1, with
//   credit_period_cause = causeKey({ kind: "signup", org_id }).
// - Plan prices are never edited. To change a price, add a new plan and retire the old one;
//   existing subscriptions keep their plan until they are moved.
// - Exactly one active plan has is_default = true.
// - credit_ledger is append-only. usage_charges are never deleted; each changes once, from
//   "pending" to "settled". Invoices are kept, never deleted (tax records).
// - A balance can always be explained: per pool, the sum of credit_ledger entries minus the sum of
//   usage_charges deductions.

export const MICROS_PER_CREDIT = 1_000; // 1 credit = $0.001 of our cost. Placeholder: see ../README.md section 15
export const BILLING_EVENT_RETENTION_DAYS = 90;

export type Currency = "INR" | "USD";
export type BillingInterval = "month" | "year";
export type PaymentProvider = "razorpay" | "stripe";

// ---------- plans ----------

export interface PlanPrice {
  currency: Currency;
  interval: BillingInterval;
  amount_minor: number;        // e.g. 99900 = ₹999.00
  provider_price_id?: string;  // the same price in the payment provider
}

export interface PlanLimits {
  projects: number;
  agents: number;
  members: number;
  knowledge_documents: number;
}

export type PlanStatus = "active" | "retired"; // retired = no new subscriptions; existing ones keep it

export interface Plan {
  _id: string;                 // PK. UUID v4
  code: string;                // UNIQUE. e.g. "free", "starter-2026-10"
  name: string;                // shown to customers, e.g. "Starter"
  is_default: boolean;         // the plan new organizations get
  status: PlanStatus;
  prices: PlanPrice[];         // empty = free
  monthly_credits: number;     // included credits granted every month
  limits: PlanLimits;
  created_at: Date;
  updated_at: Date;
}

// ---------- billing_accounts ----------
// One per organization: who pays, the latest subscription and the credit balances.

export interface BillingAddress {
  line1: string;
  line2?: string;
  city: string;
  state?: string;
  postal_code: string;
  country: string;             // ISO 3166-1 alpha-2, e.g. "IN"
}

export interface BillingProfile {
  legal_name?: string;
  email?: string;              // where invoices go
  address?: BillingAddress;
  tax_id?: string;             // e.g. GSTIN in India
}

export type SubscriptionStatus = "active" | "past_due" | "cancelled";

export interface Subscription {
  plan_id: string;             // FK → plans._id
  status: SubscriptionStatus;  // "cancelled" = kept as the last subscription; the plan no longer applies
  currency: Currency;
  interval: BillingInterval;
  provider_subscription_id: string; // UNIQUE
  current_period_start: Date;
  current_period_end: Date;
  cancel_at_period_end: boolean;
  started_at: Date;
  cancelled_at?: Date;         // set only by rollCreditPeriod when it applies "subscription_ended"
}

export interface BillingAccount {
  _id: string;                 // PK = organizations._id
  provider?: PaymentProvider;  // set at the first checkout
  provider_customer_id?: string; // UNIQUE when present
  profile?: BillingProfile;
  subscription?: Subscription; // missing = never subscribed
  credit_period: number;       // current credit period, 1 from sign-up; see rollCreditPeriod
  credit_period_cause: string; // causeKey() of the cause that started the current period
  subscription_revision: number; // +1 on every subscription or credit-period change; checked at commit
  included_credits_left: number;  // from the plan; reset every period
  purchased_credits_left: number; // from top-ups; never expire
  credits_reset_at: Date;      // when the current credit period ends
  created_at: Date;
  updated_at: Date;
}

// ---------- invoices ----------
// Copied from the payment provider through its webhooks.

export type InvoiceStatus = "open" | "paid" | "failed" | "void";

export interface InvoiceLine {
  description: string;         // e.g. "Starter plan, Oct 2026" or "5,000 credits"
  quantity: number;
  amount_minor: number;        // total for this line
}

export interface Invoice {
  _id: string;                 // PK. UUID v4
  org_id: string;              // FK → organizations._id
  provider: PaymentProvider;
  provider_invoice_id: string; // UNIQUE together with provider
  number?: string;             // the invoice number shown to the customer
  status: InvoiceStatus;
  currency: Currency;
  subtotal_minor: number;
  tax_minor: number;
  total_minor: number;
  lines: InvoiceLine[];
  period_start?: Date;         // for subscription invoices
  period_end?: Date;
  issued_at: Date;
  paid_at?: Date;
  pdf_url?: string;
  created_at: Date;
  updated_at: Date;
}

// ---------- credit_ledger ----------
// Every credit change except agent usage. Append-only.

export type CreditEntryType = "grant" | "purchase" | "expiry" | "adjustment";
export type CreditPool = "included" | "purchased";

export interface CreditEntry {
  _id: string;                 // PK. UUID v4
  org_id: string;              // FK → organizations._id
  type: CreditEntryType;
  idempotency_key: string;     // UNIQUE. ledgerKey(); the same change can only be applied once
  credits: number;             // positive adds, negative removes
  pool: CreditPool;            // which balance it changes
  invoice_id?: string;         // FK → invoices._id, for a purchase
  reason?: string;             // required for an adjustment
  created_by?: string;         // FK → users._id, for an adjustment; missing = the system
  created_at: Date;
}

// ---------- usage_charges ----------
// One per agent run: created at admission ("pending"), settled once when the run finishes.

export type UsageChargeStatus = "pending" | "settled";

export interface UsageCharge {
  _id: string;                 // PK = transactions._id, so a run is charged once
  org_id: string;              // FK → organizations._id, chosen at admission and charged at settlement
  status: UsageChargeStatus;
  project_id: string;          // FK → projects._id, copied from the transaction
  agent_id: string;            // FK → agents._id, copied from the transaction
  total_micros: number;        // our cost, copied from the transaction
  credits: number;             // creditsFor(total_micros)
  included: number;            // taken from included credits
  purchased: number;           // taken from purchased credits
  shortfall: number;           // not covered by the balance (0 normally)
  created_at: Date;            // admission
  settled_at?: Date;           // set with status "settled"; the amounts above are 0 until then
}

// ---------- billing_events ----------
// Raw webhook events from the payment provider. Temporary; deleted automatically.

export type BillingEventStatus = "received" | "processed" | "failed";

export interface BillingEvent {
  _id: string;                 // PK. UUID v4
  provider: PaymentProvider;
  provider_event_id: string;   // UNIQUE together with provider
  type: string;                // the provider's event name, e.g. "subscription.charged"
  payload: Record<string, unknown>; // raw body, stored as received
  status: BillingEventStatus;  // only "processed" means finished
  attempts: number;            // processing attempts so far
  error?: string;              // the last failure
  received_at: Date;
  processed_at?: Date;
  expires_at: Date;            // TTL: received_at + BILLING_EVENT_RETENTION_DAYS
}

// ---------- Helpers ----------

function assertCredits(value: number, name: string): void {
  if (!Number.isInteger(value) || value < 0) throw new Error(`${name} must be a whole number of 0 or more`);
}

// Credits an agent run costs. A run that cost us nothing costs no credits.
export function creditsFor(totalMicros: number): number {
  assertCredits(totalMicros, "totalMicros");
  return Math.ceil(totalMicros / MICROS_PER_CREDIT);
}

// Splits a charge: included credits first, then purchased. Whatever the balances can't cover
// is returned as shortfall, never dropped.
export function chargeUsage(
  credits: number,
  account: Pick<BillingAccount, "included_credits_left" | "purchased_credits_left">,
): { included: number; purchased: number; shortfall: number } {
  assertCredits(credits, "credits");
  const included = Math.min(credits, account.included_credits_left);
  const purchased = Math.min(credits - included, account.purchased_credits_left);
  return { included, purchased, shortfall: credits - included - purchased };
}

// Why a new credit period starts. Each cause is stable: the same renewal always gives the same key,
// whichever webhook event or worker reports it.
export type PeriodCause =
  | { kind: "signup"; org_id: string }
  | { kind: "subscription_period"; provider: PaymentProvider; provider_subscription_id: string; period_start: Date }
  | { kind: "subscription_ended"; provider: PaymentProvider; provider_subscription_id: string }
  | { kind: "scheduled_reset"; org_id: string; reset_at: Date };

export function causeKey(cause: PeriodCause): string {
  switch (cause.kind) {
    case "signup":
      return `signup:${cause.org_id}`;
    case "subscription_period":
      return `period:${cause.provider}:${cause.provider_subscription_id}:${cause.period_start.toISOString()}`;
    case "subscription_ended":
      return `ended:${cause.provider}:${cause.provider_subscription_id}`;
    case "scheduled_reset":
      return `reset:${cause.org_id}:${cause.reset_at.toISOString()}`;
  }
}

// The cause the account's state calls for right now, whatever triggered the check.
function expectedCause(account: BillingAccount, now: Date): PeriodCause | null {
  const sub = account.subscription;
  if (sub && account.provider && !sub.cancelled_at) {
    const ref = { provider: account.provider, provider_subscription_id: sub.provider_subscription_id };
    const ended = sub.status === "cancelled" || (sub.cancel_at_period_end && sub.current_period_end <= now);
    return ended
      ? { kind: "subscription_ended", ...ref }
      : { kind: "subscription_period", ...ref, period_start: sub.current_period_start };
  }
  return account.credits_reset_at <= now
    ? { kind: "scheduled_reset", org_id: account._id, reset_at: account.credits_reset_at }
    : null;
}

// The transition due now, or null when it has already been applied or nothing is due.
// Every trigger calls this inside its transaction; only a non-null result rolls the period.
export function dueCause(account: BillingAccount, now: Date): PeriodCause | null {
  const cause = expectedCause(account, now);
  return cause && causeKey(cause) !== account.credit_period_cause ? cause : null;
}

// The idempotency_key for a credit_ledger entry. One key per real-world change: a payment,
// the grant for one cause, the expiry of credit period N, or one manual adjustment.
export function ledgerKey(
  entry:
    | { type: "purchase"; provider: PaymentProvider; provider_payment_id: string }
    | { type: "grant"; cause: PeriodCause }
    | { type: "expiry"; org_id: string; credit_period: number }
    | { type: "adjustment"; adjustment_id: string },
): string {
  switch (entry.type) {
    case "purchase":
      return `purchase:${entry.provider}:${entry.provider_payment_id}`;
    case "grant":
      return `grant:${causeKey(entry.cause)}`;
    case "adjustment":
      return `adjustment:${entry.adjustment_id}`;
    case "expiry":
      if (!Number.isInteger(entry.credit_period) || entry.credit_period < 1)
        throw new Error("credit_period must be a whole number of 1 or more");
      return `expiry:${entry.org_id}:${entry.credit_period}`;
  }
}
