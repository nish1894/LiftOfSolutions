import { useState } from "react";
import { CodeIcon, CopyIcon, GlobeIcon } from "lucide-react";

import { EmptyState, LoadingRows, Notice } from "@/components/app/page.tsx";
import { StatusPill } from "@/components/app/status-pill.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog.tsx";
import { useAgents, useChannels } from "@/features/workspace/resources.ts";
import { useOrgQuery } from "@/features/workspace/workspace.ts";
import { sentenceCase } from "@/lib/utils.ts";
import { copyText } from "@/shared/clipboard.ts";
import { RECORD_STATUS } from "@/shared/statuses.ts";
import type { ChannelInstall } from "@/shared/types.ts";

/** Channels for every assistant, or for one when `assistantId` is given.
    Row layout from the template's Connections page (MIT). */
export function ChannelList({ assistantId }: { assistantId?: string }) {
  const channels = useChannels();
  const agents = useAgents();

  if (channels.isLoading) return <LoadingRows />;
  const rows = (channels.data ?? []).filter(
    (item) => !assistantId || item.assistant_id === assistantId,
  );

  if (rows.length === 0) {
    return (
      <EmptyState
        icon={GlobeIcon}
        title="No channels yet"
        description="Creating an assistant adds a web chat channel for it automatically."
      />
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="grid gap-1">
          <CardTitle>Channels</CardTitle>
          <CardDescription>Where customers can reach your assistants.</CardDescription>
        </div>
      </CardHeader>
      <ul className="divide-y px-6 pb-2">
        {rows.map((channel) => {
          const agentName = agents.data?.find((item) => item.id === channel.assistant_id)?.name;
          return (
            <li key={channel.id} className="flex flex-wrap items-center gap-3 py-4">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-lg border bg-background shadow-xs">
                <GlobeIcon className="size-5 text-muted-foreground" aria-hidden="true" />
              </span>
              <div className="grid min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-2 font-medium">
                  {sentenceCase(channel.channel) || "Web"} chat
                  <StatusPill map={RECORD_STATUS} value={channel.status} />
                </span>
                <span className="truncate text-sm text-muted-foreground">
                  {agentName ? `${agentName} · ` : ""}
                  <code className="font-mono text-xs">{channel.public_id}</code>
                </span>
              </div>
              {channel.channel === "web" && <InstallCodeDialog channelId={channel.id} />}
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

function InstallCodeDialog({ channelId }: { channelId: string }) {
  const [open, setOpen] = useState(false);
  // Fetched only when someone opens the dialog.
  const install = useOrgQuery<ChannelInstall | null>(
    ["channelInstall", channelId],
    `/channels/${channelId}/install`,
    null,
    { enabled: open },
  );
  const snippet = install.data?.installation_snippet;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <CodeIcon />
          Install code
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add web chat to your site</DialogTitle>
          <DialogDescription>
            Paste this just before the closing &lt;/body&gt; tag on each page where customers should
            see the chat.
          </DialogDescription>
        </DialogHeader>
        {install.isLoading && <LoadingRows />}
        {!install.isLoading && !snippet && (
          <Notice tone="error">The install code couldn't be loaded. Try again.</Notice>
        )}
        {snippet && (
          <>
            <pre className="overflow-x-auto rounded-lg border bg-muted p-3 font-mono text-xs break-all whitespace-pre-wrap">
              {snippet}
            </pre>
            <DialogFooter>
              <Button onClick={() => copyText(snippet, "Install code copied")}>
                <CopyIcon />
                Copy code
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
