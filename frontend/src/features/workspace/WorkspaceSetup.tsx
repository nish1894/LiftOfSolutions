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
import { apiRequest } from "@/shared/api/client.ts";
import { hasPermission } from "@/shared/permissions.ts";
import BrandMark from "@/shared/ui/BrandMark.tsx";
import { useAction } from "@/shared/useAction.ts";

/** Every account already has an organization; create its first project here. */
export default function WorkspaceSetup() {
  const { user, memberships, refreshAuth, signOut } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const membership = memberships[0];
  // Only owners and admins create projects; a member waits to be added to one.
  const canCreate = membership ? hasPermission(membership, "projects.create") : false;
  const create = useAction(async () => {
    if (!membership) return;
    await apiRequest(`/api/v1/organizations/${membership.organization_id}/projects`, {
      method: "POST",
      body: { name: name.trim() },
    });
    await refreshAuth();
  });
  if (!user) return null;

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void create.run();
  }

  return (
    <div className="min-h-dvh bg-background">
      <header className="flex h-14 items-center gap-3 border-b bg-background px-4 md:px-6">
        <BrandMark size={28} />
        <span className="font-semibold">Lift Off</span>
        <div className="ml-auto flex items-center gap-2">
          <Avatar name={user.display_name || user.email} src={user.photo_url} />
          <span className="hidden text-sm text-muted-foreground sm:inline">{user.email}</span>
          <Button
            variant="ghost"
            size="sm"
            onClick={async () => {
              await signOut();
              navigate("/", { replace: true });
            }}
          >
            Sign out
          </Button>
        </div>
      </header>
      <main className="mx-auto max-w-xl px-4 py-10">
        <Card>
          <CardHeader>
            <CardTitle>
              {!membership
                ? "Workspace unavailable"
                : canCreate
                  ? "Create your first project"
                  : "No projects yet"}
            </CardTitle>
            <CardDescription>
              {!membership
                ? "Your account has no active organization. Refresh the page or contact support."
                : canCreate
                  ? `Your organization, ${membership.organization_name}, is ready. Projects keep your agents, contacts, and inbox together.`
                  : `You're a member of ${membership.organization_name}, but not of any project yet. Ask an owner or admin to add you to one, then refresh this page.`}
            </CardDescription>
          </CardHeader>
          {membership && canCreate && (
            <CardContent>
              <form className="grid gap-4" onSubmit={submit}>
                <Field label="Project name" htmlFor="project-name">
                  <Input
                    id="project-name"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    placeholder="Customer support"
                    minLength={2}
                    required
                    disabled={create.busy}
                  />
                </Field>
                {create.error && <Notice tone="error">{create.error}</Notice>}
                <Button type="submit" disabled={create.busy}>
                  {create.busy ? "Creating…" : "Create project"}
                </Button>
              </form>
            </CardContent>
          )}
        </Card>
      </main>
    </div>
  );
}
