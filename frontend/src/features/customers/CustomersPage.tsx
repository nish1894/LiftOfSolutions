import { type FormEvent, useState } from "react";
import { Link } from "react-router-dom";
import { ContactIcon, PlusIcon } from "lucide-react";
import { toast } from "sonner";

import {
  EmptyState,
  Field,
  LoadError,
  LoadingRows,
  Notice,
  PageContainer,
  PageHeader,
} from "@/components/app/page.tsx";
import { StatusPill } from "@/components/app/status-pill.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Card } from "@/components/ui/card.tsx";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  SheetContent,
} from "@/components/ui/dialog.tsx";
import { Input } from "@/components/ui/input.tsx";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table.tsx";
import { NoAccess } from "@/features/shell/NotFound.tsx";
import { CONTACT_LIMIT, useCustomers } from "@/features/workspace/resources.ts";
import { useOrgMutation, useOrgQuery, useWorkspace } from "@/features/workspace/workspace.ts";
import { timeAgo } from "@/lib/utils.ts";
import { CONVERSATION_STATUS } from "@/shared/statuses.ts";
import type { ApiTime, Customer } from "@/shared/types.ts";
import { useAction } from "@/shared/useAction.ts";

export default function CustomersPage() {
  const { can } = useWorkspace();
  const customers = useCustomers();
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Customer | null>(null);

  if (!can("customers.view")) return <NoAccess what="contacts" />;

  const term = search.trim().toLowerCase();
  const rows = (customers.data ?? []).filter((item) =>
    [item.display_name, item.email, item.phone].some((value) =>
      value?.toLowerCase().includes(term),
    ),
  );

  return (
    <PageContainer>
      <PageHeader
        title="Contacts"
        description="People who have contacted your support channels."
        actions={can("customers.manage") && <AddCustomerDialog />}
      />

      <div className="mb-4 max-w-sm">
        <label htmlFor="customer-search" className="sr-only">
          Search contacts
        </label>
        <Input
          id="customer-search"
          type="search"
          placeholder="Search by name, email or phone"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      </div>

      {(customers.data ?? []).length >= CONTACT_LIMIT && (
        <p className="mb-3 text-sm text-muted-foreground">
          Showing the first {CONTACT_LIMIT} contacts. Search covers only these.
        </p>
      )}
      <Card>
        {customers.isLoading ? (
          <LoadingRows />
        ) : customers.isError ? (
          <LoadError className="m-5" what="contacts" query={customers} />
        ) : rows.length === 0 ? (
          <EmptyState
            className="m-5"
            icon={ContactIcon}
            title={term ? "No contacts match your search" : "No contacts yet"}
            description={
              term
                ? "Try a different name or email."
                : "Contacts appear here when they start a chat."
            }
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Added</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((customer) => (
                <TableRow key={customer.id}>
                  <TableCell>
                    <button
                      type="button"
                      className="font-medium hover:underline"
                      onClick={() => setSelected(customer)}
                    >
                      {customer.display_name || "Unnamed contact"}
                    </button>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{customer.email || "—"}</TableCell>
                  <TableCell className="text-muted-foreground">{customer.phone || "—"}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {timeAgo(customer.created_at)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      <Dialog open={Boolean(selected)} onOpenChange={(open) => !open && setSelected(null)}>
        <SheetContent aria-describedby={undefined}>
          {selected && <CustomerDetails customer={selected} />}
        </SheetContent>
      </Dialog>
    </PageContainer>
  );
}

interface HistoryItem {
  id: string;
  status?: string;
  lastMessageAt?: ApiTime;
}

function CustomerDetails({ customer }: { customer: Customer }) {
  const history = useOrgQuery<HistoryItem[]>(
    ["customerHistory", customer.id],
    `/customers/${customer.id}/history`,
    [],
  );

  return (
    <div className="grid gap-6 p-5">
      <div className="grid gap-1 pr-6">
        <DialogTitle>{customer.display_name || "Unnamed contact"}</DialogTitle>
        <p className="text-sm text-muted-foreground">
          {[customer.email, customer.phone].filter(Boolean).join(" · ") || "No contact details"}
        </p>
      </div>
      <section className="grid gap-2">
        <h3 className="text-xs font-medium text-muted-foreground">Conversations</h3>
        {history.isLoading && <LoadingRows />}
        {!history.isLoading && (history.data ?? []).length === 0 && (
          <p className="text-sm text-muted-foreground">No conversations yet.</p>
        )}
        <ul className="grid gap-2">
          {(history.data ?? []).map((item) => (
            <li key={item.id}>
              <Link
                to={`/app/inbox/${item.id}`}
                className="flex items-center justify-between gap-2 rounded-md border px-3 py-2 hover:bg-muted"
              >
                <StatusPill map={CONVERSATION_STATUS} value={item.status} />
                <span className="text-xs text-muted-foreground">{timeAgo(item.lastMessageAt)}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function AddCustomerDialog() {
  const { request, invalidate } = useOrgMutation();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", phone: "" });

  const save = useAction(async () => {
    await request("/customers", {
      method: "POST",
      body: {
        ...(form.name.trim() ? { display_name: form.name.trim() } : {}),
        ...(form.email.trim() ? { email: form.email.trim() } : {}),
        ...(form.phone.trim() ? { phone: form.phone.trim() } : {}),
      },
    });
    await invalidate("customers");
    toast.success("Contact added");
    setForm({ name: "", email: "", phone: "" });
    setOpen(false);
  });

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void save.run();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <PlusIcon />
          Add contact
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add a contact</DialogTitle>
          <DialogDescription>
            Only the name is needed; contact details are optional.
          </DialogDescription>
        </DialogHeader>
        <form className="grid gap-4" onSubmit={submit}>
          <Field label="Name" htmlFor="customer-name">
            <Input
              id="customer-name"
              required
              value={form.name}
              onChange={(event) => setForm({ ...form, name: event.target.value })}
            />
          </Field>
          <Field label="Email" htmlFor="customer-email">
            <Input
              id="customer-email"
              type="email"
              value={form.email}
              onChange={(event) => setForm({ ...form, email: event.target.value })}
            />
          </Field>
          <Field label="Phone" htmlFor="customer-phone">
            <Input
              id="customer-phone"
              value={form.phone}
              onChange={(event) => setForm({ ...form, phone: event.target.value })}
            />
          </Field>
          {save.error && <Notice tone="error">{save.error}</Notice>}
          <DialogFooter>
            <Button type="submit" disabled={save.busy}>
              {save.busy ? "Adding…" : "Add contact"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
