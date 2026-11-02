// Generated from Schema_liftofsol; run npm run schema:sync. Do not edit by hand.
// knowledge_sources collection: the platform's side of a knowledge source.
// The knowledge base itself is the RAG's rag (LiftOfMain knowledge schema: rags, rag_jobs). This record has the
// same _id and keeps what the RAG doesn't: the name people gave it, the uploaded file, and who added it.
// Keys: PK = primary key, FK = foreign key.
//
// Rules enforced in code:
// - One source = one RAG knowledge base = one uploaded file, or a .zip/.rar/.tar of files. An agent uses one source.
// - The upload is kept only until the RAG has read it: deleted once the rag is ready or failed, or after
//   KEEP_FILE_HOURS at most (file_path is then removed). Replacing a document means uploading it again.
// - Status, strategy and counts are read from the RAG's rag and rag job; they are never copied here.
// - Adding or deleting needs the project permission knowledge.manage; reading needs knowledge.view.
// - Deleting goes through the RAG's API first (it removes the rag's chunks), then this record.

// The document types the RAG reads.
export const KNOWLEDGE_FILE_TYPES = [".pdf", ".docx", ".txt", ".md", ".zip", ".rar", ".tar"] as const;
export const KEEP_FILE_HOURS = 24;

export interface KnowledgeSource {
  _id: string;          // PK. = rags._id (RAG knowledge schema)
  project_id: string;   // FK → projects._id
  name: string;         // e.g. "Returns policy"
  file_name: string;    // as uploaded, e.g. "returns-2026.pdf"
  file_size: number;    // bytes
  file_path?: string;   // where the upload waits for the RAG; removed once the file is deleted
  job_id: string;       // FK → rag_jobs._id (RAG knowledge schema)
  created_by: string;   // FK → users._id
  created_at: Date;
  updated_at: Date;
}
