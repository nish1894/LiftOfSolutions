import { useState } from "react";
import { Link } from "react-router-dom";
import { BotIcon } from "lucide-react";

import { EmptyState, LoadingRows, PageContainer, PageHeader } from "@/components/app/page.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Card, CardContent } from "@/components/ui/card.tsx";
import { NativeSelect } from "@/components/ui/input.tsx";
import ChatTester from "@/features/chat/ChatTester.tsx";
import { NoAccess } from "@/features/shell/NotFound.tsx";
import { useAgents } from "@/features/workspace/resources.ts";
import { useWorkspace } from "@/features/workspace/workspace.ts";

export default function PlaygroundPage() {
  const { can } = useWorkspace();
  const agents = useAgents();
  const [agentId, setAgentId] = useState("");

  if (!can("agents.test")) return <NoAccess what="the playground" />;

  const list = agents.data ?? [];
  const selected = agentId || list[0]?.id || "";

  return (
    <PageContainer size="narrow">
      <PageHeader
        title="Playground"
        description="Ask an assistant a question the way a customer would. Replies use the assistant's saved draft and show the sources it cited."
        actions={
          list.length > 0 && (
            <label className="flex items-center gap-2 text-sm">
              <span className="text-muted-foreground">Assistant</span>
              <NativeSelect
                className="w-56"
                value={selected}
                onChange={(event) => setAgentId(event.target.value)}
              >
                {list.map((agent) => (
                  <option key={agent.id} value={agent.id}>
                    {agent.name}
                  </option>
                ))}
              </NativeSelect>
            </label>
          )
        }
      />

      {agents.isLoading && <LoadingRows />}
      {!agents.isLoading && list.length === 0 && (
        <EmptyState
          icon={BotIcon}
          title="Create an assistant first"
          description="The playground tests an assistant against your knowledge."
          action={
            <Button asChild>
              <Link to="/app/assistants">Go to assistants</Link>
            </Button>
          }
        />
      )}
      {selected && (
        <Card>
          <CardContent>
            {/* A new key clears the conversation when the assistant changes. */}
            <ChatTester key={selected} agentId={selected} className="h-[60dvh]" />
          </CardContent>
        </Card>
      )}
    </PageContainer>
  );
}
