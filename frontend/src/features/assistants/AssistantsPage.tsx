import { type FormEvent, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { BotIcon, PlusIcon } from "lucide-react";

import {
  EmptyState,
  Field,
  LoadingRows,
  Notice,
  PageContainer,
  PageHeader,
} from "@/components/app/page.tsx";
import { Pill, StatusPill } from "@/components/app/status-pill.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Card } from "@/components/ui/card.tsx";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog.tsx";
import { Input, Textarea } from "@/components/ui/input.tsx";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table.tsx";
import { NoAccess } from "@/features/shell/NotFound.tsx";
import { useAgents } from "@/features/workspace/resources.ts";
import { useOrgMutation, useWorkspace } from "@/features/workspace/workspace.ts";
import { timeAgo } from "@/lib/utils.ts";
import { AGENT_LIFECYCLE } from "@/shared/statuses.ts";
import type { Agent } from "@/shared/types.ts";
import { useAction } from "@/shared/useAction.ts";

import { hasUnpublishedChanges } from "./agentState.ts";

export default function AssistantsPage() {
  const { can } = useWorkspace();
  const agents = useAgents();

  if (!can("agents.view")) return <NoAccess what="assistants" />;
  const list = (agents.data ?? []).filter((agent) => agent.lifecycle_status !== "ARCHIVED");

  return (
    <PageContainer>
      <PageHeader
        title="Assistants"
        description="Each assistant answers customers from the knowledge you give it. Changes are saved as a draft until you publish."
        actions={can("agents.create") && <CreateAssistantDialog />}
      />
      <Card>
        {agents.isLoading ? (
          <LoadingRows />
        ) : list.length === 0 ? (
          <EmptyState
            className="m-5"
            icon={BotIcon}
            title="No assistants yet"
            description="Create one, connect knowledge, test it in the playground, then publish."
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Assistant</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Knowledge</TableHead>
                <TableHead>Updated</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.map((agent) => (
                <TableRow key={agent.id}>
                  <TableCell>
                    <Link
                      to={`/app/assistants/${agent.id}`}
                      className="font-medium hover:underline"
                    >
                      {agent.name}
                    </Link>
                    {agent.description && (
                      <p className="max-w-md truncate text-xs text-muted-foreground">
                        {agent.description}
                      </p>
                    )}
                  </TableCell>
                  <TableCell>
                    <span className="flex flex-wrap items-center gap-1.5">
                      <StatusPill map={AGENT_LIFECYCLE} value={agent.lifecycle_status} />
                      {agent.lifecycle_status === "ACTIVE" && hasUnpublishedChanges(agent) && (
                        <Pill tone="warning">Unpublished changes</Pill>
                      )}
                    </span>
                  </TableCell>
                  <TableCell className="text-muted-foreground tabular-nums">
                    {agent.knowledge_enabled === false
                      ? "Off"
                      : `${agent.knowledge_source_ids?.length ?? 0} sources`}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {timeAgo(agent.updated_at)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>
    </PageContainer>
  );
}

function CreateAssistantDialog() {
  const { request, invalidate } = useOrgMutation();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  const create = useAction(async () => {
    const agent = await request<Agent>("/assistants", {
      method: "POST",
      body: { name: name.trim(), description: description.trim() || null },
    });
    await invalidate("agents");
    await invalidate("channels");
    navigate(`/app/assistants/${agent.id}`);
  });

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void create.run();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <PlusIcon />
          New assistant
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New assistant</DialogTitle>
          <DialogDescription>
            A web chat channel is created with it. You can set instructions and knowledge next.
          </DialogDescription>
        </DialogHeader>
        <form className="grid gap-4" onSubmit={submit}>
          <Field label="Name" htmlFor="assistant-name">
            <Input
              id="assistant-name"
              required
              minLength={2}
              placeholder="Returns assistant"
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </Field>
          <Field
            label="What it helps with"
            htmlFor="assistant-description"
            hint="Optional. Shown to your team only."
          >
            <Textarea
              id="assistant-description"
              rows={2}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
          </Field>
          {create.error && <Notice tone="error">{create.error}</Notice>}
          <DialogFooter>
            <Button type="submit" disabled={create.busy}>
              {create.busy ? "Creating…" : "Create assistant"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
