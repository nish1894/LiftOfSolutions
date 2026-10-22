import { type FormEvent, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { BookOpenIcon, CircleAlertIcon, CircleCheckIcon, LoaderIcon, PlusIcon } from "lucide-react";

import {
  EmptyState,
  Field,
  LoadingRows,
  Notice,
  PageContainer,
  PageHeader,
  Stat,
} from "@/components/app/page.tsx";
import { StatusPill } from "@/components/app/status-pill.tsx";
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
import { Checkbox, Input, NativeSelect } from "@/components/ui/input.tsx";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table.tsx";
import { NoAccess } from "@/features/shell/NotFound.tsx";
import { useSources } from "@/features/workspace/resources.ts";
import { useOrgMutation, useWorkspace } from "@/features/workspace/workspace.ts";
import { sentenceCase, timeAgo } from "@/lib/utils.ts";
import { INGESTION_STATUS, RECORD_STATUS } from "@/shared/statuses.ts";
import type { KnowledgeSource } from "@/shared/types.ts";
import { useAction } from "@/shared/useAction.ts";

import { useLiveSourceStatus } from "./useLiveSourceStatus.ts";

function IngestionCell({ source }: { source: KnowledgeSource }) {
  const { status, serviceUnavailable } = useLiveSourceStatus(source);
  // A new source is PENDING before anything was sent; that isn't "queued".
  if (!source.external_job_id && status === "PENDING") {
    return <span className="text-sm text-muted-foreground">Nothing uploaded yet</span>;
  }
  return (
    <span className="flex flex-wrap items-center gap-2">
      <StatusPill map={INGESTION_STATUS} value={status} />
      {serviceUnavailable && <span className="text-xs text-warning">AI service unreachable</span>}
    </span>
  );
}

export default function KnowledgePage() {
  const { can } = useWorkspace();
  const sources = useSources();
  const [showArchived, setShowArchived] = useState(false);

  if (!can("knowledge.view")) return <NoAccess what="knowledge" />;

  const all = sources.data ?? [];
  const rows = all.filter((source) => showArchived || source.status !== "ARCHIVED");
  const countOf = (status: string) =>
    all.filter((source) => source.status !== "ARCHIVED" && source.processing_status === status)
      .length;

  return (
    <PageContainer>
      <PageHeader
        title="Knowledge"
        description="Documents and websites your assistants answer from. Each source is processed by the AI service before it can be cited."
        actions={can("knowledge.manage") && <CreateSourceDialog />}
      />

      <dl className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat
          label="Sources"
          value={all.filter((source) => source.status !== "ARCHIVED").length}
          icon={BookOpenIcon}
        />
        <Stat label="Ready" value={countOf("READY")} icon={CircleCheckIcon} />
        <Stat
          label="Processing"
          value={countOf("PROCESSING") + countOf("PENDING")}
          icon={LoaderIcon}
        />
        <Stat label="Failed" value={countOf("FAILED")} icon={CircleAlertIcon} />
      </dl>

      <div className="mb-3 flex justify-end">
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <Checkbox
            checked={showArchived}
            onChange={(event) => setShowArchived(event.target.checked)}
          />
          Show archived
        </label>
      </div>

      <Card>
        {sources.isLoading ? (
          <LoadingRows />
        ) : rows.length === 0 ? (
          <EmptyState
            className="m-5"
            icon={BookOpenIcon}
            title="No knowledge sources yet"
            description="Create a source, then upload documents or point it at a website."
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Source</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Processing</TableHead>
                <TableHead>Updated</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((source) => (
                <TableRow key={source.id}>
                  <TableCell>
                    <span className="flex flex-wrap items-center gap-2">
                      <Link
                        to={`/app/knowledge/${source.id}`}
                        className="font-medium hover:underline"
                      >
                        {source.name}
                      </Link>
                      {source.status !== "ACTIVE" && (
                        <StatusPill map={RECORD_STATUS} value={source.status} />
                      )}
                    </span>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {sentenceCase(source.source_type)}
                  </TableCell>
                  <TableCell>
                    <IngestionCell source={source} />
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {timeAgo(source.updated_at)}
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

function CreateSourceDialog() {
  const { request, invalidate } = useOrgMutation();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [type, setType] = useState<"UPLOAD" | "URL">("UPLOAD");
  const [url, setUrl] = useState("");

  const create = useAction(async () => {
    const source = await request<KnowledgeSource>("/knowledge/sources", {
      method: "POST",
      body: {
        name: name.trim(),
        source_type: type,
        source_uri: type === "URL" ? url.trim() : null,
      },
    });
    // A website has nothing to upload, so start processing straight away.
    if (type === "URL") {
      await request(`/knowledge/sources/${source.id}/submit`, { method: "POST" });
    }
    await invalidate("sources");
    navigate(`/app/knowledge/${source.id}`);
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
          New source
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New knowledge source</DialogTitle>
          <DialogDescription>
            Group related documents, like "Refund policies", in one source.
          </DialogDescription>
        </DialogHeader>
        <form className="grid gap-4" onSubmit={submit}>
          <Field label="Name" htmlFor="source-name">
            <Input
              id="source-name"
              required
              placeholder="Refund policies"
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </Field>
          <Field label="Content" htmlFor="source-type">
            <NativeSelect
              id="source-type"
              value={type}
              onChange={(event) => setType(event.target.value as "UPLOAD" | "URL")}
            >
              <option value="UPLOAD">Documents I upload</option>
              <option value="URL">A web page</option>
            </NativeSelect>
          </Field>
          {type === "URL" && (
            <Field label="Page address" htmlFor="source-url">
              <Input
                id="source-url"
                type="url"
                required
                placeholder="https://example.com/help"
                value={url}
                onChange={(event) => setUrl(event.target.value)}
              />
            </Field>
          )}
          {create.error && <Notice tone="error">{create.error}</Notice>}
          <DialogFooter>
            <Button type="submit" disabled={create.busy}>
              {create.busy ? "Creating…" : "Create source"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
