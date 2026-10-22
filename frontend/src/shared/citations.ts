import { pickText } from "@/lib/utils.ts";
import type { Citation, ConversationMessage } from "@/shared/types.ts";

export function citationsOf(message: Pick<ConversationMessage, "message_metadata">): Citation[] {
  const citations = message.message_metadata?.citations;
  return Array.isArray(citations) ? citations : [];
}

export interface CitationInfo {
  title: string;
  location: string;
  snippet: string;
}

/* The RAG service owns the citation shape, so read the usual field names and
   fall back to a numbered label rather than showing nothing. */
export function describeCitation(citation: Citation, index: number): CitationInfo {
  const page = pickText(citation, ["page", "page_number"]);
  return {
    title:
      pickText(citation, ["title", "document_title", "source", "filename", "file_name"]) ||
      `Source ${index + 1}`,
    location: page ? `Page ${page}` : pickText(citation, ["section", "heading", "location"]),
    snippet: pickText(citation, ["snippet", "text", "content", "quote"]),
  };
}
