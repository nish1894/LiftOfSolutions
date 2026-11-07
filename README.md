# Lift Off Solutions: platform backend

Multi-tenant AI customer-service platform: businesses sign up, build agents that answer their customers on web chat
and WhatsApp, and hand conversations to their own team when needed.

This repository is the **platform**: the web app, the API, the database design and the local dev setup. The
**RAG service** (turning documents into searchable knowledge) is a separate repository, `../LiftOfMain`, owned by
another team member. This repository never changes it. The platform will call its API after the access contract is agreed.

> **Keep this file current.** Every meaningful change adds a line to [Decision log](#decision-log): what we did and
> why. The detail lives in the linked documents; this file is the map.

## Contents

- [Folders](#folders)
- [Where things stand](#where-things-stand)
- [Run it locally](#run-it-locally)
- [Decision log](#decision-log)
- [Local-only files](#local-only-files)

## Folders

```
liftofSol/
├── chatbotBackend/            this repository (platform)
│   ├── frontend/              React 19 + Vite + TypeScript web app
│   ├── platform-api/          Node 24 + Fastify + TypeScript API (see its README)
│   ├── Schema_liftofsol/      the new database design: one README for every collection
│   ├── firebase-emulator/     Docker image for the local Firebase Auth + Firestore emulators
│   ├── firebase-tests/        tests for firestore.rules
│   ├── docker-compose.yml     local stack: Firestore + Auth emulators, API, maintenance, frontend
│   ├── firebase.json, .firebaserc, firestore.rules, firestore.indexes.json
│   └── untracked/             git-ignored: old docs and archives, local to each machine
└── LiftOfMain/                RAG service (Python, FastAPI) — separate repository, read-only from here
```

| Area | Stack | Notes |
|---|---|---|
| Web app | React 19, Vite 8, TypeScript, Tailwind v4, shadcn-style components, TanStack Query | Light theme by default, dark in preferences |
| API | Node 24, Fastify, TypeScript, Zod, Vitest | Firebase Admin SDK for auth; native Firestore for platform data |
| Identity | Firebase Authentication | Google, email + password |
| Database | Native Firestore, shared with the RAG (`liftofsolutions-123`); the emulator locally | Design in [`Schema_liftofsol/README.md`](Schema_liftofsol/README.md) section 16; indexes not deployed yet |
| RAG | `../LiftOfMain` (FastAPI, Pinecone, Firestore) | API under `/rag/{accountUuid}/{projectId}` |

## Where things stand

**Done**

- Web app rebuilt on a free, MIT-licensed template, with light/dark themes.
- The API runs on native Firestore (the emulator locally). The old Firestore API on the old schema remains behind
  `DATABASE_BACKEND=legacy-firestore`.
- New database design written and reviewed for all platform collections (users, organizations, projects, billing,
  contacts, inbox, tool runs, notifications, audit). See [`Schema_liftofsol/README.md`](Schema_liftofsol/README.md).
- The RAG access contract is agreed: the platform writes `project_members` copies.
- Project settings (access, rename, archive) and the editable URL name.
- Knowledge: uploads go to the RAG service, which reads them into knowledge bases.
- Agents: one studio per agent (setup and knowledge on the left, a test chat on the right), draft, then Publish.
- Workflows: templates, template pages and an editor. Workflows are saved and can be turned on, but nothing runs
  them until a channel brings in conversations.
- Public website for Meta's WhatsApp verification: homepage, About, Contact, Privacy Policy, Terms of Service and
  Data Deletion, each with the business details in the footer.

**Next**

1. Channels (the web widget into the Inbox), then running workflows, then Analytics.
2. Later: invitation email and a payment provider.

**Known gaps**

- `src/modules/` (the old Firestore API) is unused and can be removed.
- `../LiftOfMain/db/` holds its own copies of the agent, knowledge, project, organization, transactions and user
  schemas. For platform collections, `Schema_liftofsol/` is the source of truth (it is newer for users, organizations
  and projects).

## Run it locally

Node 18 is too old; use Node 24 (`nvm install 24 && nvm use 24`).

The frontend, API and maintenance job run in one Docker stack on the Firestore emulator:

```bash
docker compose up --build -d
docker compose ps
```

- Web app: <http://localhost:5173>
- API health: <http://localhost:8000/health>
- Firestore emulator: `127.0.0.1:8080`, with its UI at <http://localhost:4000>

With `.env` as set up, sign-in uses the real Firebase project. Agent answers are not connected yet.

Knowledge needs the RAG service running on the host, against the same emulator:

```bash
cd ../LiftOfMain && FIRESTORE_EMULATOR_HOST=localhost:8080 uv run fastapi run src/main.py --port 8001
```
See [`platform-api/README.md`](platform-api/README.md) for local development, tests, and current API limits.

Checks: `npm test` and `npm run build` in `platform-api` and in `frontend`; `npm run lint` in `frontend`.

The RAG service runs from its own repository: see `../LiftOfMain/README.md`.

## Decision log

Newest first. Each line: what we did, why, and where the detail is.

### 2026-11-07: DeepSeek dropped from the frontend; Grievance Officer named

You decided not to use DeepSeek, after a review pointed out that Meta's App Review asks about data processors and
their countries (DeepSeek stores data in China).

- **Frontend:** the agent studio no longer offers DeepSeek models (`features/assistants/presets.ts`). The Privacy
  Policy lists only OpenAI and Google (Gemini), and no longer mentions China.
- **Address:** now matches the Meta Business details, which you confirmed are correct: "AECS Layout - A Block,
  Kudlu Road, Singasandra, Bengaluru 560068, India" (`business.ts`, so every page and the footer change).
- **Grievance Officer:** "Nishant K, Grievance Officer, LiftOffSol", from `business.ts`. The policies' effective
  date is now 7 November 2026, and the sitemap's `/privacy` date matches.
- **For later:** platform-api still accepts `deepseek-v4-flash` and `deepseek-v4-pro` (`ASSISTANT_MODELS`), and
  `firestore/provision.ts` still creates a "DeepSeek chat" flow config for each new organization. Remove them, or
  the API can still send data to DeepSeek if called directly.

### 2026-11-07: frontend fixes from a pre-launch check

You ran a frontend check (secrets, access, errors, dependencies, monitoring) and asked to fix what's ours.

- **Error text:** the API client no longer shows a 5xx body's message, which can be another service's raw text
  (`firestore/knowledge.ts` passes the RAG's error through as a 502). A failed `fetch` now reads "We couldn't
  reach the server". The render error boundary no longer prints the exception; it stays in the console.
- **Dependencies:** `npm audit fix` (no forced upgrades) took production findings from 8 high to 4. All 4 come from
  `@grpc/grpc-js` under `firebase`'s Firestore package, which is Node-only and not in the bundle (we use only
  `firebase/app` and `firebase/auth`). The rest are dev-only (`eslint`'s `minimatch`), with fixes that need major
  upgrades.
- **Not ours to fix in code:** the live bundle has the demo Firebase settings, so the `VITE_FIREBASE_*` and
  `VITE_API_BASE_URL` variables aren't set in Vercel. Sign-in also needs the platform API hosted somewhere.
- **Tests:** lint, typecheck, format, 49/49 tests (new: the client's error messages), and the build.
- **For later:** error reporting is the console only; a hosted error tracker would need picking against the
  free-only rule.

### 2026-11-06: public website for Meta (WhatsApp Business Platform) verification

You asked for the pages Meta Business Verification and App Review need for the WhatsApp Tech Provider program,
on liftoffsol.com (this `frontend/`, on Vercel).

- **Pages** (`frontend/src/features/site/`): `/about`, `/contact`, `/privacy`, `/terms`, `/data-deletion`, and a
  rewritten `/`. Every public page and the sign-in page has the same footer: © year, address, phone, email and links
  to the five pages.
  - The business details live once, in `business.ts`, exactly as registered.
  - The homepage now describes AI customer support on WhatsApp: how it works in four steps, who it's for, and a
    call to action. The invented customer names and testimonial are gone.
- **Your choices:** the Privacy Policy names OpenAI, Google (Gemini) and DeepSeek (the studio offers all three), keeps
  message logs 90 days, and names the Grievance Officer by title. The Contact page has no form: email and phone
  links only.
- **Name:** LiftOffSol in the page titles, metadata, sign-in page and app header.
- **Static HTML:** `npm run build` now also writes each public page as HTML (`scripts/prerender.mjs`, from
  `src/features/site/prerender.tsx`), so Meta's crawler and search engines read the full page without
  JavaScript. Other paths get the empty `shell.html`, so `/app` doesn't show the homepage while loading.
- **Routing:** before this, the live site answered 404 for every path but `/`, as Vercel had no fallback to the
  app. `frontend/vercel.json` adds clean URLs (`/privacy` serves `privacy.html`) and sends other paths to
  `shell.html`; `nginx.conf` does the same locally. This assumes Vercel's root directory is `frontend`.
- **Head:** title "LiftOffSol – AI Customer Support on WhatsApp", description, Open Graph tags, the favicon, and an
  empty `facebook-domain-verification` tag to fill in. `public/` adds `sitemap.xml`, `robots.txt` and `icon.png`.
- **Tests:** frontend lint, typecheck, format, and 46/46 tests (new: each public page opens with its footer). The
  build wrote the six pages; checked in headless Chrome with JavaScript off, and at phone width. Not deployed.
- **For later:**
  - Nothing deletes message logs after 90 days yet. Build that before WhatsApp goes live, or the policy isn't true.
  - Gemini's free API tier lets Google use the data; use a paid key so "only to generate the reply" holds.
  - Google sign-in still shows `liftofsolutions-123.firebaseapp.com`; a custom auth domain would show ours.
  - Have the Privacy Policy and Terms reviewed by a lawyer.

### 2026-11-02: Workflows, built to run later

You asked for respond.io-style workflow templates, and said it's fine if they don't run yet. A workflow is one
trigger and the steps it runs; the platform will run it, not the RAG.

- **Data:** a new `workflows` collection (`Schema_liftofsol/workflow-schema/`, README 13.2).
  - Triggers: conversation opened, message received, conversation closed.
  - Steps: send message, hand to an AI agent, assign (in turn, a teammate, or nobody), ask a question (saved on the
    contact), add a note, wait, close, and branch.
  - A branch asks a yes/no question (business hours, returning contact, has an email), and can't hold another
    branch. At most 30 steps.
  - New permissions `workflows.view` (members get it by default) and `workflows.manage`.
- **API** (`platform-api/src/firestore/workflows.ts`): list, get, create, save (with `expected_version`), turn on,
  turn off and delete, each audited. Unfinished workflows save, but turn on only when every agent and teammate is
  picked (422 `workflow_incomplete`).
- **Screens** (`frontend/src/features/workflows/`):
  - A Workflows page in the sidebar.
  - A template browser with categories and search, plus "Start from scratch".
  - A page per template: benefits, how it works, and its steps drawn.
  - A full-page editor: the steps drawn on the left, with + between them; the selected step's settings on the
    right; Save and Turn on.
- **Templates:** welcome message, away message, assign in turn, AI agent first, ask for an email, unassign after
  close, thank-you after close.
  - "Close after no reply" was in my proposal but needs a "wait for a reply" step, so it was swapped for the
    thank-you one.
- **Placeholders:** nothing runs a workflow; business hours and round-robin turns aren't designed yet (Schema README
  section 14). The screens say so.
- **Tests:** `npm run test:firestore` 37/37 (new: the lifecycle, and the step rules). Frontend lint, typecheck and
  39/39 tests. Not run: a browser pass.

### 2026-11-02: agent studio redesign: full page, templates, model and flow

You asked for a respond.io-like studio. You chose a flow picker and a model picker, skills as a placeholder, and
three templates.

- **New agent:** pick Customer support, Receptionist or Sales assistant, or Start blank. A template fills the
  name, description, tone and instructions (`frontend/src/features/assistants/presets.ts`). The API's create takes
  optional `instructions` and `tone`.
- **Studio:** a full page of its own, without the app's sidebar (its own route in `App.tsx`).
  - The top bar has back, the name and description (with an edit button), status, version, Discard, Save,
    Publish, and More (pause, resume, archive).
  - Below it, 60/40: Instructions (with tone and languages), Knowledge source, How it answers, and Skills on the
    left; the test chat on the right, full height. Below 1024 px they become Setup and Test tabs.
  - The studio's Channels tab is gone; the Channels page is unchanged.
- **How it answers:**
  - Model: GPT-5.4 mini (default), GPT-5.5, GPT-5.4 nano, Gemini 3.5 Flash, Gemini 3.1 Pro (preview), Gemini 3.1
    Flash-Lite, DeepSeek V4 Flash or V4 Pro.
  - Steps: "Answer directly", or "Answer, then check", where a review step can send a reply back up to twice.
  - Saved as the draft's `model` and `flow`; each picks the RAG node handler and the template's shape.
  - `db:init` now also creates the `gemini_chat` and `deepseek_chat` node types.
- **Limits found with the real RAG:**
  - "Answer, then check" fails on Gemini once the review sends a reply back. The RAG then asks Gemini with a
    request ending in a model turn, which Gemini refuses. So the check step is for OpenAI models only: the API
    answers 422 `flow_not_supported`, and the studio disables the option.
  - Grok is left out: the RAG reads `XAI_API_KEY` but `server.env` has `GROG_API_KEY`. Both are in
    `Schema_liftofsol/README.md` 13.1 for the teammate.
- **Skills:** a "Coming soon" section with four cards: hand over to a teammate, close the conversation, update
  contact details, add tags. Nothing runs yet; they need RAG tool nodes and channels.
- **Data:** the one agent made before this ("Agent 1", emulator) got `model: gpt-5.4-mini` and `flow: direct`.
- **Tests:** `npm run test:firestore` 35/35 (new: a template's start, the checked flow's graph, an unknown model, and
  Gemini refused for the check step). Frontend lint, typecheck and 39/39 tests.
  - End to end with the real RAG: DeepSeek V4 Flash and GPT-5.4 mini ("Answer, then check") answered and remembered
    the conversation. Gemini answered too, until a review sent a reply back.
  - The review step passed every reply first time, so a real send-back on OpenAI wasn't seen.
  - 11 throwaway `agent-e2e-…` users are on the emulator only.
  - Not run: a browser pass of the new studio.

### 2026-11-02: Agents, with knowledge and the test chat in one studio

- **What an agent is:** the platform's `assistants` record holds what the team edits: a draft (`instructions`,
  `tone`, `languages`, one `source_id`) and, once published, a copy of it. The RAG runs its own `agents` and
  `agent_templates` records, which the platform writes. Detail: `Schema_liftofsol/README.md` 13.1.
- **One RAG agent per set of settings, never edited:** the RAG caches those records in memory and doesn't read them
  again, and it has no drafts.
  - Publishing (and resuming) writes a new RAG agent for customers (`live_agent_id`). Pausing and archiving delete
    it.
  - Testing a new draft version writes a new RAG agent for the test chat (`test_agent_id`). The draft is tested
    without changing what customers get.
  - A replaced RAG agent is deleted with its template and its chat history.
  - **Why:** you chose the recommended options: draft, then Publish, a fresh RAG copy per publish and per draft
    test, the model fixed at `gpt-5.4-mini`, and one knowledge source per agent.
- **Each RAG template** is `input → reply → history → output`. `reply` is `openai_chat` with a system prompt built
  from the instructions, tone and languages. When there's a source, it searches it (`rag_search`), and the
  template's `rag_id` is the source. `history` is `chat_history`.
  - The two platform node types are created by `npm run db:init` (the stack's `api-init`), on the emulator only.
- **API** (`src/firestore/assistants.ts`), under `/projects/:id/assistants`:
  - List, create, get, `PATCH` (save the draft, with `expected_version`), and `DELETE` (archive).
  - `…/publish` (with `expected_version`; the source must be ready), `…/pause`, `…/resume`.
  - `…/test` (`message`, `convo_id`) answers from the saved draft. It says `restarted` when the draft changed, since
    the new RAG agent has no memory of the chat so far.
  - Permissions: `agents.view`, `agents.create`, `agents.update` (save), `agents.test`, `agents.publish` (publish,
    pause, resume), `agents.archive`. The plan's `limits.agents` (5 on the dev plan) counts agents that aren't
    archived.
  - Knowledge: a document an agent uses can't be deleted (409 `source_in_use`).
- **Web app:** one studio per agent, as you asked: setup and knowledge on the left, the test chat on the right.
  Below 1024 px the two sides become Setup and Test tabs.
  - The Knowledge tab picks the agent's one document (or none), uploads a new one (and selects it), and deletes
    documents. It shows the status, and a notice while the selected document is being read or has failed.
  - Sending a test message saves unsaved changes first. The chat keeps one conversation until "New chat".
  - Knowledge and Playground are gone from the sidebar. Their old links open Agents. The Knowledge list, source
    detail and Playground pages were removed; copies are in `untracked/removed-2026-11-02/`.
  - The agent cards and Overview show the new status (`Draft`, `Published`, `Paused`), the model, and the document.
  - The sidebar's "failed sources" badge went with the Knowledge item.
- **Tests:**
  - `tests/firestore/assistants.test.ts` uses a stand-in RAG. It covers save, the version check, test and reuse,
    publish waiting for the document, a new test agent per draft (the old one and its history deleted), the
    document in use, pause, resume (runs the published settings), archive, a member who may test but not edit, the
    plan limit, and the RAG down. `npm run test:firestore`: 34/34. Frontend: lint, typecheck and 39/39 tests.
  - End to end with the real RAG on the host, on the emulator: the agent followed the draft's instructions,
    remembered an earlier turn ("Your name is Priya"), and archiving removed its RAG records and chat history.
    Three throwaway users (`agent-e2e-…@example.test`, emulator only) were left behind.
  - Not run: a browser pass of the studio (see `untracked/pending-tests.md`).
- **For later:**
  - A new RAG agent per publish also starts customers' open conversations afresh. When channels arrive, ask the RAG
    owner for a way to reload a changed agent, so the live RAG agent can keep its id. Conversations should point to
    the platform's agent id, not the RAG's.
  - The RAG keeps serving a deleted or paused RAG agent from its cache until it drops it. The platform no longer
    sends it anything, and the ids aren't guessable.
  - The RAG's answers carry no citations, so the test chat shows none.
  - Test messages are paid model calls with no limit beyond the API's 300 requests a minute, and they aren't
    billed.
  - Production needs the two node types created in the real database. Ask before doing it.

### 2026-10-31: browser test round 5

- **Result:** of 43 checks, 37 passed and 6 weren't run or were only partly run. No failures are left open. The
  report is in Codex's outputs folder (`round5-report.md`).
- Codex tested Knowledge end to end. These passed:
  - text, Markdown, Word, PDF and .zip;
  - a long manual: 18,300 tokens in 43 searchable chunks;
  - a broken PDF, which failed with the RAG's reason;
  - the limits, file cleanup and delete.
- **Fixed, Minor:** deleting a source while the RAG was still reading it showed the RAG's raw refusal on the page,
  behind the still-open dialog.
  - The error now shows inside the dialog.
  - The API turns the RAG's 409 into "This document is still being read. You can delete it once it shows Ready
    or Failed." The RAG can't stop a running job, so refusing is right.
  - New emulator test: 30/30.
- **Fixed, Cosmetic:** the Delete button (and Account → "Sign out everywhere") had red text on a grey outline.
  Both now use the existing `destructive-outline` variant.
- Both fixes passed Codex's browser retest after a rebuild.
- Codex also checked the AI service being down: uploads and deletes showed a clear error, and nothing was half
  made. After a restart, a new upload became Ready.
- **Fixed, Minor:** the Settings → Projects tab was titled "Page not found" in the browser tab. The list of page
  names was written out by hand and had missed `projects`. It's now built from the Settings tabs (`navigation.ts`).
- **Fixed, Major (found by hand):** adding a password to a Google account made Firebase mark the email
  unverified, so the "verify your email" banner came back.
  - The cause was `linkWithCredential`, which re-registers the email.
  - `setPassword` now calls `updatePassword`. That also adds password sign-in and leaves verification alone.
  - Checked against real Firebase Auth with two throwaway `@example.com` users: linking cleared verification, and
    updating kept it. On both, the password worked for sign-in.
- **Also passed:**
  - Member views: the knowledge list and details, with no Add or Delete, and no Projects page (403).
  - Project access, archive and unarchive.
  - Settings at 390 and 320 px, with a populated Knowledge list.
  - The sidebar, Billing, time zone, ⌘K and an invalid invite.
  - Adding a password to a Google account, and changing a password (other sessions signed out).
- **Not run or partial:**
  - B1, because its test address isn't one we can open.
  - An invited account that isn't verified.
  - The one-minute sign-out timing.
  - Real zoom at 400%, and the populated table at real zoom.
  - Reduced motion and VoiceOver (optional).
  - The list to run is in `untracked/pending-tests.md`.
- Codex couldn't test the 24-hour deletion of an upload the RAG never reads, so it now has an emulator test.
  Emulator tests: 31/31.
- Test data was cleaned up. All 11 uploads are deleted, and the test project is archived.

### 2026-10-31: Knowledge, on the RAG service

- **How it works:** one upload is one knowledge source, and one RAG knowledge base.
  - The API keeps the file on its own disk (the `uploads` volume) and creates a job on the RAG.
  - It hands the RAG a signed, one-hour link to download the file. Status and counts come from the RAG's own `rags`
    and `rag_jobs` records.
  - The `maintenance` job deletes the file once the RAG has read it (ready or failed), or after 24 hours. To change
    a source, upload the new version and delete the old one.
  - **Why:** you were unsure about storage and worried about space. This keeps nothing long-term and needs no
    storage service. Keeping originals (e.g. Backblaze B2's free tier) can come later if it's needed.
- **API** (`src/firestore/knowledge.ts`):
  - `GET/POST /projects/:id/knowledge/sources` and `GET/DELETE …/sources/:sourceId`, gated by `knowledge.view` and
    `knowledge.manage`.
  - The upload is multipart: a `name` field, then the file.
  - File types are the ones the RAG reads (`.pdf .docx .txt .md .zip .rar .tar`), up to 20 MB.
  - A failed upload leaves nothing behind (no RAG job, record or file). An unreachable RAG gives 503.
  - New schema file: `Schema_liftofsol/knowledge-source-schema/`.
  - New settings: `RAG_SERVICE_URL` (Docker: `host.docker.internal:8001`) and `PUBLIC_API_URL`, the address the RAG
    downloads from.
- **Web app:**
  - Knowledge lists sources with their status and has "Add knowledge" (name, file).
  - The detail page shows status, file details, how the RAG read it, and Delete.
  - Both check again while the RAG is still reading: every 10 s on the list, every 5 s on the detail page.
  - The old per-document screens, the website-source option and archiving are gone, since the RAG has no such
    things.
- **Tests:**
  - `tests/firestore/knowledge.test.ts` runs a stand-in RAG covering upload, read, cleanup, a forged link, a wrong
    file type, no permission, delete, and the RAG being down. `npm run test:firestore`: 29/29.
  - End to end with the real RAG on the host: a .txt upload became Ready ("Whole document", 47 tokens), the file
    was deleted within a minute, and Delete removed the RAG's record.
- **Local run:** the RAG isn't in the Docker stack. For Knowledge, start it on the host against the emulator:
  `cd ../LiftOfMain && FIRESTORE_EMULATOR_HOST=localhost:8080 uv run fastapi run src/main.py --port 8001`.
- **For later:** the file link must be reachable from wherever the RAG runs, so `PUBLIC_API_URL` must be set in
  production. Agents still list sources as a multi-select; the Agents step changes it to one source.

### 2026-10-31: quick wins: project settings and the organization's URL name

- **Settings → Projects** (`/app/projects`, owners and admins) lists the organization's projects. Each one has:
  - **Access:** switch Members in or out. Owners and admins show "All projects". This uses
    `PUT /projects/:id/access`, which also rewrites the RAG's `project_members` copies.
  - **Rename.**
  - **Archive or Unarchive**, with a confirmation explaining that agents stop answering and that nothing is lost.
- It also appears as a Settings tab and in ⌘K.
- Per-person grants and denies, and role-wide permission changes, have API support but no screen yet. Add them only
  if needed.
- **Settings → General → URL name** can now be edited by owners: lowercase letters, numbers and hyphens. A taken
  name says so; uniqueness is the claimed `organizations.slug` value.
- **Tested end to end** on the live stack:
  - a new Member joined through an invite link and saw "No projects yet";
  - the Owner added them under Projects → Access, two `project_members` copies appeared, and the Member then
    reached the project;
  - rename, archive and unarchive, and the URL name, all held after a reload.

### 2026-10-31: Firestore port finished; the local stack runs on Firestore

- **Phase 3:**
  - `src/firestore/tools.ts`: tool runs (enqueue, approve or reject, claim and complete, review). The
    idempotency key is a claimed value.
  - `src/firestore/billing.ts`: credit periods, admission and settlement of agent runs, the billing profile,
    invoices and the ledger. Ledger keys are claimed; a usage charge's id is the run's id.
  - The RAG's `agents` and `transactions` records are read through minimal types (`AgentRecord`,
    `TransactionRecord`).
- **Phase 4: `src/firestore/maintenance.ts`** runs every minute. It rolls due credit periods, expires overdue
  approvals, closes old resolved conversations, settles finished runs, and sends stale tool runs to review.
  - It also deletes expired invitations (7 days after expiry), notifications, audit events and billing events.
    The free plan has no TTL policies, so this replaces MongoDB's TTL indexes.
  - Locally it refuses to run against anything but the emulator.
- **The switch:** `docker-compose.yml` is now the Firestore stack (project `liftof-platform`). The old file
  described the retired legacy stack.
  - It runs the Firestore and Auth emulator (data kept in the `firestore_data` volume), `api-init` (seeds the
    plan), the API (`DATABASE_BACKEND=firestore`), maintenance, and the frontend.
  - Real Firebase Auth stays switched on through `.env`.
  - `src/firebase/admin.ts` now uses the service-account credential whenever `GOOGLE_APPLICATION_CREDENTIALS` is
    set, even beside the Firestore emulator, because real Auth needs it.
  - Local app data starts empty on Firestore; Firebase sign-in accounts are unchanged.
- **Indexes:** 17 composite indexes in `firestore.indexes.json`, not deployed yet.
- **Tests:** `npm run test:firestore` gives 26/26, now including tool runs, billing and the maintenance sweep.
  - Smoke test on the live stack: first sign-in, terms, first project, and every page with a backend loaded,
    with no API errors.
- **MongoDB removed (the user's call):** `src/mongo/`, `tests/mongo/`, `docker-compose.mongo.yml`, the `mongodb`
  package, the `MONGODB_*` settings and `MIGRATION.md`.
  - `src/mongo` had never been committed, so it's gone for good.
  - `DATABASE_BACKEND` now defaults to `firestore`. `npm run db:init` seeds the emulator.
  - `test:firestore` uses its own emulator on port 8085, so it runs beside the stack.
  - The MongoDB stack's data volumes still exist (`liftof-platform-mongo_*`).
  - `src/modules/` (the old Firestore API) stays until decided.

### 2026-10-31: Firestore port, phase 2 (contacts, inbox, notifications)

- **`src/firestore/inbox.ts`** ports the inbox: contacts, conversations and messages, claim, transfer, resolve and
  the other moves, teammate replies, and notifications.
  - Unique values (a delivered message's key, a conversation's open key, a contact's channel identity, a
    notification's dedupe key) are `unique_values` claims, which also find their holder by id. No extra index is
    needed, and they hold under concurrent deliveries.
  - Closing a conversation frees its open key.
- **Older history (UX-04):**
  - `GET …/messages` takes `?before=<message id>` and returns `next_cursor` while older messages exist.
  - The thread has "Load older messages". It keeps the reading position, and follows new messages only while
    you're at the bottom.
  - On the MongoDB backend the button never shows, because that backend returns no cursor.
- **New:** `POST /notifications/read-all`. The bell's "Mark all as read" called it, but neither backend had it.
- **Indexes:** eight composite indexes for contacts, conversations (by status, assignee or contact), messages and
  notifications, in `firestore.indexes.json`. They aren't deployed; the emulator doesn't check them.
- **Tests:** `tests/firestore/inbox.test.ts` has 5 tests: the four MongoDB inbox cases and history paging.
  - Shared emulator setup now lives in `tests/firestore/harness.ts`.
  - `npm run test:firestore`: 19/19.
- **Still on MongoDB:** tool runs, billing and the maintenance sweeps, then the stack switch.

### 2026-10-31: browser test round 4

- Every audit fix held in the tested states. One Minor failure: someone with an unverified email who opened a dead
  invite link was stuck on "Verify your email to join", with no way out.
- **Fix:** `InvitationVerificationGate` now asks `/auth/invitations/preview` first. The API checks the link before
  the email.
  - A dead link shows "This invitation can't be used" with "Continue to my workspace".
  - A good link still asks for verification, and now has "Not now".
  - Tested on the live stack with a throwaway unverified account, deleted afterwards.
- **Browser-only follow-up:**
  - The invalid-link fix passed.
  - New: at 390 px the Team table squeezed names and emails to about 7 px. The identity block is now 144–256 px
    wide, and the table scrolls sideways instead.
- **Still unverified:** real 200% and 400% browser zoom (only smaller viewports were tried), the password mismatch
  message and an actual password change, and the solo-account join (B1).

### 2026-10-30: AI accent on the landing page

- The pill "AI customer service with cited answers" above the hero heading has a soft rainbow in its text and
  hairline border, drifting slowly (10 s a cycle). It uses the `ai-text` and `ai-border` utilities in `index.css`
  and the `--ai-1` to `--ai-5` colour tokens in `theme.css`.
- Every stop reaches 4.5:1 or more on the canvas (4.8 to 13:1), so the 14 px text stays readable at any moment.
  Dark mode uses lighter, pastel stops.
- It's still when "reduce motion" is on, and plain text in forced-colours mode. It's pure CSS, with no new
  dependency.

### 2026-10-30: add or change a password

- **Account → Security → Password.**
  - Someone who signs in with Google can add a password, so the same email also signs in with email and password
    (Firebase `linkWithCredential`). If Firebase wants a recent sign-in first, Google asks again in a pop-up.
  - Someone with a password can change it: the current password is required (`reauthenticateWithCredential`, then
    `updatePassword`).
  - Code: `setPassword()` in `frontend/src/features/auth/AuthProvider.tsx`.
- Firebase signs other devices out when a password changes; this device takes a fresh token and stays signed in.
- Tested on the live stack with a throwaway account, created and deleted afterwards:
  - after the change, a reload still got 200 from `/auth/me`;
  - the old password is refused and the new one works.
  - Adding a password to a Google account needs a real Google sign-in, so it hasn't been run end to end.

### 2026-10-30: fixes from the Codex UI/UX audit

Codex audited the running app against WCAG 2.2 AA, NN/g heuristics and the Stitch screens: 7 P1 and 11 P2 findings, no P0.
- **Contrast (UX-05, UX-06):**
  - Dark primary is now indigo-400 `#818cf8` with dark text on buttons. It passes as text and as a button; the old
    `#6366f1` failed both.
  - Destructive is `#dc2626` with a darker hover in both themes.
  - The input outline (`--input`) is 3:1 or more on every surface: `#808a9c` light, `#64748b` dark.
  - The phone tab badge now has dark text on amber.
- **Focus (UX-07, UX-09):**
  - Underline tabs, settings links and segmented tabs have an inset focus ring, since their strips scroll sideways.
  - The ⌘K palette and the mobile drawer return focus to whatever opened them (`hooks/use-return-focus.ts`).
- **Inbox (UX-01):**
  - The queue and thread sit side by side only from `lg`. Below that, one pane shows at a time, as on phones.
  - Under 30rem of height (e.g. 400% zoom), the page scrolls instead of squeezing the list to nothing (the `tall`
    variant in `index.css`).
- **Honest states (UX-02, UX-11):**
  - Playground, Approvals, Contacts, Team, Billing, the conversation and the source detail now show load failures
    instead of empty data.
  - A feature the API doesn't offer yet shows a blue "Not available yet: …" notice instead of a red error.
  - Its create buttons and setup steps are no longer offered.
- **Joining asks first (UX-03).** A signed-in person who opens an invite link now sees "Join X?": their role, that
  their workspace closes, and how many projects stay behind. Nothing changes until they press Join.
  - New read-only endpoint: `POST /auth/invitations/preview`, in both backends, with tests.
  - First-time sign-ups through an invite still join directly; they have no workspace to lose.
- **Navigation (UX-08, UX-10, UX-12):**
  - The brand link and the ⌘K input have accessible names.
  - On phones the pill shows the project, the theme toggle moves to ⌘K and Account, and the escalations chip
    shows only its count.
  - Approvals appears for anyone with `tools.view`.
- **Lists the API caps (UX-13):** counts read "50+" at the cap, and the Inbox and Contacts say that search covers
  only the loaded items.
- **Smaller fixes:**
  - Approval deadlines (UX-15): "expired" only after the real deadline, a countdown that stays current, and Approve
    and Reject disabled once expired.
  - Form hints (UX-14) are tied to their control.
  - Team on phones (UX-16) shows the list before the counts.
- **Deferred:**
  - UX-04, loading conversation history older than the latest 50, goes into the Firestore inbox port with cursor
    paging and server-side search (the full UX-13).
  - UX-18, warning before leaving the agent studio with unsaved changes, needs a data router or link guards. It
    waits until the studio can be used.
  - UX-14's marking of fields rejected by the API.
  - UX-17, the landing page's placeholder logos and testimonial, is an open product decision.

### 2026-10-30: two product rules changed

- **Joining leaves your projects behind.** Accepting an invitation still moves the person and closes their old solo
  organization. Their own projects now stay in that closed organization: kept, but nobody can open them.
  - **Why:** a joiner shouldn't use up the company's project slots. The retest found a joiner's old "project-1"
    taking the inviting organization's last slot.
  - The accept no longer checks the project limit. The Firestore port deletes the joiner's RAG copies for the
    projects left behind.
- **Only owners and admins create projects.** The member role no longer has `projects.create` (`ORG_ROLE_ACTIONS`).
  - The API refuses it with 403, and "New project" is hidden for members.
  - A member with no project sees "Ask an owner or admin to add you to one" instead of a create form.
- **Where:** `Schema_liftofsol` (README 4.3, 5.4, 6.4 and 6.5; `users.types.ts`, `projects.types.ts`,
  `organizations.types.ts`), both backends' `acceptInvitation`, and `WorkspaceSetup.tsx`.
- **Tests:** in both suites, the rollback test now fails the move with an active subscription on the old
  organization. A new test checks that projects stay behind and that a member is refused.
- **Overview** shows only the setup steps the person can do, and hides the card when there are none.
- **No GitHub sign-in for now.** The button, the Firebase GitHub provider and its icon are removed from the frontend,
  and `/auth/providers` reports `github: false` in both backends.
  - The schema still lists `github` as a possible sign-in method, so adding it back later is a small change.
- **Third browser test:** every round-2 fix held, and both new rules held. Small follow-ups:
  - the Channels page hides its tab strip when only one tab is available;
  - the Inbox page has an "Inbox" heading for screen readers;
  - the last "assistant" wording is gone from screens not reachable yet.
- **Future consideration:** a closed organization's projects keep their status, so their agents could keep
  answering. The agent and inbox work should check that the organization is active.

### 2026-10-30: fixes from the first browser test

A browser test with Claude in Chrome (prompt: `untracked/browser-test-prompt.md`) found 16 issues. All are fixed in the
frontend, plus one in the API.

- **Failures no longer look like empty data.** `apiRequestOptional` used to turn every 403/404 into "nothing here",
  so pages without a backend showed "No agents yet" and zeros.
  - Now only a 403 or a `resource_not_found` 404 counts as empty. A missing route is an error.
  - Pages show it with the new `LoadError`: "Couldn't load agents: this isn't available yet."
  - Dialogs that hit a missing route say "This isn't available yet." instead of "Request failed (404).".
- **Projects can be created** from the project pill or ⌘K ("New project"). ⌘K also lists and switches projects.
- **Invitations can be revoked**, from the Revoke button on pending rows.
  - The invite dialog labels its link with the email it is for, clears it when the email changes, and has a Copy
    button.
- **Billing shows credits** from `/billing/account`: included left of the monthly amount, used this period, and
  purchased. It used to ask for analytics, which isn't built.
- **Account:** time zone and language are pickers. Phone shows its format and is checked in the browser. A 422 now
  names the fields ("Please check: phone.").
- **Smaller fixes:**
  - Settings sub-tabs are in the URL (`?tab=`), so a reload keeps them.
  - The tab-strip scrollbar is gone.
  - Browser tab titles are correct on the 404 and sign-in pages.
  - The loading screen shows the brand.
  - The Inbox "Mine" checkbox has a label.
- **Wording:** "agent" means an AI agent everywhere. People are "teammates", and the role shown as "Agent" is now
  "Member". The Contacts page says "contact"; "Tool approvals" is now "Approvals"; the app says "Lift Off".
- **API: revocation check cached** (`firebaseTokens()` in `src/firebase/admin.ts`). Checking revoked tokens asked
  Firebase about the user on every request, about 350 ms each.
  - The answer is now kept per user for a minute.
  - "Sign out everywhere" through the API still applies at once.
- **Tests:** the Firestore emulator suite has a 20 s per-test timeout. The emulator queues overlapping transactions
  slowly, and the 5-way concurrency test sometimes passed 5 s.
- **Retest follow-ups** (`untracked/browser-retest-prompt.md`; 14 of 16 fixes held on the first retest):
  - Time zones show current IANA names: Chrome still lists `Asia/Calcutta` and other old names, which are mapped to
    `Asia/Kolkata` and so on.
  - Languages read "English (United States)" rather than "American English".
  - The last "customer" and "assistant" wordings are gone.
  - The Team role filter offers only Owner, Admin and Member.
  - Revoking an invitation asks for confirmation.
  - Errored queries aren't refetched when another component mounts (`retryOnMount: false`).
  - Fields align to the top in two-column forms.
- **A used invite link no longer blocks sign-in.** After signing in, the app accepts any `?invite=` in the URL. A
  refused accept used to fail the whole sign-in, every time, from that URL; this happens when the link was already
  accepted, has expired, or isn't allowed.
  - Now the reason shows as a toast, the link is dropped from the URL, and the person stays signed in.
  - A first sign-up with an invalid link goes ahead without it.
  - Code: `loadPlatformAccountOnce()` in `frontend/src/features/auth/AuthProvider.tsx`.

### 2026-10-29: Firestore port, phase 1 (users, organizations, projects)

- **New `platform-api/src/firestore/`, beside `src/mongo/`.** The running stack stays on MongoDB until every part is
  ported; then it switches and `src/mongo/` is deleted. Select it with `DATABASE_BACKEND=firestore`.
  - Ported so far: sign-in, account, terms, profile, organizations, members, invitations, projects and project access.
  - Still on MongoDB: inbox, tool runs, billing and the maintenance sweeps.
- **Storage layer (`database.ts`).** Typed `get`/`find` reads, and a `Tx` that holds writes until the end because
  Firestore needs every read before the first write.
  - Unique values are documents in `unique_values`, since Firestore has no unique indexes.
  - Detail: `Schema_liftofsol/README.md` section 16.
- **`project_members` copies for the RAG** are written by `syncAccessCopies()` in every transaction that can change
  who can use a project. The rule is in schema README 6.5.
- **`firestore.indexes.json` rewritten.** It now holds only what this backend needs: one index,
  `audit_events (org_id, created_at desc)`. The 14 indexes for the old `src/modules/` backend are gone.
- **Tests:** `npm run test:firestore` starts the Firestore emulator and runs `tests/firestore/` against a new named
  database each time.
  - It has 13 tests: the users and organizations cases from the MongoDB suite, plus the RAG copies and unique slugs.
  - It needs Java and the `firebase` CLI.
- **Small change:** `/auth/providers` reports GitHub as off, matching Firebase.

### 2026-10-29: real Firebase project set up, shared with the RAG

- **Database is native Firestore.** We dropped MongoDB and Firestore-with-MongoDB-compatibility for it.
  **Why:** the RAG (`LiftOfMain`) already reads native Firestore, so both services share one database.
- **The project.** `liftofsolutions-123`, Spark (free) plan. Database `(default)`, Native mode, Standard edition,
  in `asia-south1`. The location can't be changed. `.firebaserc` has the aliases `default` and `prod` for it.
- **Access.** Email/Password and Google sign-in are on. GitHub sign-in is not on yet.
  - The backends use the service account `liftof-backend`, with the roles Cloud Datastore User and Firebase
    Authentication Admin.
  - Its key is in `untracked/keys/firestore-sa.json`.
- **Rules deployed, indexes not.** `firestore.rules` (deny-all) is live.
  - The 14 indexes in `firestore.indexes.json` belong to the old `src/modules/` code. The Firestore port will
    write and deploy its own.
- **Checked.** `untracked/firestore-probe/probe.mjs` passed: read and write, a query, a transaction, a duplicate
  `create()` being refused, and a batch.
  - The RAG ran against this database and Pinecone index `rag-chunks` (`llama-text-embed-v2`, field `chunkText`).
  - A small document was stored as plain text; a 10.8k-token one became 30 Pinecone chunks. Both answered queries.
  - The test records and the two test rags were left in place on purpose.
- **Local stack signs in for real.** `docker-compose.mongo.yml` now reads the Auth emulator settings from `.env`
  (`FIREBASE_AUTH_EMULATOR_HOST`, `VITE_FIREBASE_AUTH_EMULATOR_URL`).
  - Empty values mean real Firebase Auth. Unset means the emulator, as before.
  - The api container mounts `untracked/keys` read-only at `/run/keys`. `GOOGLE_APPLICATION_CREDENTIALS` points at
    the key there, so no secret goes into an env value.
  - Data still goes to the local MongoDB until the Firestore port.
  - Users made while the emulator was in use are linked to emulator account ids. With real Auth, the same email gets
    a new Firebase id. Onboarding then refuses it with `EMAIL_ALREADY_LINKED`, because we never link accounts by
    email.
  - Fixed on 2026-10-30 for one real address by pointing its `auth_identities.subject` at the real Firebase uid. The
    other emulator users are test addresses.
- **RAG access: the platform writes `project_members` copies (option 1).** The RAG only lets an account use a
  project if `project_members/{projectId}_{userId}` exists.
  - The platform keeps one copy for each person who can see a project (owners, admins, anyone in `members`), in the
    same transaction as each access change.
  - `projects.members` stays the source of truth.
  - **Why:** the RAG and our permission rules both stay unchanged.
  - Detail: `Schema_liftofsol/README.md` 6.5 and `platform-api/RAG_INTEGRATION.md`.
- **Later.** Expiry rules (Firestore TTL policies) need the Blaze plan. Until then, expired records are removed by a
  cleanup sweep in the app.

### 2026-10-26: web app redesigned to the Stitch "Clean Modern" designs

- **One design system.** The Stitch export had two directions; we picked "Clean Modern" (slate canvas, white cards,
  one indigo accent, emerald/amber/red for state, Inter plus JetBrains Mono). All colours, radii, shadows and type
  sizes live as tokens in `frontend/src/styles/theme.css`, with a matching dark theme. **Why:** one place to change
  the look, and every component reads the same values.
- **Primitives restyled, not replaced.** Buttons (new `escalation` and `destructive-outline` variants), inputs with a
  focus glow, pill badges, underline tabs, uppercase table headers. Pages pick up most of the look from these.
- **New shell.** A full-width top bar (brand, organization/project pill, search, amber escalations chip, account)
  over a plain 224px sidebar with the design's labels: Agents, Approvals, Channels, Contacts. The shadcn sidebar,
  tooltip and separator components were removed. Settings is one entry with tabs (General, Team, Billing, Account),
  but each tab is still its own route. **Why:** simpler code, and old links keep working.
- **Pages re-laid out after the designs:** Overview (waiting banner, metrics, reply volume, agent fleet, pending
  approvals, setup), Inbox (three panes, AI/agent/customer bubbles, system hand-offs as amber notes), Approvals
  (queue plus detail), Agents (roster cards, studio tabs, dark prompt editor).
- **Only real data.** The designs show CSAT, lifetime value, per-agent latency, risk scores, token runway and AI
  reasoning. The API has none of these, so they are left out. The one risk signal on approvals is "Not retry-safe",
  which comes from the tool run's `idempotent` flag. **Why:** made-up numbers erode trust.

### 2026-10-26: review fixes to the MongoDB backend

- **No organization lock on inbox, tool-run and billing writes.** They used to write the organization document on every
  message, reply and charge, which queued all activity in an organization behind one document (Firestore suggests
  about one sustained write per second per document). The lock now covers only membership, invitations, project
  creation and moves, and access changes. **Why:** busy organizations shouldn't slow down.
- **Readable code.** `src/mongo/inbox.ts`, `tools.ts` and `billing.ts` rewritten readably (long functions split into
  named steps), and the whole API and Codex's frontend files run through Prettier. Generated schema copies are excluded,
  so `schema:check` still compares them byte for byte. **Why:** the code must be easy to fix by hand.
- **Support staff can finish their own conversations.** The assigned teammate can resolve, hand back to the AI or ask
  for help with `conversations.reply`; other status changes still need `conversations.manage`. Recorded in the inbox
  schema. **Why:** members could take and answer a conversation but not close it.
- **Organization permissions on the account no longer come from the first project.** Project permissions are only per
  project. **Why:** menus changed depending on which project happened to be first.
- **Fewer reads per request.** The user is read once per request, and the sign-in identity is cached in memory for
  10 minutes; the user's status is never cached. Firebase revocation checks stay on in production (one extra call
  per request) for security. **Why:** cost and speed.
- **Billing pages are read-only.** Viewing billing no longer runs the monthly roll-over; the maintenance job does it.
- **Maintenance** also closes conversations resolved 7+ days ago, settles stuck usage charges and moves crashed tool
  runs that can't be retried to `needs_review`.
- **Smaller:** link to the terms next to the acceptance checkbox (`TERMS_URL`, required in production);
  `*.tsbuildinfo` ignored; a removal point for the legacy Firestore API in `platform-api/MIGRATION.md`.
- Tests: 5 new MongoDB integration tests (`platform-api/tests/mongo/review-fixes.integration.test.ts`).

### 2026-10-25: local MongoDB platform backend

- Added the isolated Docker stack, MongoDB API, transaction-backed organization/project/inbox/tool/billing foundation, and frontend API wiring. Why: implement the approved platform schemas without changing the separately owned RAG service. See [`platform-api/README.md`](platform-api/README.md) and [`platform-api/MIGRATION.md`](platform-api/MIGRATION.md).
- Recorded the RAG data-access mismatch and the contract needed before connecting it. See [`platform-api/RAG_INTEGRATION.md`](platform-api/RAG_INTEGRATION.md).

### 2026-10-25: cleanup

- **Moved out of the repository** into `untracked/`:
  - The first design document (`AI_Customer_Service_Platform_System_Design_Updated.md`), which describes FastAPI,
    Celery and PostgreSQL. Kept for history; superseded by the Node + Firestore platform and the new schema.
  - `Schema_liftofsol.zip`, a 7 Oct snapshot of `Schema_liftofsol/` that the folder has outgrown.
- **Archived** in `untracked/archive/`: the first Python backend (its `llm/` RAG code, `pyproject.toml`, `uv.lock`,
  sample data), now replaced by `platform-api` and `../LiftOfMain`; and the old Supabase `frontend/.env.local`
  (auth moved to Firebase).
- **Deleted** regenerable files: the 192 MB Python `.venv` (nothing here is Python any more), `frontend/dist`,
  `platform-api/dist`, a coverage file and `.DS_Store` files.
- **Why:** one place for each thing; the repository holds only what the platform runs on.

### 2026-10-21 → 25: new database design (`Schema_liftofsol/`)

Started from the teammate's schema, kept their agent, knowledge and transactions designs, and reworked or added the
platform side. Every decision is in [`Schema_liftofsol/README.md`](Schema_liftofsol/README.md); the main ones:

- **Firestore with MongoDB compatibility** as the target database: MongoDB-style documents and indexes (unique,
  sparse, TTL) on Google's managed Firestore. Validators don't run there, so every rule is written down in each
  `*.types.ts` and checked in the API.
- **Sign-in kept separate from users** (`auth_identities`), so Firebase can be replaced later without touching user
  ids. Our own UUID is the user id, never the Firebase uid.
- **One organization per user.** Individuals get their own organization at sign-up; plans belong to organizations.
- **Invitations only** (no join codes). Invites last 24 hours; accepting needs a verified email.
- **Fixed roles** (owner, admin, member) with permissions settable per project, by role and per person.
- **Billing designed for correctness first:** credits in integers, every change applied once (idempotency keys),
  webhooks treated as signals and re-checked with the payment provider. Business choices (provider, prices, credit
  value) are still open.
- **Inbox:** handoffs are conversation status plus system messages, not a separate collection; contacts are not
  "customers" (that word means our paying users).
- Reviewed in several rounds (including by Codex); each finding was fixed in the schema files, examples and diagrams.

### 2026-10-23: security fix in the running API

- Accepting an invitation now requires a verified email (`platform-api/src/modules/auth/routes.ts`, test in
  `platform-api/tests/invitation-accept.test.ts`). **Why:** the email match alone let an unverified account that knew
  the invite link take someone else's place.

### 2026-10-22: web app rebuilt

- Rebuilt the UI on a free ShadcnStore template (MIT) with Tailwind v4 and shadcn-style components; light theme by
  default, dark selectable. **Why:** a consistent, maintainable design system at no cost; only MIT/Apache/BSD-style
  licences are used.

### 2026-08-27: moved to Node + Firebase

- Replaced the FastAPI + PostgreSQL backend with Node/Fastify and Firebase Auth + Firestore, and moved RAG into its
  own service. **Why:** one language across web and API, managed auth and database, and RAG owned separately.

## Local-only files

`untracked/` is git-ignored, so it exists only on the machine that has it.

| Path | What it is |
|---|---|
| `untracked/docs/` | Old design and status documents, migration notes (historical) |
| `untracked/archive/Schema_liftofsol-2026-10-07.zip` | Old snapshot of the schema folder |
| `untracked/archive/old-python-backend/` | The first Python backend and its RAG code |
| `untracked/archive/frontend.env.local.supabase` | Old Supabase settings (contains keys; don't share) |

Secrets live in `.env` and `frontend/.env` (also git-ignored); `.env.example` files show the variables.
