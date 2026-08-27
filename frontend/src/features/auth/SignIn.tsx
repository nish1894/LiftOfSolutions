import { useState } from "react";
import { Link } from "react-router-dom";

import BrandMark from "../../shared/ui/BrandMark.tsx";
import ProviderIcon from "../../shared/ui/ProviderIcon.tsx";
import { useAuth, type OAuthProvider } from "./AuthContext.ts";

const PROVIDERS: Array<{ id: OAuthProvider; label: string }> = [
  { id: "google", label: "Continue with Google" },
  { id: "github", label: "Continue with GitHub" },
];

interface StatusMessage {
  type: "error" | "success";
  text: string;
}

export default function SignIn() {
  const { signIn, signUp, signInWithOAuth, resetPassword } = useAuth();
  const [mode, setMode] = useState<"signIn" | "signUp">("signIn");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<StatusMessage | null>(null);
  const [busy, setBusy] = useState(false);

  const isSignUp = mode === "signUp";

  async function handleOAuth(provider: OAuthProvider) {
    setBusy(true);
    setStatus(null);
    try {
      await signInWithOAuth(provider);
    } catch (error) {
      setStatus({
        type: "error",
        text: error instanceof Error ? error.message : "Authentication failed.",
      });
    } finally {
      setBusy(false);
    }
  }

  async function handleReset() {
    if (!email.trim()) {
      setStatus({ type: "error", text: "Enter your email address first." });
      return;
    }
    setBusy(true);
    try {
      await resetPassword(email.trim());
      setStatus({ type: "success", text: "Password reset email sent." });
    } catch (error) {
      setStatus({ type: "error", text: error instanceof Error ? error.message : "Reset failed." });
    } finally {
      setBusy(false);
    }
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setStatus(null);

    try {
      const credentials = { email: email.trim(), password };
      if (isSignUp) {
        await signUp(credentials);
      } else {
        await signIn(credentials);
      }
    } catch (error) {
      setStatus({
        type: "error",
        text: error instanceof Error ? error.message : "Authentication failed.",
      });
    } finally {
      setBusy(false);
    }
  }

  function toggleMode() {
    setMode(isSignUp ? "signIn" : "signUp");
    setStatus(null);
  }

  return (
    <main className="auth">
      <div className="brand">
        <BrandMark size={56} />

        <h1>{isSignUp ? "Create your account" : "Welcome back"}</h1>
        <p className="subtitle">
          {isSignUp ? "Sign up to start chatting." : "Sign in to continue to Lift Off Solutions."}
        </p>
      </div>

      <>
        <div className="providers">
          {PROVIDERS.map((provider) => (
            <button
              key={provider.id}
              type="button"
              className="provider"
              onClick={() => handleOAuth(provider.id)}
              disabled={busy}
            >
              <span className="provider-icon">
                <ProviderIcon provider={provider.id} />
              </span>
              <span>{provider.label}</span>
            </button>
          ))}
        </div>

        <div className="divider">
          <span>or</span>
        </div>
      </>

      <form onSubmit={handleSubmit}>
        <div className="field">
          <label htmlFor="email">Email</label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            placeholder="you@example.com"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            disabled={busy}
          />
        </div>

        <div className="field">
          <label htmlFor="password">Password</label>
          <input
            id="password"
            type="password"
            autoComplete={isSignUp ? "new-password" : "current-password"}
            placeholder={isSignUp ? "At least 8 characters" : "••••••••"}
            required
            minLength={8}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            disabled={busy}
          />
        </div>

        <button type="submit" className="submit" disabled={busy}>
          {busy ? "Working…" : isSignUp ? "Create account" : "Sign in"}
        </button>
      </form>

      {!isSignUp && (
        <button type="button" className="link" onClick={handleReset} disabled={busy}>
          Forgot password?
        </button>
      )}

      {status && (
        <p className={`status ${status.type}`} role="status">
          {status.text}
        </p>
      )}

      <p className="switch">
        {isSignUp ? "Already have an account?" : "New here?"}{" "}
        <button type="button" className="link" onClick={toggleMode} disabled={busy}>
          {isSignUp ? "Sign in" : "Create one"}
        </button>
      </p>

      <Link className="link back" to="/">
        ← Back to home
      </Link>
    </main>
  );
}
