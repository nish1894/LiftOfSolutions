export type MessageRole = "user" | "bot";

export interface ChatMessage {
  id: number;
  role: MessageRole;
  text: string;
  isError: boolean;
}
