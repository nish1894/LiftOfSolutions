import { type FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

import { Field, Notice } from "@/components/app/page.tsx";
import { Button } from "@/components/ui/button.tsx";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog.tsx";
import { Input } from "@/components/ui/input.tsx";
import { useAuth } from "@/features/auth/AuthContext.ts";
import { apiRequest } from "@/shared/api/client.ts";
import { useAction } from "@/shared/useAction.ts";

import { useWorkspace } from "./workspace.ts";

interface CreateProjectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** A new project in the current organization; it becomes the active one. The API refuses it when the plan is full. */
export default function CreateProjectDialog({ open, onOpenChange }: CreateProjectDialogProps) {
  const { businessId, membership, selectProject } = useWorkspace();
  const { refreshAuth } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState("");

  const create = useAction(async () => {
    const project = await apiRequest<{ id: string; name: string }>(
      `/api/v1/organizations/${businessId}/projects`,
      { method: "POST", body: { name: name.trim() } },
    );
    await refreshAuth();
    selectProject(project.id);
    toast.success(`Created ${project.name}`);
    setName("");
    onOpenChange(false);
    navigate("/app/overview");
  });

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void create.run();
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) create.clearError();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New project</DialogTitle>
          <DialogDescription>
            A project in {membership.business_name} keeps its own agents, contacts and inbox.
          </DialogDescription>
        </DialogHeader>
        <form className="grid gap-4" onSubmit={submit}>
          <Field label="Project name" htmlFor="new-project-name">
            <Input
              id="new-project-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Customer support"
              minLength={2}
              maxLength={200}
              required
              disabled={create.busy}
            />
          </Field>
          {create.error && <Notice tone="error">{create.error}</Notice>}
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" disabled={create.busy}>
              {create.busy ? "Creating…" : "Create project"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
