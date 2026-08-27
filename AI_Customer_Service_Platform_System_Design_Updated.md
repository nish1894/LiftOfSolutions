**AI Customer Service Platform**

Overall Project & System Design

Omnichannel customer service • FastAPI • Celery • PostgreSQL • Redis •
AI/RAG

<table>
<colgroup>
<col style="width: 100%" />
</colgroup>
<thead>
<tr class="header">
<th><p><strong>Document scope</strong></p>
<p>1. Overall system design of the complete product</p>
<p>2. Detailed system design of the AI Customer Service Platform</p>
<p>3. Initial deployment and cost strategy for a tiny user base</p>
<p>4. Evolution path from prototype to a mature production
architecture</p></th>
</tr>
</thead>
<tbody>
</tbody>
</table>

**Design principle**

*Build a modular monolith first. Keep channels, AI orchestration,
knowledge, tools and customer-service workflows cleanly separated so
each can scale independently later.*

# 1. Executive Summary

The product is an omnichannel AI customer-service platform for
businesses. A business configures an AI assistant once and connects it
to customer-facing channels such as web chat, WhatsApp and future
messaging channels. The platform answers questions from business
knowledge, performs approved business actions, maintains conversation
history and escalates to human agents when needed.

<table>
<colgroup>
<col style="width: 100%" />
</colgroup>
<thead>
<tr class="header">
<th><p><strong>Recommended starting stack</strong></p>
<p>Frontend: React + TypeScript + Vite + Tailwind</p>
<p>Backend: Python + FastAPI + Pydantic + SQLAlchemy + Alembic</p>
<p>Async jobs: Celery + Redis</p>
<p>Primary database: PostgreSQL; add pgvector when RAG is introduced</p>
<p>AI layer: provider abstraction with OpenAI as the first provider</p>
<p>Files: local storage in development; S3-compatible object storage
when external deployment needs persistence</p>
<p>Deployment: Docker Compose locally; free-tier services for prototype;
small VM/container deployment for a stable pilot</p></th>
</tr>
</thead>
<tbody>
</tbody>
</table>

# 2. Overall System Design - Complete Product

The complete project consists of a channel layer, a shared
customer-service platform, business integrations and operator/admin
experiences. Channel adapters should be thin: they convert
channel-specific events into the platform’s internal message model and
convert platform responses back into channel-specific responses.

<table>
<colgroup>
<col style="width: 100%" />
</colgroup>
<thead>
<tr class="header">
<th>Customer Channels<br />
Web Chat | WhatsApp | Future Channels<br />
|<br />
v<br />
Channel Adapters<br />
|<br />
v<br />
Conversation Gateway/API<br />
|<br />
v<br />
+---------------------------------------+<br />
| AI Customer Service Platform |<br />
|---------------------------------------|<br />
| Tenant &amp; Identity |<br />
| Conversation Engine |<br />
| AI Orchestration |<br />
| Knowledge / RAG |<br />
| Tool &amp; Action Execution |<br />
| Human Handoff |<br />
| Analytics / Audit |<br />
+---------------------------------------+<br />
| |<br />
v v<br />
Business Systems Human Agents<br />
CRM / Orders / Agent Inbox<br />
Tickets / APIs</th>
</tr>
</thead>
<tbody>
</tbody>
</table>

## 2.1 Product domains

| **Domain**                | **Responsibility**                                                                                  |
|---------------------------|-----------------------------------------------------------------------------------------------------|
| Channel adapters          | Web chat first; WhatsApp and other channels later. Normalize incoming messages and delivery events. |
| Tenant & identity         | Businesses, users, memberships, roles, authentication and authorization.                            |
| Assistant configuration   | Business-specific instructions, tone, languages, policies, enabled knowledge and tools.             |
| Conversation management   | Customers, conversations, messages, statuses, assignments and context.                              |
| Knowledge/RAG             | Documents, website content, chunking, embeddings, retrieval and citations/provenance.               |
| AI orchestration          | Context construction, model invocation, tool selection, streaming and response generation.          |
| Business tools            | Controlled actions such as order lookup, ticket creation, appointment booking or refund request.    |
| Human support             | Escalation, agent inbox, assignment, takeover and resolution.                                       |
| Observability & analytics | Usage, latency, AI cost, error rates, unresolved conversations, audit trails.                       |

## 2.2 Core request flow

1.  Channel adapter receives a customer message and identifies the
    business, channel and external customer identifier.

2.  Conversation service finds or creates the internal customer and
    conversation, then stores the incoming message.

3.  AI orchestrator loads assistant configuration, recent conversation
    context and applicable business policy.

4.  If required, the retrieval layer searches the business knowledge
    base and returns relevant chunks.

5.  The model generates a response or requests an approved tool call.

6.  Tool service validates authorization and parameters, executes the
    business action, and returns a structured result.

7.  Guardrails validate the final response and decide whether human
    escalation is required.

8.  The response is stored, streamed/sent through the originating
    channel, and usage/audit events are recorded.

# 3. AI Customer Service Platform - Detailed System Design

## 3.1 Architecture style

Start as a modular monolith: one FastAPI codebase, one PostgreSQL
database, one Redis instance and one Celery worker codebase. Modules are
separated logically, but deployment remains simple. This reduces
operational cost while preserving a migration path to independent
services if traffic or team size later requires it.

<table>
<colgroup>
<col style="width: 100%" />
</colgroup>
<thead>
<tr class="header">
<th>React Admin + Web Chat Widget<br />
|<br />
v<br />
FastAPI<br />
|<br />
+----------+-----------+----------------+<br />
| | | |<br />
Auth Platform AI Layer Job Producer<br />
| | | |<br />
+----------+-----------+----------------+<br />
| |<br />
v v<br />
PostgreSQL Redis Broker<br />
+ pgvector |<br />
v<br />
Celery<br />
Workers<br />
|<br />
Documents / Embeddings /<br />
Crawls / Async Integrations</th>
</tr>
</thead>
<tbody>
</tbody>
</table>

## 3.2 Backend modules

| **Module**    | **Key responsibilities**                                                                          |
|---------------|---------------------------------------------------------------------------------------------------|
| auth          | Registration, login, logout, session/refresh flow, password reset, identity verification hooks.   |
| businesses    | Tenant creation, profile, settings and ownership.                                                 |
| members       | Business memberships and RBAC: OWNER, ADMIN, AGENT.                                               |
| assistants    | Prompt/configuration, model settings, tone, languages, escalation rules and enabled capabilities. |
| customers     | End-customer identities, channel identities and optional profile data.                            |
| conversations | Conversation lifecycle, messages, status, context, assignments and streaming endpoints.           |
| channels      | Web widget configuration and channel adapter contracts; WhatsApp adapter later.                   |
| knowledge     | Sources, documents, parsing, chunking, embeddings, indexing and retrieval.                        |
| ai            | Provider interface, prompt construction, RAG, tool calling, response policy and token accounting. |
| tools         | Tool registry, schemas, authorization, execution, retries and audit.                              |
| handoff       | Escalation rules, agent queues, ownership, takeover and resolution.                               |
| analytics     | Operational metrics, AI usage/cost, conversation outcomes and dashboard aggregates.               |
| jobs          | Celery task definitions, retry policy, idempotency and job-state tracking.                        |

## 3.3 Suggested backend repository structure

<table>
<colgroup>
<col style="width: 100%" />
</colgroup>
<thead>
<tr class="header">
<th>backend/<br />
app/<br />
main.py<br />
core/ # config, security, logging, exceptions<br />
db/ # engine, sessions, migrations<br />
modules/<br />
auth/<br />
businesses/<br />
members/<br />
assistants/<br />
customers/<br />
conversations/<br />
channels/<br />
knowledge/<br />
tools/<br />
handoff/<br />
analytics/<br />
ai/<br />
orchestrator.py<br />
providers/<br />
retrieval/<br />
prompts/<br />
tool_execution/<br />
workers/<br />
celery_app.py<br />
tasks/<br />
storage/<br />
base.py<br />
local.py<br />
s3.py<br />
tests/<br />
alembic/</th>
</tr>
</thead>
<tbody>
</tbody>
</table>

## 3.4 Data model

Use PostgreSQL as the system of record because the product has strong
relational structure: users belong to businesses; businesses own
assistants, customers, conversations and integrations; conversations own
messages. PostgreSQL JSONB can store flexible provider/channel metadata,
and pgvector can later store embeddings without introducing a separate
vector database.

| **Entity**                  | **Purpose / important fields**                                                           |
|-----------------------------|------------------------------------------------------------------------------------------|
| users                       | id, email, password_hash, status, created_at                                             |
| businesses                  | id, name, status, settings_json                                                          |
| business_members            | business_id, user_id, role                                                               |
| assistants                  | id, business_id, name, instructions, model_config, status                                |
| customers                   | id, business_id, display_name, metadata                                                  |
| customer_channel_identities | customer_id, channel, external_id                                                        |
| conversations               | id, business_id, assistant_id, customer_id, channel, status, assigned_agent_id           |
| messages                    | id, conversation_id, sender_type, content, metadata_json, token_usage, created_at        |
| knowledge_sources           | id, business_id, type, source_uri, status                                                |
| knowledge_documents         | id, source_id, storage_key, checksum, processing_status                                  |
| knowledge_chunks            | id, document_id, content, metadata, embedding (phase 2)                                  |
| tools                       | id, business_id, name, schema, auth_config_reference, enabled                            |
| tool_runs                   | id, conversation_id, tool_id, request, result, status, audit timestamps                  |
| jobs                        | Optional application-level job/audit record even though Celery uses Redis as its broker. |

## 3.5 Authentication and authorization

Authentication should be **application-owned**, but security and protocol
primitives should come from mature libraries and standards. The goal is
not to avoid external tools at all costs; the goal is to own the product's
identity model while using proven components wherever they make the system
safer or more production-ready.

Initial authentication architecture:

```text
React
  |
  v
FastAPI Auth Module
  |
  +-- Email / password
  +-- Google OAuth / OIDC
  +-- GitHub OAuth
  +-- Session management
  +-- Account linking
  +-- RBAC / tenant authorization
  |
  v
PostgreSQL
```

Recommended identity tables:

```text
users
user_identities
sessions
business_members
```

`user_identities` allows one internal user to link multiple login methods,
for example local password + Google + GitHub.

Passwords must be hashed with Argon2 or another mature password-hashing
implementation. OAuth/OIDC, token signing/verification, CSRF protection,
password hashing and cryptographic operations must use established
libraries rather than custom cryptographic code.

For the browser admin application, prefer secure HTTP-only cookies for
session or refresh credentials. Authorization must always be tenant-scoped
on the backend; never trust a `business_id` supplied by the frontend without
verifying membership.

Initial roles:

- OWNER
- ADMIN
- AGENT

Production rules:

- Every business-owned row must carry `business_id` directly or inherit it
  through a verified relation.
- Enforce tenant checks in service/repository boundaries, not only in UI routes.
- Rate-limit login, registration and password-reset endpoints.
- Support session revocation and logout from all devices.
- Use OAuth state/PKCE and standard OIDC validation where applicable.
- Keep authentication audit events for security-sensitive actions.
- Add email verification and account-recovery workflows when local-password
  authentication is enabled.

### 3.5.1 Managed authentication services

Managed identity services such as Firebase Auth, Auth0 or similar products
are valid production choices, but they are **not foundational dependencies**
for this project.

For the initial platform, Firebase Auth does not provide enough additional
value to justify becoming the identity layer because Google/GitHub OAuth and
the required session/account model can be implemented cleanly inside the
FastAPI application using mature libraries.

The preferred decision is therefore:

```text
Own:
- users
- identities
- sessions
- tenant membership
- roles and permissions
- account linking behavior

Use mature libraries for:
- OAuth / OIDC
- password hashing
- token/session signing
- CSRF protections
- cryptographic primitives
```

A managed identity product should be reconsidered when it provides a
material production advantage, for example enterprise SSO/SAML, SCIM,
complex MFA, large-scale identity administration, advanced fraud controls,
or when authentication maintenance becomes a distraction from the product.

The authentication module should expose an application-owned interface so
the implementation can later be replaced by Firebase/Auth0/Keycloak or
another identity provider without changing the business, assistant,
conversation or authorization domains.

## 3.6 AI orchestration

<table>
<colgroup>
<col style="width: 100%" />
</colgroup>
<thead>
<tr class="header">
<th>Incoming Message<br />
|<br />
v<br />
Load Assistant + Tenant Policy<br />
|<br />
v<br />
Load Conversation Context<br />
|<br />
+----&gt; Retrieve Knowledge (when needed)<br />
|<br />
v<br />
AI Provider Interface<br />
|<br />
+----&gt; Text response<br />
|<br />
+----&gt; Tool call --&gt; Tool Policy --&gt; Business API<br />
|<br />
v<br />
Response Validation / Escalation<br />
|<br />
v<br />
Persist + Stream to Customer</th>
</tr>
</thead>
<tbody>
</tbody>
</table>

Do not scatter direct provider SDK calls across business code. Define an
AI provider interface for generate/stream/embed/tool-call capabilities.
The first implementation can use OpenAI, while preserving the ability to
add another provider later.

## 3.7 Celery and Redis

Celery is the asynchronous/background-task system. FastAPI handles
interactive requests; Celery handles work that is slow, retryable or
should continue independently of an HTTP request. Redis acts as the
initial Celery broker and can later also support caching, distributed
rate limiting and pub/sub.

| **Use FastAPI request path**      | **Use Celery**                             |
|-----------------------------------|--------------------------------------------|
| Receive/send chat messages        | Parse uploaded PDFs/documents              |
| Read conversation history         | Chunk documents and create embeddings      |
| Assistant CRUD                    | Crawl/import website knowledge             |
| Agent inbox queries               | Bulk synchronization with external systems |
| Lightweight order-status API call | Retry failed webhooks/integrations         |
| Stream model response             | Periodic aggregation/analytics jobs        |

Tasks should be idempotent where possible and carry a business/tenant
identifier. Store important task outcomes in PostgreSQL rather than
relying on Redis as the permanent system of record.

## 3.8 Knowledge and RAG - Phase 2

RAG should be introduced after the core SaaS and conversation flow is
working. The initial retrieval stack can remain inside PostgreSQL using
pgvector, avoiding a dedicated vector database.

<table>
<colgroup>
<col style="width: 100%" />
</colgroup>
<thead>
<tr class="header">
<th>Upload / URL<br />
|<br />
v<br />
Celery ingestion task<br />
|<br />
Extract -&gt; clean -&gt; chunk<br />
|<br />
Create embeddings<br />
|<br />
PostgreSQL + pgvector<br />
|<br />
Similarity / hybrid retrieval<br />
|<br />
Relevant chunks -&gt; AI context</th>
</tr>
</thead>
<tbody>
</tbody>
</table>

## 3.9 Human handoff

- Conversation states: AI_ACTIVE, WAITING_FOR_AGENT, AGENT_ACTIVE,
  RESOLVED, CLOSED.

- Escalate when the customer requests a human, a configured policy
  requires approval, repeated attempts fail, or the AI cannot safely
  complete the task.

- Agent UI must show the full conversation, relevant AI/tool activity
  and customer context.

- When an agent takes over, AI auto-replies should be disabled unless
  explicitly re-enabled.

## 3.10 Security baseline

- Strict tenant isolation and authorization on every business-owned
  operation.

- HTTPS only outside local development; secure and HTTP-only
  authentication cookies.

- Encrypt secrets outside source code; use environment/secret
  management.

- Never allow the LLM unrestricted database or business-system access;
  tools are explicit, typed and policy-checked.

- Audit sensitive tool calls and administrative changes.

- Validate uploads by type and size; scan/untrusted-content protections
  can be added as the product matures.

- Redact or minimize sensitive customer data before sending it to
  third-party model providers where business requirements demand it.

# 4. Deployment Design

## 4.1 Local development

<table>
<colgroup>
<col style="width: 100%" />
</colgroup>
<thead>
<tr class="header">
<th>Docker Compose<br />
frontend React/Vite<br />
api FastAPI<br />
worker Celery<br />
postgres PostgreSQL (+ pgvector later)<br />
redis Redis</th>
</tr>
</thead>
<tbody>
</tbody>
</table>

The goal is a one-command local environment with the same major runtime
components used in production. This avoids hidden development
dependencies and makes later migration to containers/VMs
straightforward.

## 4.2 Zero/near-zero-cost prototype

A prototype can be deployed almost free, but free tiers have
availability and persistence limitations. The key limitation is Celery:
a continuously running background worker often requires paid compute.
For demos, the worker can be co-located with the web container or run
only when needed, but that is not a production-grade reliability model.

| **Component**  | **Prototype option**                  | **Indicative cost** | **Important limitation**                                                                  |
|----------------|---------------------------------------|---------------------|-------------------------------------------------------------------------------------------|
| React frontend | Static hosting / free Pages-type tier | \$0                 | Suitable for early UI and widget hosting.                                                 |
| FastAPI        | Free web-service tier                 | \$0                 | May sleep/spin down; cold starts.                                                         |
| PostgreSQL     | Neon Free                             | \$0                 | Current free plan includes limited compute/storage; adequate for development/tiny pilots. |
| Redis          | Redis Cloud free                      | \$0                 | Current free plan is 30 MB; enough for a small Celery broker/test workload.               |
| Celery worker  | Co-locate/run on demand for prototype | \$0                 | Tasks stop when host sleeps or process is unavailable; not reliable production execution. |
| AI model       | Usage-based API                       | Variable            | Likely the main marginal cost even while infrastructure is free.                          |
| Domain/email   | Optional initially                    | \$0+                | Custom domain and transactional email can be deferred for internal testing.               |

## 4.3 Recommended tiny-production pilot

Once even a few real customers depend on the system, move FastAPI,
Celery and Redis to always-on compute. A single small VM/container host
can run the API, Celery worker and Redis initially; keep PostgreSQL
managed or on the same VM only if the operational trade-off is
acceptable. This keeps the architecture simple while removing free-tier
sleep behavior.

<table>
<colgroup>
<col style="width: 100%" />
</colgroup>
<thead>
<tr class="header">
<th>Free static frontend<br />
|<br />
v<br />
Small always-on VM / container host<br />
- FastAPI<br />
- Celery worker<br />
- Redis<br />
|<br />
v<br />
Managed PostgreSQL (free/low cost initially)<br />
|<br />
v<br />
AI API (usage based)</th>
</tr>
</thead>
<tbody>
</tbody>
</table>

# 5. Cost Analysis at Start

Pricing below is an architecture-planning snapshot as of 12 August 2026.
Provider pricing can change, so treat it as an estimate and re-check
before deployment.

## 5.1 Infrastructure cost bands

| **Stage**            | **Expected monthly infrastructure** | **What it means**                                                                                                    |
|----------------------|-------------------------------------|----------------------------------------------------------------------------------------------------------------------|
| Local development    | \$0                                 | Everything runs locally with Docker; only AI API calls may cost money.                                               |
| Public prototype     | \$0-\$5                             | Use free static hosting, free web/database/Redis tiers; Celery reliability is limited unless co-located.             |
| Tiny real-user pilot | ~\$5-\$20                           | One small always-on compute instance for API + Celery + Redis; free/low-cost managed Postgres; static frontend free. |
| Early production     | ~\$20-\$100+                        | Separate web/worker compute, backups, persistent object storage, monitoring and stronger database resources.         |

## 5.2 Current free-tier reference points

- Neon currently advertises a \$0 Free plan with no time limit/no credit
  card and limited compute/storage suitable for small projects.

- Redis Cloud currently advertises a \$0 free plan with a 30 MB
  database, intended for learning and test projects.

- Render currently offers free web services/datastores for preview/hobby
  use, but its documentation explicitly says free instances are not for
  production; background workers start on paid compute rather than the
  free tier.

## 5.3 AI cost - illustrative example

AI cost depends primarily on the selected model, conversation history
sent with each request, RAG context, response length, tool calls and
retries. Current OpenAI API pricing includes models ranging from
cost-sensitive to frontier tiers. For illustration, GPT-5.6 Luna is
listed at \$0.20 per 1M input tokens and \$1.20 per 1M output tokens;
GPT-5.6 Terra is \$2.00 input / \$12.00 output per 1M tokens.

| **Illustrative usage**                                        | **Luna estimate** | **Terra estimate** |
|---------------------------------------------------------------|-------------------|--------------------|
| 1,000 messages/month; 2,000 input + 500 output tokens/message | ~\$1/month        | ~\$10/month        |
| 10,000 messages/month; same token profile                     | ~\$10/month       | ~\$100/month       |

These examples are arithmetic estimates only. They exclude embeddings,
web/file-search tools, audio, image input, retries and any extra context
expansion. The product should log token usage per business and per
conversation from the beginning so pricing and margins can be measured
rather than guessed.

## 5.4 Cost-control mechanisms to design in now

- Per-business monthly AI usage counters and configurable
  budget/soft-limit alerts.

- Maximum context/history policy; summarize older conversation history
  rather than replaying everything indefinitely.

- Use the cheapest model that meets the intent; reserve stronger models
  for difficult/escalated cases.

- Cache stable knowledge/tool results where safe.

- Batch embeddings and background ingestion when possible.

- Log model, tokens, latency, tool calls and estimated cost for every AI
  turn.

# 6. Recommended Delivery Roadmap

| **Phase**                          | **Build**                                                                                                                    | **Do not add yet**                         |
|------------------------------------|------------------------------------------------------------------------------------------------------------------------------|--------------------------------------------|
| Phase 0 - Foundation               | React shell, FastAPI, PostgreSQL, Redis, Celery, migrations, auth, business/tenant model, Docker Compose.                    | WhatsApp, RAG, complex analytics.          |
| Phase 1 - Core chat                | Assistant config, web chat widget, customers, conversations/messages, model streaming, basic admin inbox.                    | Dedicated vector DB, microservices.        |
| Phase 2 - Knowledge                | Document upload, Celery ingestion, chunking, embeddings, pgvector retrieval, source tracking.                                | Large search infrastructure.               |
| Phase 3 - Customer-service actions | Tool registry, order/ticket integrations, approval policies, audit trail, robust handoff.                                    | Dozens of integrations at once.            |
| Phase 4 - Omnichannel              | WhatsApp adapter, delivery/retry semantics, unified identities, channel-specific policies.                                   | Premature channel-specific business logic. |
| Phase 5 - Scale                    | Separate workers/services where metrics justify it; Redis HA, managed DB sizing, object storage, observability, autoscaling. | Kubernetes unless scale/team needs it.     |

# 7. Decisions / Architecture Guardrails

- FastAPI is the primary backend framework; Python is also used for
  Celery workers and AI/RAG processing.

- PostgreSQL is the primary system of record. Redis is ephemeral
  infrastructure, not permanent business storage.

- Celery is used only for asynchronous/retryable work; customer-facing
  low-latency flows stay in FastAPI.

- Start with a modular monolith and one repository. Split services only
  when scaling, reliability or team ownership produces a concrete
  reason.

- Every customer-facing channel maps into a common internal
  conversation/message model.

- Every LLM-triggered business action passes through a typed, authorized
  tool layer.

- AI providers, storage providers, authentication providers and channel
  providers sit behind application-owned interfaces to limit vendor lock-in.

- Prefer manual/application-owned implementation when it is equally secure,
  maintainable and scalable for the requirement. Use a managed product when
  it provides a concrete production advantage rather than simply reducing
  initial coding effort.

- Do not hand-roll security primitives. Manual ownership means owning the
  workflow and data model while relying on mature protocol and cryptographic
  libraries.

- Cost telemetry is a product feature from day one, not an afterthought.

# 7.1 Build vs Buy Principle

The project should not optimize for either **build everything ourselves** or
**use SaaS for everything**. Each dependency should be evaluated against
production quality.

Use an application-owned implementation when:

- the domain is core to the product;
- the implementation is straightforward with mature libraries;
- ownership improves portability or control;
- operating it does not create disproportionate security or reliability risk.

Use a managed or specialized tool when:

- it solves a difficult infrastructure/security problem substantially better;
- operating the equivalent ourselves would become a reliability burden;
- enterprise/customer requirements make the managed capability valuable;
- the tool can be placed behind an application-owned abstraction.

For this platform:

| Area | Initial decision |
|---|---|
| Tenant/business model | Own |
| Authentication workflow | Own in FastAPI |
| OAuth/OIDC implementation | Mature libraries/providers |
| Password hashing / crypto | Mature libraries only |
| PostgreSQL | Use |
| Redis | Use |
| Celery | Use |
| AI model inference | External provider behind abstraction |
| RAG orchestration | Own |
| Tool/action authorization | Own |
| Firebase/Auth0 | Not required initially; reconsider if production requirements justify it |
| S3-compatible object storage | Use when persistent file storage is needed |

# 8. Initial Technology Stack Summary

| **Area**                   | **Technology**                                                                               |
|----------------------------|----------------------------------------------------------------------------------------------|
| Frontend                   | React, TypeScript, Vite, Tailwind CSS                                                        |
| Backend                    | Python, FastAPI, Pydantic                                                                    |
| ORM / migrations           | SQLAlchemy, Alembic                                                                          |
| Primary database           | PostgreSQL                                                                                   |
| Vector retrieval (Phase 2) | pgvector inside PostgreSQL                                                                   |
| Async jobs                 | Celery                                                                                       |
| Message broker / cache     | Redis                                                                                        |
| Authentication             | Application-owned FastAPI auth; PostgreSQL identities/sessions; Argon2; Google/GitHub OAuth; secure HTTP-only cookies |
| AI                         | Provider abstraction; OpenAI first                                                           |
| Streaming                  | SSE initially for AI responses; WebSocket when live-agent real-time needs justify it         |
| Storage                    | Local in development; S3-compatible object storage later                                     |
| Local deployment           | Docker + Docker Compose                                                                      |
| Initial public deployment  | Free-tier static/web/database where acceptable; small always-on compute for a reliable pilot |

# 9. Pricing & Reference Sources

Reference pages checked on 12 August 2026:

- OpenAI API pricing: https://developers.openai.com/api/docs/pricing

- OpenAI model comparison/pricing:
  https://developers.openai.com/api/docs/models/compare

- Neon pricing: https://neon.com/pricing

- Redis Cloud pricing: https://redis.io/pricing/

- Render free tier documentation: https://render.com/docs/free

- Render background workers: https://render.com/docs/background-workers
