# RAG integration contract

Status: **access decided 2026-10-29. The `project_members` copies are built (`src/firestore/platform.ts`,
`syncAccessCopies()`). The adapter is still to do.**
Nothing in `../../LiftOfMain` is changed by the platform.

## Shared database

The platform and the RAG use the same native Firestore database (`liftofsolutions-123`, `(default)`). The records the
platform writes are the records the RAG reads.

## What the RAG checks

Before any `/rag/{accountUuid}/{projectId}/...` request, `src/documentProcessing/service.py:checkAccess()` reads:

- `users/{accountUuid}`, which must exist;
- `projects/{projectId}`, which must exist without `deleted_at`;
- `project_members/{projectId}_{accountUuid}`, which must exist. Nothing in it is read.

`{accountUuid}` is the platform's `users._id`, never the Firebase UID.

## Decision: the platform writes the `project_members` copies

Option 1 was chosen over changing the RAG. `projects.members` stays the source of truth. The platform also keeps one
`project_members` copy for every person who can see a project, in the same transaction as each access change. The
rule and the full list of write paths are in `../Schema_liftofsol/README.md` section 6.5.

Before calling the RAG, the platform checks the person's real project permission: `knowledge.manage` to create jobs
or delete rags, `knowledge.view` to query.

## Still to do

1. Build the adapter for `/jobs`, `/jobs/{jobId}/submit`, `/jobs/{jobId}/status`, `/rags`, `/rags/{ragId}/query` and
   `DELETE /rags/{ragId}`. The request and response shapes are in the RAG's `/openapi.json`. A submitted document is
   an http(s) link.
2. Tests: a member, a removed member, a member of another organization, an admin who isn't listed, and a deleted
   project.

## Future considerations

- The `/rag/...` routes have no service-to-service credential. Anyone who can reach the RAG and knows a member's ids
  can call them. Keep the RAG off the public internet, or agree a shared credential with the RAG owner before
  deploying.
- `POST /agents/{projectId}/{agentId}/query` is public by design and doesn't use `project_members`. The platform
  uses it for the agent studio's test chat (`src/firestore/assistants.ts`). The ids it calls are those of the RAG
  agents it writes, which only the platform knows.
