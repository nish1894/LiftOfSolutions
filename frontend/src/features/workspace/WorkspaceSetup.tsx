import { type FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";

import { Field, Notice } from "@/components/app/page.tsx";
import { Avatar } from "@/components/ui/avatar.tsx";
import { Button } from "@/components/ui/button.tsx";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card.tsx";
import { Input } from "@/components/ui/input.tsx";
import { useAuth } from "@/features/auth/AuthContext.ts";
import NotificationBell from "@/features/notifications/NotificationBell.tsx";
import { apiRequest } from "@/shared/api/client.ts";
import BrandMark from "@/shared/ui/BrandMark.tsx";
import { useAction } from "@/shared/useAction.ts";

/** Shown when a signed-in user belongs to no organization yet. */
export default function WorkspaceSetup() {
  const { user, joinRequests, refreshAuth, signOut } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [joinCode, setJoinCode] = useState("");

  const create = useAction(async () => {
    await apiRequest("/api/v1/businesses", { method: "POST", body: { name: name.trim() } });
    await refreshAuth();
  });
  const join = useAction(async () => {
    await apiRequest("/api/v1/businesses/join-requests", {
      method: "POST",
      body: { join_code: joinCode.trim() },
    });
    setJoinCode("");
    await refreshAuth();
  });

  if (!user) return null;
  const pending = joinRequests.filter((item) => item.status === "PENDING");

  async function handleSignOut() {
    await signOut();
    navigate("/", { replace: true });
  }

  function submitCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void create.run();
  }

  function submitJoin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void join.run();
  }

  return (
    <div className="min-h-dvh bg-muted/50">
      <header className="flex h-14 items-center gap-3 border-b bg-background px-4 md:px-6">
        <BrandMark size={28} />
        <span className="font-semibold">Lift Off Solutions</span>
        <div className="ml-auto flex items-center gap-2">
          {/* An applicant waiting for approval has no workspace yet, so the
              approval notification has to be reachable here too. */}
          <NotificationBell onChanged={refreshAuth} />
          <Avatar name={user.display_name || user.email} src={user.photo_url} />
          <span className="hidden text-sm text-muted-foreground sm:inline">{user.email}</span>
          <Button variant="ghost" size="sm" onClick={handleSignOut}>
            Sign out
          </Button>
        </div>
      </header>

      <main className="mx-auto grid max-w-3xl gap-6 px-4 py-10">
        <div className="grid gap-1">
          <h1 className="text-lg font-semibold">Set up your workspace</h1>
          <p className="text-sm text-muted-foreground">
            Create an organization for your team, or ask to join one that already exists.
          </p>
        </div>

        {pending.length > 0 && (
          <Notice tone="info">
            Waiting for approval from {pending.map((item) => item.organization_name).join(", ")}.
            <Button variant="link" onClick={() => refreshAuth()}>
              Check again
            </Button>
          </Notice>
        )}

        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader>
              <div className="grid gap-1">
                <CardTitle>Create an organization</CardTitle>
                <CardDescription>You'll be its Prime user, with full access.</CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              <form className="grid gap-3" onSubmit={submitCreate}>
                <Field label="Organization name" htmlFor="workspace-name">
                  <Input
                    id="workspace-name"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    placeholder="Acme Support"
                    minLength={2}
                    required
                    disabled={create.busy}
                  />
                </Field>
                {create.error && <Notice tone="error">{create.error}</Notice>}
                <Button type="submit" disabled={create.busy}>
                  {create.busy ? "Creating…" : "Create organization"}
                </Button>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="grid gap-1">
                <CardTitle>Join an organization</CardTitle>
                <CardDescription>
                  Enter the join code an administrator shared with you.
                </CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              <form className="grid gap-3" onSubmit={submitJoin}>
                <Field label="Join code" htmlFor="join-code">
                  <Input
                    id="join-code"
                    className="font-mono uppercase"
                    value={joinCode}
                    onChange={(event) => setJoinCode(event.target.value.toUpperCase())}
                    placeholder="A1B2C3D4E5"
                    minLength={6}
                    required
                    disabled={join.busy}
                  />
                </Field>
                {join.error && <Notice tone="error">{join.error}</Notice>}
                <Button type="submit" variant="outline" disabled={join.busy}>
                  {join.busy ? "Sending request…" : "Request access"}
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
