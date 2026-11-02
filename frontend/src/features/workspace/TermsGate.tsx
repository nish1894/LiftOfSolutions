import { useState } from "react";
import { Button } from "@/components/ui/button.tsx";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { Checkbox } from "@/components/ui/input.tsx";
import { useAuth } from "@/features/auth/AuthContext.ts";

export default function TermsGate({ version, url }: { version: string; url: string | null }) {
  const { acceptTerms, signOut } = useAuth();
  const [checked, setChecked] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  return (
    <main className="grid min-h-dvh place-items-center bg-background p-4">
      <Card className="w-full max-w-lg">
        <CardHeader>
          <CardTitle>Continue to your workspace</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          <p className="text-sm text-muted-foreground">
            Confirm the current platform terms before using your organization.
          </p>
          <label className="flex items-center gap-3 text-sm">
            <Checkbox checked={checked} onChange={(event) => setChecked(event.target.checked)} />
            <span>
              I accept the{" "}
              {url ? (
                <a href={url} target="_blank" rel="noreferrer" className="font-medium underline">
                  platform terms
                </a>
              ) : (
                "platform terms"
              )}{" "}
              ({version}).
            </span>
          </label>
          {error && (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          )}
          <div className="flex gap-3">
            <Button
              disabled={!checked || pending}
              onClick={async () => {
                setPending(true);
                setError("");
                try {
                  await acceptTerms(version);
                } catch (cause) {
                  setError((cause as Error).message);
                } finally {
                  setPending(false);
                }
              }}
            >
              Continue
            </Button>
            <Button variant="outline" onClick={() => void signOut()}>
              Sign out
            </Button>
          </div>
        </CardContent>
      </Card>
    </main>
  );
}
