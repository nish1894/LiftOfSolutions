import { apiRequest } from "../../shared/api/client.ts";

interface AgentTestResponse {
  result?: { content?: string };
}

export async function sendChatMessage(
  message: string,
  businessId: string,
  agentId: string,
): Promise<{ reply: string }> {
  const response = await apiRequest<AgentTestResponse>(
    `/api/v1/businesses/${businessId}/assistants/${agentId}/test`,
    { method: "POST", body: { message } },
  );
  return { reply: response.result?.content || "No reply." };
}
