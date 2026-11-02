import { type FormEvent, useState } from "react";
import { InfoIcon, ReceiptIcon, SparklesIcon } from "lucide-react";
import { toast } from "sonner";

import {
  EmptyState,
  Field,
  LoadError,
  LoadingRows,
  Notice,
  PageContainer,
} from "@/components/app/page.tsx";
import { Pill } from "@/components/app/status-pill.tsx";
import { Button } from "@/components/ui/button.tsx";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card.tsx";
import { Input } from "@/components/ui/input.tsx";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table.tsx";
import SettingsHeader from "@/features/settings/SettingsHeader.tsx";
import { NoAccess } from "@/features/shell/NotFound.tsx";
import { useOrgMutation, useOrgQuery, useWorkspace } from "@/features/workspace/workspace.ts";
import { formatNumber, pickText, sentenceCase, toDate } from "@/lib/utils.ts";
import type { BillingProfile, Subscription } from "@/shared/types.ts";
import { useAction } from "@/shared/useAction.ts";

type Invoice = Record<string, unknown>;

/** GET /billing/account: the credit balances and the plan they come from. */
interface CreditAccount {
  included_credits_left: number;
  purchased_credits_left: number;
  credits_reset_at: string;
  plan: { monthly_credits: number };
}

/* Card layout from the template's Plans & Billing page (MIT): current plan,
   then details and billing history side by side. */
export default function BillingPage() {
  const { can } = useWorkspace();
  const allowed = can("billing.view");
  const subscription = useOrgQuery<Subscription | null>(
    ["billing", "subscription"],
    "/billing/subscription",
    null,
    { enabled: allowed },
  );
  const profile = useOrgQuery<BillingProfile | null>(
    ["billing", "profile"],
    "/billing/profile",
    null,
    { enabled: allowed },
  );
  const invoices = useOrgQuery<Invoice[]>(["billing", "invoices"], "/billing/invoices", [], {
    enabled: allowed,
  });
  const account = useOrgQuery<CreditAccount | null>(
    ["billing", "account"],
    "/billing/account",
    null,
    {
      enabled: allowed,
    },
  );

  if (!allowed) return <NoAccess what="billing" />;

  const plan =
    sentenceCase(subscription.data?.plan_code ?? subscription.data?.planCode) || "No plan";
  const notConfigured = !subscription.data || subscription.data.status === "NOT_CONFIGURED";

  return (
    <PageContainer>
      <SettingsHeader description="Your plan, your credits, and billing details." />

      <div className="mb-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <div className="grid gap-1">
              <CardTitle>Current plan</CardTitle>
              <CardDescription>You're on the {plan} plan.</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="grid gap-4">
            {subscription.isLoading ? (
              <LoadingRows />
            ) : subscription.isError ? (
              <LoadError what="the plan" query={subscription} />
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                <SparklesIcon className="size-5 text-primary" aria-hidden="true" />
                <span className="text-lg font-semibold">{plan}</span>
                <Pill tone={notConfigured ? "neutral" : "success"}>
                  {sentenceCase(subscription.data?.status) || "Not configured"}
                </Pill>
              </div>
            )}
            {notConfigured && !subscription.isError && (
              <div className="flex items-start gap-3 rounded-lg border bg-muted/50 p-4">
                <InfoIcon className="mt-0.5 size-5 text-muted-foreground" aria-hidden="true" />
                <div className="grid gap-1">
                  <p className="font-medium">Nothing to pay yet</p>
                  <p className="text-sm text-muted-foreground">
                    Payments aren't connected for this organization, so there are no charges.
                  </p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="grid gap-1">
              <CardTitle>Credits</CardTitle>
              <CardDescription>
                {account.data
                  ? `Included credits renew on ${toDate(account.data.credits_reset_at)?.toLocaleDateString() ?? "—"}.`
                  : "Each AI reply uses credits."}
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            {account.isLoading ? (
              <LoadingRows />
            ) : account.isError || !account.data ? (
              <LoadError what="credits" query={account} />
            ) : (
              <dl className="grid grid-cols-2 gap-4">
                <div className="grid gap-1 rounded-lg border p-4">
                  <dt className="text-sm text-muted-foreground">Included left</dt>
                  <dd className="text-xl font-semibold tabular-nums">
                    {formatNumber(account.data.included_credits_left)}
                    <span className="text-sm font-normal text-muted-foreground">
                      {" "}
                      of {formatNumber(account.data.plan.monthly_credits)}
                    </span>
                  </dd>
                </div>
                <div className="grid gap-1 rounded-lg border p-4">
                  <dt className="text-sm text-muted-foreground">Used this period</dt>
                  <dd className="text-xl font-semibold tabular-nums">
                    {formatNumber(
                      Math.max(
                        0,
                        account.data.plan.monthly_credits - account.data.included_credits_left,
                      ),
                    )}
                  </dd>
                </div>
                <div className="grid gap-1 rounded-lg border p-4">
                  <dt className="text-sm text-muted-foreground">Purchased left</dt>
                  <dd className="text-xl font-semibold tabular-nums">
                    {formatNumber(account.data.purchased_credits_left)}
                  </dd>
                </div>
              </dl>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {profile.isLoading ? (
          <LoadingRows />
        ) : profile.isError ? (
          <LoadError what="billing details" query={profile} />
        ) : (
          <BillingProfileForm
            key={profile.dataUpdatedAt}
            profile={profile.data ?? null}
            editable={can("billing.manage")}
          />
        )}

        <Card>
          <CardHeader>
            <div className="grid gap-1">
              <CardTitle>Billing history</CardTitle>
              <CardDescription>Invoices for this organization</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="p-0 pt-4">
            {invoices.isLoading ? (
              <LoadingRows />
            ) : invoices.isError ? (
              <LoadError what="invoices" query={invoices} />
            ) : (invoices.data ?? []).length === 0 ? (
              <EmptyState className="m-6 mt-0" icon={ReceiptIcon} title="No invoices yet" />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Invoice</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(invoices.data ?? []).map((invoice, index) => (
                    <TableRow key={pickText(invoice, ["id"]) || index}>
                      <TableCell className="font-mono text-xs">
                        {pickText(invoice, ["number", "id"])}
                      </TableCell>
                      <TableCell>
                        {toDate(invoice.createdAt ?? invoice.created_at)?.toLocaleDateString() ??
                          "—"}
                      </TableCell>
                      <TableCell>{sentenceCase(pickText(invoice, ["status"])) || "—"}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {pickText(invoice, ["total", "amount", "amountDue"]) || "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </PageContainer>
  );
}

function BillingProfileForm({
  profile,
  editable,
}: {
  profile: BillingProfile | null;
  editable: boolean;
}) {
  const { request, invalidate } = useOrgMutation();
  const [legalName, setLegalName] = useState(profile?.legal_name ?? "");
  const [billingEmail, setBillingEmail] = useState(profile?.email ?? "");

  const save = useAction(async () => {
    await request("/billing/profile", {
      method: "PATCH",
      body: { legal_name: legalName.trim() || null, email: billingEmail.trim() || null },
    });
    await invalidate("billing", "profile");
    toast.success("Billing details saved");
  });

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void save.run();
  }

  return (
    <Card>
      <CardHeader>
        <div className="grid gap-1">
          <CardTitle>Billing details</CardTitle>
          <CardDescription>Used on invoices once payments are connected.</CardDescription>
        </div>
      </CardHeader>
      <CardContent>
        <form className="grid gap-4" onSubmit={submit}>
          <Field label="Legal name" htmlFor="billing-legal-name">
            <Input
              id="billing-legal-name"
              value={legalName}
              onChange={(event) => setLegalName(event.target.value)}
              disabled={!editable}
            />
          </Field>
          <Field label="Billing email" htmlFor="billing-email">
            <Input
              id="billing-email"
              type="email"
              value={billingEmail}
              onChange={(event) => setBillingEmail(event.target.value)}
              disabled={!editable}
            />
          </Field>
          {save.error && <Notice tone="error">{save.error}</Notice>}
          {editable ? (
            <Button type="submit" className="justify-self-start" disabled={save.busy}>
              {save.busy ? "Saving…" : "Save billing details"}
            </Button>
          ) : (
            <p className="text-sm text-muted-foreground">Only owners can change billing details.</p>
          )}
        </form>
      </CardContent>
    </Card>
  );
}
