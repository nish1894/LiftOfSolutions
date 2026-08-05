import { useState } from "react";

import { supabase } from "../lib/supabase.js";
import BrandMark from "./BrandMark.jsx";
import ProviderIcon from "./ProviderIcon.jsx";

const PROVIDERS = [
  { id: "google", label: "Continue with Google" },
  { id: "github", label: "Continue with GitHub" },
];

export default function SignIn({ onBack }) {
  const [mode, setMode] = useState("signIn");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState(false);

  const isSignUp = mode === "signUp";

  async function handleOAuth(provider) {
    setBusy(true);
    setStatus(null);

    // Return to the page we are actually on, not the origin root: Vite serves
    // the app under base "/static/" in dev, while FastAPI serves it at "/" in
    // production. origin alone would 404 in dev.
    const redirectTo = `${window.location.origin}${window.location.pathname}`;

    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo },
    });

    // On success the browser leaves the page, so only the failure path unwinds.
    if (error) {
      setStatus({ type: "error", text: error.message });
      setBusy(false);
    }
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setBusy(true);
    setStatus(null);

    const credentials = { email: email.trim(), password };
    const { data, error } = isSignUp
      ? await supabase.auth.signUp(credentials)
      : await supabase.auth.signInWithPassword(credentials);

    if (error) {
      setStatus({ type: "error", text: error.message });
    } else if (isSignUp && !data.session) {
      // Email confirmation is on, so no session is issued until they click through.
      setStatus({ type: "info", text: "Check your inbox to confirm your address." });
    }

    // A successful sign-in unmounts this component via onAuthStateChange.
    setBusy(false);
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
            placeholder={isSignUp ? "At least 6 characters" : "••••••••"}
            required
            minLength={6}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            disabled={busy}
          />
        </div>

        <button type="submit" className="submit" disabled={busy}>
          {busy ? "Working…" : isSignUp ? "Create account" : "Sign in"}
        </button>
      </form>

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

      {onBack && (
        <button type="button" className="link back" onClick={onBack} disabled={busy}>
          ← Back to home
        </button>
      )}
    </main>
  );
}
