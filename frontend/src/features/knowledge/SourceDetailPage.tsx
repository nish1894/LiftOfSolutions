import { type DragEvent, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeftIcon, FileTextIcon, RefreshCwIcon, UploadIcon } from "lucide-react";
import { toast } from "sonner";

import {
  EmptyState,
  LoadingRows,
  Notice,
  PageContainer,
  PageHeader,
} from "@/components/app/page.tsx";
import { StatusPill } from "@/components/app/status-pill.tsx";
import { Button } from "@/components/ui/button.tsx";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card.tsx";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog.tsx";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table.tsx";
import { NoAccess } from "@/features/shell/NotFound.tsx";
import {
  orgPath,
  useOrgMutation,
  useOrgQuery,
  useWorkspace,
} from "@/features/workspace/workspace.ts";
import { cn, sentenceCase, timeAgo } from "@/lib/utils.ts";
import { apiRequest } from "@/shared/api/client.ts";
import { INGESTION_STATUS, RECORD_STATUS } from "@/shared/statuses.ts";
import type { KnowledgeDocument, KnowledgeSource, UploadResponse } from "@/shared/types.ts";
import { useAction } from "@/shared/useAction.ts";

import { useLiveSourceStatus } from "./useLiveSourceStatus.ts";
import { explainIngestionError, readUploads, saveUploads, type TrackedUpload } from "./uploads.ts";

export default function SourceDetailPage() {
  const { sourceId = "" } = useParams();
  const { can } = useWorkspace();
  const source = useOrgQuery<KnowledgeSource | null>(
    ["source", sourceId],
    `/knowledge/sources/${sourceId}`,
    null,
    { enabled: can("knowledge.view") },
  );

  if (!can("knowledge.view")) return <NoAccess what="knowledge" />;
  if (source.isLoading) return <LoadingRows />;
  if (!source.data) {
    return (
      <PageContainer size="narrow">
        <EmptyState
          className="mt-10"
          title="Source not found"
          description="It may have been removed."
        />
      </PageContainer>
    );
  }
  return <SourceDetail source={source.data} />;
}

function SourceDetail({ source }: { source: KnowledgeSource }) {
  const { can, businessId } = useWorkspace();
  const { request, invalidate } = useOrgMutation();
  const navigate = useNavigate();
  const { status, serviceUnavailable } = useLiveSourceStatus(source);
  const [uploads, setUploads] = useState(() => readUploads(businessId, source.id));

  const manage = can("knowledge.manage");
  const refresh = () => Promise.all([invalidate("source", source.id), invalidate("sources")]);
  const errorHelp =
    status === "FAILED" ? explainIngestionError(source.processing_error_code) : null;

  const upload = useAction(async (files: File[]) => {
    // One request per file: the API accepts a single file per upload.
    for (const file of files) {
      const body = new FormData();
      body.append("source_id", source.id); // must precede the file part
      body.append("file", file);
      const result = await apiRequest<UploadResponse>(orgPath(businessId, "/knowledge/documents"), {
        method: "POST",
        body,
      });
      const tracked: TrackedUpload = {
        id: result.resource_id,
        title: file.name,
        uploadedAt: new Date().toISOString(),
      };
      setUploads((current) => {
        const next = [tracked, ...current];
        saveUploads(businessId, source.id, next);
        return next;
      });
    }
    await refresh();
    toast.success(files.length === 1 ? "File uploaded" : `${files.length} files uploaded`);
  });

  const resync = useAction(async () => {
    await request(`/knowledge/sources/${source.id}/submit`, { method: "POST" });
    await refresh();
    toast.success("Processing started");
  });
  const setStatus = useAction(async (next: "ACTIVE" | "DISABLED") => {
    await request(`/knowledge/sources/${source.id}`, { method: "PATCH", body: { status: next } });
    await refresh();
    toast.success(next === "ACTIVE" ? "Source enabled" : "Source disabled");
  });
  const archive = useAction(async () => {
    await request(`/knowledge/sources/${source.id}`, { method: "DELETE" });
    await invalidate("sources");
    toast.success("Source archived");
    navigate("/app/knowledge");
  });

  const error = upload.error || resync.error || setStatus.error || archive.error;
  const isArchived = source.status === "ARCHIVED";

  return (
    <PageContainer>
      <Link
        to="/app/knowledge"
        className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeftIcon className="size-4" aria-hidden="true" />
        Knowledge
      </Link>

      <PageHeader
        title={source.name}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <span>{sentenceCase(source.source_type)}</span>
            {source.status !== "ACTIVE" && <StatusPill map={RECORD_STATUS} value={source.status} />}
            {source.source_uri && (
              <a href={source.source_uri} target="_blank" rel="noreferrer" className="underline">
                {source.source_uri}
              </a>
            )}
          </span>
        }
        actions={
          manage &&
          !isArchived && (
            <>
              {source.source_type === "URL" && (
                <Button variant="outline" onClick={() => resync.run()} disabled={resync.busy}>
                  <RefreshCwIcon />
                  {resync.busy ? "Starting…" : "Process again"}
                </Button>
              )}
              <Button
                variant="outline"
                disabled={setStatus.busy}
                onClick={() => setStatus.run(source.status === "DISABLED" ? "ACTIVE" : "DISABLED")}
              >
                {source.status === "DISABLED" ? "Enable" : "Disable"}
              </Button>
              <ArchiveDialog
                name={source.name}
                busy={archive.busy}
                onConfirm={() => archive.run()}
              />
            </>
          )
        }
      />

      {error && (
        <Notice tone="error" className="mb-4">
          {error}
        </Notice>
      )}

      <div className="grid gap-6 lg:grid-cols-[20rem_minmax(0,1fr)]">
        <Card className="self-start">
          <CardHeader>
            <CardTitle>Processing</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3">
            {!source.external_job_id && status === "PENDING" ? (
              <p className="text-sm text-muted-foreground">
                Nothing has been sent for processing yet.
              </p>
            ) : (
              <StatusPill map={INGESTION_STATUS} value={status} className="justify-self-start" />
            )}
            {status === "PROCESSING" && (
              <p className="text-sm text-muted-foreground">
                The AI service is reading this source. This page checks again every few seconds.
              </p>
            )}
            {status === "READY" && (
              <p className="text-sm text-muted-foreground">
                Assistants linked to this source can cite it.
              </p>
            )}
            {errorHelp && <Notice tone="error">{errorHelp}</Notice>}
            {serviceUnavailable && (
              <Notice tone="warning">
                The AI service can't be reached, so this status may be out of date.
              </Notice>
            )}
          </CardContent>
        </Card>

        <div className="grid content-start gap-6">
          {manage && !isArchived && source.source_type !== "URL" && (
            <UploadArea busy={upload.busy} onFiles={(files) => files.length && upload.run(files)} />
          )}
          <UploadedDocuments uploads={uploads} canManage={manage} onChanged={refresh} />
        </div>
      </div>
    </PageContainer>
  );
}

function UploadArea({ busy, onFiles }: { busy: boolean; onFiles: (files: File[]) => void }) {
  const [dragging, setDragging] = useState(false);

  function handleDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setDragging(false);
    onFiles([...event.dataTransfer.files]);
  }

  return (
    <label
      htmlFor="document-upload"
      onDragOver={(event) => {
        event.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
      className={cn(
        "flex cursor-pointer flex-col items-center gap-2 rounded-lg border border-dashed bg-card px-6 py-8 text-center hover:bg-muted/50",
        dragging && "border-primary bg-accent/50",
        busy && "pointer-events-none opacity-60",
      )}
    >
      <UploadIcon className="size-5 text-muted-foreground" aria-hidden="true" />
      <span className="font-medium">
        {busy ? "Uploading…" : "Drop files here, or choose files"}
      </span>
      <span className="text-sm text-muted-foreground">
        Each file is sent to the AI service and processed on its own.
      </span>
      <input
        id="document-upload"
        type="file"
        multiple
        className="sr-only"
        disabled={busy}
        onChange={(event) => {
          onFiles([...(event.target.files ?? [])]);
          event.target.value = "";
        }}
      />
    </label>
  );
}

interface UploadedDocumentsProps {
  uploads: TrackedUpload[];
  canManage: boolean;
  onChanged: () => Promise<unknown>;
}

function UploadedDocuments({ uploads, canManage, onChanged }: UploadedDocumentsProps) {
  return (
    <Card>
      <CardHeader>
        <div className="grid gap-1">
          <CardTitle>Documents</CardTitle>
          <CardDescription>
            Files uploaded from this browser. The API doesn't list a source's documents yet.
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent className="p-0 pt-4">
        {uploads.length === 0 ? (
          <EmptyState
            className="m-5 mt-0"
            icon={FileTextIcon}
            title="No documents uploaded from this browser"
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>File</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Uploaded</TableHead>
                {canManage && <TableHead className="text-right">Actions</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {uploads.map((upload) => (
                <DocumentRow
                  key={upload.id}
                  upload={upload}
                  canManage={canManage}
                  onChanged={onChanged}
                />
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

function DocumentRow({
  upload,
  canManage,
  onChanged,
}: { upload: TrackedUpload } & Omit<UploadedDocumentsProps, "uploads">) {
  const { request, invalidate } = useOrgMutation();
  // Loaded once: the stored document status only changes when it's reprocessed.
  const document = useOrgQuery<KnowledgeDocument | null>(
    ["document", upload.id],
    `/knowledge/documents/${upload.id}`,
    null,
  );
  const retry = useAction(async () => {
    await request(`/knowledge/documents/${upload.id}/reprocess`, { method: "POST" });
    await invalidate("document", upload.id);
    await onChanged();
    toast.success(`Processing ${upload.title} again`);
  });

  const status = document.data?.processing_status;
  const help = status === "FAILED" ? explainIngestionError(document.data?.error_code) : null;

  return (
    <TableRow>
      <TableCell>
        <span className="flex items-center gap-2 font-medium">
          <FileTextIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <span className="truncate">{upload.title}</span>
        </span>
        {help && <p className="mt-1 max-w-md text-xs text-danger">{help}</p>}
        {retry.error && (
          <p className="mt-1 text-xs text-danger" role="alert">
            {retry.error}
          </p>
        )}
      </TableCell>
      <TableCell>
        {document.isLoading ? (
          <span className="text-sm text-muted-foreground">Checking…</span>
        ) : document.data ? (
          <StatusPill map={INGESTION_STATUS} value={status} />
        ) : (
          <span className="text-sm text-muted-foreground">Not found</span>
        )}
      </TableCell>
      <TableCell className="text-muted-foreground">{timeAgo(upload.uploadedAt)}</TableCell>
      {canManage && (
        <TableCell className="text-right">
          <Button
            size="sm"
            variant="outline"
            disabled={retry.busy || !document.data}
            onClick={() => retry.run()}
          >
            {retry.busy ? "Starting…" : "Process again"}
          </Button>
        </TableCell>
      )}
    </TableRow>
  );
}

function ArchiveDialog({
  name,
  busy,
  onConfirm,
}: {
  name: string;
  busy: boolean;
  onConfirm: () => void;
}) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" className="text-danger">
          Archive
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Archive "{name}"?</DialogTitle>
          <DialogDescription>
            Assistants stop answering from it. Past conversations keep their citations.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Cancel</Button>
          </DialogClose>
          <Button variant="destructive" disabled={busy} onClick={onConfirm}>
            {busy ? "Archiving…" : "Archive source"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
