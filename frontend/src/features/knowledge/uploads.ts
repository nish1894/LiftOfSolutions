/* The API has no endpoint that lists a source's documents yet, so the page
   remembers what was uploaded from this browser. When a list endpoint exists,
   replace this file with a query. */

export interface TrackedUpload {
  id: string;
  title: string;
  uploadedAt: string;
}

const storageKey = (businessId: string, sourceId: string) =>
  `liftoff-uploads:${businessId}:${sourceId}`;

export function readUploads(businessId: string, sourceId: string): TrackedUpload[] {
  try {
    const parsed: unknown = JSON.parse(
      localStorage.getItem(storageKey(businessId, sourceId)) ?? "[]",
    );
    return Array.isArray(parsed) ? (parsed as TrackedUpload[]) : [];
  } catch {
    return [];
  }
}

export function saveUploads(businessId: string, sourceId: string, uploads: TrackedUpload[]) {
  try {
    localStorage.setItem(storageKey(businessId, sourceId), JSON.stringify(uploads.slice(0, 100)));
  } catch {
    // Storage can be full or blocked; the uploads themselves still happened.
  }
}

const ERROR_HELP: Record<string, string> = {
  RAG_INGESTION_FAILED:
    "The AI service couldn't process this. Check the file opens and isn't password-protected, then retry.",
  AI_SERVICE_UNAVAILABLE: "The AI service couldn't be reached. Try again in a few minutes.",
};

export function explainIngestionError(code: string | null | undefined): string | null {
  if (!code) return null;
  return ERROR_HELP[code] ?? `Processing failed (${code}). Try again, or contact support.`;
}
