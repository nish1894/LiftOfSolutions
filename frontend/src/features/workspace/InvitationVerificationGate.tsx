import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";

import { Button } from "@/components/ui/button.tsx";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { useAuth } from "@/features/auth/AuthContext.ts";
import { previewInvitation } from "@/features/auth/api.ts";
import { ApiError } from "@/shared/api/client.ts";

/* Someone whose email isn't verified opened an invitation link. The API checks
   the link before the email, so ask it first: a dead link says so and lets them
   carry on; a good one waits for verification. Either way they can leave the
   invitation for later. */
export default function InvitationVerificationGate() {
  const { user, refreshAuth, resendVerification, signOut } = useAuth();
  const [params, setParams] = useSearchParams();
  const token = params.get("invite") ?? "";
  // Its own key: JoinInvitationDialog must ask again once the email is verified.
  const check = useQuery({
    queryKey: ["invitationCheck", token],
    queryFn: () => previewInvitation(token),
    retry: false,
  });
  const unusable = check.error instanceof ApiError && check.error.code === "invitation_invalid";
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const leave = () =>
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        next.delete("invite");
        return next;
      },
      { replace: true },
    );

  async function run(action: () => Promise<unknown>, success = "") {
    setBusy(true);
    setMessage("");
    try {
      await action();
      setMessage(success);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not verify the invitation.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="grid min-h-dvh place-items-center bg-background p-4">
      <Card className="w-full max-w-lg">
        {check.isLoading ? (
          <CardHeader>
            <CardTitle>Checking the invitation…</CardTitle>
          </CardHeader>
        ) : unusable ? (
          <>
            <CardHeader>
              <CardTitle>This invitation can't be used</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4">
              <p className="text-sm text-muted-foreground">{(check.error as ApiError).message}</p>
              <div className="flex flex-wrap gap-2">
                <Button onClick={leave}>Continue to my workspace</Button>
              </div>
            </CardContent>
          </>
        ) : (
          <>
            <CardHeader>
              <CardTitle>Verify your email to join</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4">
              <p className="text-sm text-muted-foreground">
                The invitation is addressed to a verified email. Check {user?.email}, then return
                here. You can also open the link again later.
              </p>
              {message && (
                <p className="text-sm" role="status">
                  {message}
                </p>
              )}
              <div className="flex flex-wrap gap-2">
                <Button disabled={busy} onClick={() => void run(refreshAuth)}>
                  I've verified my email
                </Button>
                <Button
                  variant="outline"
                  disabled={busy}
                  onClick={() => void run(resendVerification, "Verification email sent.")}
                >
                  Resend email
                </Button>
                <Button variant="ghost" disabled={busy} onClick={leave}>
                  Not now
                </Button>
                <Button variant="ghost" disabled={busy} onClick={() => void signOut()}>
                  Sign out
                </Button>
              </div>
            </CardContent>
          </>
        )}
      </Card>
    </main>
  );
}
