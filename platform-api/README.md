# Platform API

A Node 24, Fastify, TypeScript service. Firebase Authentication verifies sign-in. Platform data lives in native
Firestore, the same database the RAG service (`../../LiftOfMain`) reads. The older Firestore implementation on the old
schema is still in `src/modules/`, used only with `DATABASE_BACKEND=legacy-firestore`.

## Run the local platform

From the repository root, start Docker Desktop, then run:

```bash
docker compose up --build -d
docker compose ps
```

- Frontend: <http://localhost:5173>
- API readiness: <http://localhost:8000/ready>
- Firestore emulator: `127.0.0.1:8080`, with the Emulator UI at <http://localhost:4000>

**What runs**
- **The Firestore and Auth emulators.** Data is kept in the `firestore_data` volume: exported when the emulator
  stops and imported when it starts. `docker compose down` keeps it; `-v` deletes it.
- **`api-init`**, which seeds the development plan.
- **The API.**
- **`maintenance`**, once a minute. It rolls due free-plan credit periods, expires overdue approvals, closes
  conversations resolved 7 days ago, settles finished runs, and sends crashed tool runs that can't be retried to
  `needs_review`.
  - It also deletes expired invitations, notifications, audit events and billing events. The free Firestore plan has
    no TTL policies.
  - It deletes knowledge uploads once the RAG has read them, or after 24 hours.
  - It refuses to run anywhere but the emulator.
- **The frontend.**

**The RAG service** isn't in the stack. Knowledge uploads need it on the host, on port 8001, against the same
emulator: `cd ../../LiftOfMain && FIRESTORE_EMULATOR_HOST=localhost:8080 uv run fastapi run src/main.py --port 8001`.
The API reaches it at `RAG_SERVICE_URL`, and the RAG downloads uploads from `PUBLIC_API_URL`.

**Sign-in.** With `.env` setting `FIREBASE_AUTH_EMULATOR_HOST=` and `VITE_FIREBASE_AUTH_EMULATOR_URL=` empty, plus
`GOOGLE_APPLICATION_CREDENTIALS=/run/keys/<key>.json`, sign-in uses the real Firebase project. Left unset, the Auth
emulator's test identities are used.

**Running the API outside Docker.** Use Node 24, with the emulator running:

```bash
cd platform-api
npm ci
FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 FIREBASE_PROJECT_ID=demo-liftof-platform npm run db:init
FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 FIREBASE_PROJECT_ID=demo-liftof-platform npm run dev
```

## Design

**Code layout**
- `src/server.ts` starts the Firestore API.
- `src/firestore/` holds it:
  - `database.ts`, the storage layer;
  - `platform.ts`: users, organizations, projects and access;
  - `organizations.ts` and `http.ts`: routes;
  - `inbox.ts`, `tools.ts` and `billing.ts`;
  - `maintenance.ts`, the scheduled job;
  - `provision.ts`, the plan seed.
- `src/domain/schema/` holds generated copies of the reviewed schema types. Edit `Schema_liftofsol/` and run
  `npm run schema:sync`.

**Firestore specifics.** The full list is in `Schema_liftofsol/README.md` section 16.
- Firestore needs every read before the first write, so the transaction helper (`Tx`) holds writes back until the
  end.
- Unique values (email, sign-in identity, slug, idempotency and dedupe keys, open conversations, contact identities)
  are documents in `unique_values`, claimed in the same transaction.
- Composite indexes are in `../firestore.indexes.json`.

**The data model**
- One user belongs to one organization. A user has a stable platform UUID and a sign-in identity.
- Organizations own projects and billing accounts. Projects scope contacts, conversations, messages and tool
  approvals.
- Roles are owner, admin and member, and only owners and admins create projects. Permission overrides live on each
  project.
- Every access change also rewrites the RAG's `project_members` copies (README 6.5), and sensitive writes add an
  audit event in the same transaction.

**Locking.** The organization document acts as a lock only for membership, invitations, project creation and
access changes. Inbox, tool-run and billing writes don't take it, so busy conversations never queue behind each
other. Billing page views are read-only.

The main endpoints are under `/api/v1`:

| Area | Current behavior |
| --- | --- |
| `/auth` | Firebase token verification, first sign-in, profile, terms, invitation preview and acceptance |
| `/organizations` | Organization settings, members, invitations, projects, audit |
| `/projects/:projectId` | Project access, contacts, conversations, messages (with `?before=` paging), tool approval queue |
| `/projects/:projectId/knowledge/sources` | List, upload (multipart: `name`, then the file), view and delete knowledge sources |
| `/knowledge/files/:id/:name` | The signed, one-hour link the RAG downloads an upload from; no sign-in |
| `/notifications` | Notification feed, read state, read-all |
| `/plans`, organization `/billing` | Development plan, balances, profile, ledger, invoices; checkout reports 501 |

**Aliases and boundaries**
- `/businesses` aliases the organization routes for the existing frontend.
- There's no public inbound-message route. A verified channel adapter must call `Inbox.receive()` after validating
  its provider's signature.
- The agent runtime will call the internal billing and tool-run services when it's built.

## Tests and limits

```bash
cd platform-api
npm run schema:check
npm run build
npm test                 # unit tests
npm run test:firestore   # emulator integration tests (needs Java and the firebase CLI)
```

`test:firestore` starts its own emulator on port 8085 (`tests/firestore/firebase.test.json`), so it runs beside the
Docker stack. Each run uses a new named database.

This is a platform foundation, not a production launch.
- **Not built yet:** agents, channels, analytics, real payments and contact erasure.
- **Not deployed:** the Firestore indexes in `../firestore.indexes.json`.
- **Production scheduling:** the maintenance job is local-only.
