import { type FormEvent, useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { Field, Notice } from "@/components/app/page.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card.tsx";
import { Input, Label } from "@/components/ui/input.tsx";
import BrandMark from "@/shared/ui/BrandMark.tsx";
import ProviderIcon from "@/shared/ui/ProviderIcon.tsx";

import { useAuth, type OAuthProvider } from "./AuthContext.ts";

const PROVIDERS: Array<{ id: OAuthProvider; label: string }> = [
  { id: "google", label: "Continue with Google" },
];

interface StatusMessage {
  type: "error" | "success";
  text: string;
}

/* Centered card layout from the ShadcnStore sign-in page (MIT). */
export default function SignIn() {
  // The tab keeps the last workspace's name after signing out otherwise.
  useEffect(() => {
    document.title = "Sign in · Lift Off";
  }, []);

  const { signIn, signUp, signInWithOAuth, resetPassword } = useAuth();
  const [mode, setMode] = useState<"signIn" | "signUp">("signIn");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<StatusMessage | null>(null);
  const [busy, setBusy] = useState(false);

  const isSignUp = mode === "signUp";

  async function attempt(action: () => Promise<unknown>, success?: string) {
    setBusy(true);
    setStatus(null);
    try {
      await action();
      if (success) setStatus({ type: "success", text: success });
    } catch (error) {
      setStatus({
        type: "error",
        text: error instanceof Error ? error.message : "Authentication failed.",
      });
    } finally {
      setBusy(false);
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const credentials = {
      email: email.trim(),
      password,
      displayName: name.trim() || undefined,
    };
    void attempt(() => (isSignUp ? signUp(credentials) : signIn(credentials)));
  }

  function handleReset() {
    const address = email.trim();
    if (!address) {
      setStatus({
        type: "error",
        text: "Enter your email address, then choose Forgot password.",
      });
      return;
    }
    void attempt(() => resetPassword(address), `Password reset email sent to ${address}.`);
  }

  function toggleMode() {
    setMode(isSignUp ? "signIn" : "signUp");
    setStatus(null);
  }

  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-8 bg-background p-4 md:p-10">
      <Link to="/" className="flex items-center gap-3 text-md font-medium">
        <BrandMark size={28} />
        Lift Off
      </Link>

      <div className="flex w-full max-w-md flex-col gap-6">
        <Card className="shadow-md">
          <CardHeader className="flex-col items-start gap-2 text-left">
            <h1 className="text-2xl font-medium tracking-tight">
              {isSignUp ? "Create your account" : "Welcome back"}
            </h1>
            <CardDescription>
              {isSignUp
                ? "Start answering customers from your own documents."
                : "Sign in to your Lift Off workspace."}
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-6">
            <div className="grid gap-2">
              {PROVIDERS.map((provider) => (
                <Button
                  key={provider.id}
                  type="button"
                  variant="outline"
                  className="w-full"
                  onClick={() => attempt(() => signInWithOAuth(provider.id))}
                  disabled={busy}
                >
                  <ProviderIcon provider={provider.id} />
                  {provider.label}
                </Button>
              ))}
            </div>

            <div className="relative text-center text-sm after:absolute after:inset-0 after:top-1/2 after:z-0 after:border-t">
              <span className="relative z-10 bg-card px-2 text-muted-foreground">
                Or continue with email
              </span>
            </div>

            <form className="grid gap-4" onSubmit={handleSubmit}>
              {isSignUp && (
                <Field label="Name" htmlFor="name">
                  <Input
                    id="name"
                    autoComplete="name"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    disabled={busy}
                  />
                </Field>
              )}
              <Field label="Email" htmlFor="email">
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  placeholder="you@company.com"
                  required
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  disabled={busy}
                />
              </Field>
              <div className="grid gap-1.5">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password">Password</Label>
                  {!isSignUp && (
                    <Button
                      type="button"
                      variant="link"
                      className="text-sm text-muted-foreground"
                      onClick={handleReset}
                      disabled={busy}
                    >
                      Forgot password?
                    </Button>
                  )}
                </div>
                <Input
                  id="password"
                  type="password"
                  autoComplete={isSignUp ? "new-password" : "current-password"}
                  placeholder={isSignUp ? "At least 8 characters" : undefined}
                  required
                  minLength={8}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  disabled={busy}
                />
              </div>

              {status && <Notice tone={status.type}>{status.text}</Notice>}

              <Button type="submit" className="w-full" disabled={busy}>
                {busy ? "Working…" : isSignUp ? "Create account" : "Sign in"}
              </Button>
            </form>

            <p className="text-center text-sm text-muted-foreground">
              {isSignUp ? "Already have an account?" : "Don't have an account?"}{" "}
              <Button variant="link" onClick={toggleMode} disabled={busy}>
                {isSignUp ? "Sign in" : "Sign up"}
              </Button>
            </p>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
