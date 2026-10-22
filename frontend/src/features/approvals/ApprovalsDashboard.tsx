import { useState } from "react";
import { LockIcon, UserCheckIcon } from "lucide-react";

import { EmptyState, Stat } from "@/components/app/page.tsx";
import { StatusPill } from "@/components/app/status-pill.tsx";
import { Avatar } from "@/components/ui/avatar.tsx";
import { Button } from "@/components/ui/button.tsx";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card.tsx";
import { NativeSelect } from "@/components/ui/input.tsx";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table.tsx";
import { timeAgo } from "@/lib/utils.ts";
import { ROLE_LABELS } from "@/shared/permissions.ts";
import { RECORD_STATUS } from "@/shared/statuses.ts";
import type { JoinRequest, Membership, Role } from "@/shared/types.ts";

export type Decision = "APPROVED" | "REJECTED";
export type ReviewHandler = (requestId: string, decision: Decision, role: Role) => Promise<void>;

const ROLES: Role[] = ["OWNER", "ADMIN", "AGENT", "VIEWER", "CUSTOM"];
const DEFAULT_ROLE: Role = "AGENT";

interface PendingRequestProps {
  request: JoinRequest;
  isPrime: boolean;
  onReview: ReviewHandler;
}

function PendingRequest({ request, isPrime, onReview }: PendingRequestProps) {
  // Held per row so approving one request cannot disable or mis-role another.
  const [role, setRole] = useState(DEFAULT_ROLE);
  const [busy, setBusy] = useState<Decision | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function review(decision: Decision) {
    setBusy(decision);
    setError(null);
    try {
      await onReview(request.id, decision, role);
    } catch (requestError) {
      // Without this the button silently re-enabled and nothing happened,
      // which is indistinguishable from the feature being broken.
      setError((requestError as Error).message || "The decision could not be saved.");
      setBusy(null);
    }
  }

  const roles = isPrime ? ROLES : ROLES.filter((item) => item !== "OWNER");

  return (
    <li className="grid gap-2 px-5 py-3">
      <div className="flex flex-wrap items-center gap-3">
        <Avatar name={request.display_name || request.email} />
        <div className="grid min-w-0 flex-1">
          <span className="truncate font-medium">{request.display_name || request.email}</span>
          <span className="truncate text-sm text-muted-foreground">
            {request.email} · Requested {timeAgo(request.requested_at)}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <span>Role</span>
            <NativeSelect
              className="h-8 w-28"
              value={role}
              onChange={(event) => setRole(event.target.value as Role)}
              disabled={Boolean(busy)}
            >
              {roles.map((item) => (
                <option key={item} value={item}>
                  {ROLE_LABELS[item]}
                </option>
              ))}
            </NativeSelect>
          </label>
          <Button size="sm" disabled={Boolean(busy)} onClick={() => review("APPROVED")}>
            {busy === "APPROVED" ? "Approving…" : "Approve"}
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={Boolean(busy)}
            onClick={() => review("REJECTED")}
          >
            {busy === "REJECTED" ? "Rejecting…" : "Reject"}
          </Button>
        </div>
      </div>
      {error && (
        <p className="text-sm text-danger" role="alert">
          {error}
        </p>
      )}
    </li>
  );
}

export interface ApprovalsDashboardProps {
  membership: Pick<Membership, "role">;
  joinRequests: JoinRequest[];
  canManage: boolean;
  onReview: ReviewHandler;
}

export default function ApprovalsDashboard({
  membership,
  joinRequests,
  canManage,
  onReview,
}: ApprovalsDashboardProps) {
  if (!canManage) {
    return (
      <EmptyState
        icon={LockIcon}
        title="You can't review access requests"
        description="Only Prime and delegated managers can review access requests."
      />
    );
  }

  const pending = joinRequests.filter((item) => item.status === "PENDING");
  const decided = joinRequests.filter((item) => item.status !== "PENDING").slice(0, 10);
  const countOf = (status: string) => joinRequests.filter((item) => item.status === status).length;
  const isPrime = membership.role === "PRIME";

  return (
    <div className="grid gap-6">
      <dl className="grid gap-3 sm:grid-cols-3">
        <Stat label="Waiting for a decision" value={pending.length} />
        <Stat label="Approved" value={countOf("APPROVED")} />
        <Stat label="Rejected" value={countOf("REJECTED")} />
      </dl>

      <Card>
        <CardHeader>
          <div className="grid gap-1">
            <CardTitle>Waiting for a decision</CardTitle>
            <CardDescription>
              Approving adds the person as an active member straight away. The role defaults to
              Agent, so approving is one click unless you want to change it.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="p-0 pt-4">
          {pending.length === 0 ? (
            <EmptyState
              className="m-5 mt-0"
              icon={UserCheckIcon}
              title="No one is waiting for access"
              description="Share the join code from Settings to invite someone."
            />
          ) : (
            <ul className="divide-y border-t">
              {pending.map((request) => (
                <PendingRequest
                  key={request.id}
                  request={request}
                  isPrime={isPrime}
                  onReview={onReview}
                />
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {decided.length > 0 && (
        <Card>
          <CardHeader>
            <div className="grid gap-1">
              <CardTitle>Recent decisions</CardTitle>
              <CardDescription>The last requests you and other managers reviewed.</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="p-0 pt-4">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Person</TableHead>
                  <TableHead>Decision</TableHead>
                  <TableHead>Reviewed</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {decided.map((request) => (
                  <TableRow key={request.id}>
                    <TableCell>
                      <span className="block font-medium">
                        {request.display_name || request.email}
                      </span>
                      <span className="text-xs text-muted-foreground">{request.email}</span>
                    </TableCell>
                    <TableCell>
                      <StatusPill map={RECORD_STATUS} value={request.status} />
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {timeAgo(request.reviewed_at)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
