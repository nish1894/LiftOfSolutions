import { type FormEvent, useState } from "react";
import { Trash2Icon, UploadIcon } from "lucide-react";
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
  DialogTrigger,
} from "@/components/ui/dialog.tsx";
import { Input } from "@/components/ui/input.tsx";
import { useOrgMutation } from "@/features/workspace/workspace.ts";
import type { KnowledgeSource } from "@/shared/types.ts";
import { useAction } from "@/shared/useAction.ts";

/* Knowledge sources are the project's documents. The agent studio uploads and deletes them here. */

// What the AI service reads; matches KNOWLEDGE_FILE_TYPES and MAX_UPLOAD_BYTES in platform-api.
const FILE_TYPES = [".pdf", ".docx", ".txt", ".md", ".zip", ".rar", ".tar"];
const MAX_FILE_MB = 20;

export function AddKnowledgeDialog({ onAdded }: { onAdded: (source: KnowledgeSource) => void }) {
  const { request, invalidate } = useOrgMutation();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [file, setFile] = useState<File | null>(null);

  const add = useAction(async () => {
    if (!file) throw new Error("Choose a document to upload.");
    if (file.size > MAX_FILE_MB * 1_048_576)
      throw new Error(`Upload a file of ${MAX_FILE_MB} MB or less.`);
    const body = new FormData();
    body.append("name", name.trim()); // must precede the file part
    body.append("file", file);
    const source = await request<KnowledgeSource>("/knowledge/sources", {
      method: "POST",
      body,
    });
    await invalidate("sources");
    toast.success("Uploaded. The AI service is reading it now.");
    onAdded(source);
    setOpen(false);
    setName("");
    setFile(null);
  });

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void add.run();
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        add.clearError();
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <UploadIcon />
          Upload document
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Upload a document</DialogTitle>
          <DialogDescription>
            Upload one document, or a .zip of several. To replace it later, upload the new version
            and delete the old one.
          </DialogDescription>
        </DialogHeader>
        <form className="grid gap-4" onSubmit={submit}>
          <Field label="Name" htmlFor="source-name">
            <Input
              id="source-name"
              required
              maxLength={200}
              placeholder="Refund policy"
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </Field>
          <Field
            label="Document"
            htmlFor="source-file"
            hint={`PDF, Word, text, Markdown, or a .zip, .rar or .tar of them. Up to ${MAX_FILE_MB} MB.`}
          >
            <Input
              id="source-file"
              type="file"
              required
              accept={FILE_TYPES.join(",")}
              onChange={(event) => {
                const chosen = event.target.files?.[0] ?? null;
                setFile(chosen);
                // The file name is a fair default name.
                if (chosen && !name.trim()) setName(chosen.name.replace(/\.[^.]+$/, ""));
              }}
            />
          </Field>
          {add.error && <Notice tone="error">{add.error}</Notice>}
          <DialogFooter>
            <Button type="submit" disabled={add.busy}>
              {add.busy ? "Uploading…" : "Upload"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function DeleteSourceDialog({ source }: { source: KnowledgeSource }) {
  const { request, invalidate } = useOrgMutation();
  const [open, setOpen] = useState(false);
  const remove = useAction(async () => {
    await request(`/knowledge/sources/${source.id}`, { method: "DELETE" });
    await invalidate("sources");
    toast.success("Document deleted");
    setOpen(false);
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) remove.clearError();
      }}
    >
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={`Delete ${source.name}`}>
          <Trash2Icon />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete "{source.name}"?</DialogTitle>
          <DialogDescription>
            It's removed from the AI service for every agent in this project. This can't be undone.
          </DialogDescription>
        </DialogHeader>
        {remove.error && <Notice tone="error">{remove.error}</Notice>}
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Cancel</Button>
          </DialogClose>
          <Button variant="destructive" disabled={remove.busy} onClick={() => remove.run()}>
            {remove.busy ? "Deleting…" : "Delete document"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
