import { useQuery } from "@tanstack/react-query";
import { useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";

import { Notice } from "@/components/app/page.tsx";
import { Button } from "@/components/ui/button.tsx";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog.tsx";
import { useAuth } from "@/features/auth/AuthContext.ts";
import { acceptInvitation, previewInvitation } from "@/features/auth/api.ts";
import { ROLE_LABELS } from "@/shared/permissions.ts";
import { useAction } from "@/shared/useAction.ts";

/* Someone already signed in opened an invitation link (?invite=). Joining
   closes their current workspace and leaves its projects behind, so they
   read what it means and choose; nothing changes until they press Join. */
export default function JoinInvitationDialog() {
  const [params, setParams] = useSearchParams();
  const token = params.get("invite");
  const { refreshAuth } = useAuth();
  const navigate = useNavigate();
  const preview = useQuery({
    queryKey: ["invitationPreview", token],
    queryFn: () => previewInvitation(token!),
    enabled: Boolean(token),
    retry: false,
  });

  const close = () =>
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        next.delete("invite");
        return next;
      },
      { replace: true },
    );

  const join = useAction(async () => {
    await acceptInvitation(token!);
    await refreshAuth();
    toast.success(`You joined ${preview.data?.organization_name}`);
    close();
    navigate("/app/overview");
  });

  if (!token) return null;
  const details = preview.data;
  const projects = details?.projects_left_behind ?? 0;

  return (
    <Dialog open onOpenChange={(open) => !open && close()}>
      <DialogContent>
        {preview.isLoading && (
          <DialogHeader>
            <DialogTitle>Checking the invitation…</DialogTitle>
            <DialogDescription>This takes a moment.</DialogDescription>
          </DialogHeader>
        )}

        {preview.isError && (
          <>
            <DialogHeader>
              <DialogTitle>This invitation can't be used</DialogTitle>
              <DialogDescription>
                {preview.error instanceof Error ? preview.error.message : "Ask for a new link."}
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button onClick={close}>Close</Button>
            </DialogFooter>
          </>
        )}

        {details?.already_member && (
          <>
            <DialogHeader>
              <DialogTitle>You're already in {details.organization_name}</DialogTitle>
              <DialogDescription>There's nothing to accept.</DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button onClick={close}>Close</Button>
            </DialogFooter>
          </>
        )}

        {details && !details.already_member && (
          <>
            <DialogHeader>
              <DialogTitle>Join {details.organization_name}?</DialogTitle>
              <DialogDescription>
                You'll join as {ROLE_LABELS[details.role] ?? details.role}. You can belong to one
                organization at a time.
              </DialogDescription>
            </DialogHeader>
            <Notice tone="warning">
              {details.current_organization_name} will close.{" "}
              {projects === 0
                ? "It has no projects."
                : `Its ${projects} ${projects === 1 ? "project stays" : "projects stay"} there, and you won't be able to open ${projects === 1 ? "it" : "them"}.`}
            </Notice>
            {join.error && <Notice tone="error">{join.error}</Notice>}
            <DialogFooter>
              <Button variant="outline" onClick={close} disabled={join.busy}>
                Not now
              </Button>
              <Button onClick={() => join.run()} disabled={join.busy}>
                {join.busy ? "Joining…" : `Join ${details.organization_name}`}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
