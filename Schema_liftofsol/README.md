# Lift Off Solutions: data schema

The database design for the platform. MongoDB-style documents, written to run on **Firestore with MongoDB
compatibility**. This file covers the platform schemas (users, organizations, projects, billing, contacts, inbox,
tool runs, notifications, audit) in full, and how they connect to the agent-side schemas (agents, knowledge,
transactions).

## Contents

1. [What is in this folder](#1-what-is-in-this-folder)
2. [Conventions used everywhere](#2-conventions-used-everywhere)
3. [How everything connects](#3-how-everything-connects)
4. [Users](#4-users)
5. [Organizations](#5-organizations)
6. [Projects](#6-projects)
7. [Billing](#7-billing)
8. [Contacts](#8-contacts)
9. [Inbox: conversations, messages, handoffs](#9-inbox-conversations-messages-handoffs)
10. [Tool runs](#10-tool-runs)
11. [Notifications](#11-notifications)
12. [Audit log](#12-audit-log)
13. [Agents, knowledge and transactions](#13-agents-knowledge-and-transactions)
14. [Not designed yet](#14-not-designed-yet)
15. [Open decisions](#15-open-decisions)
16. [Native Firestore](#16-native-firestore)

---

## 1. What is in this folder

| Folder | Collections | Owner | Status |
|---|---|---|---|
| `user-schema/` | `users`, `auth_identities` | Platform | Final |
| `organization-schema/` | `organizations`, `invitations` | Platform | Final |
| `project-schema/` | `projects` | Platform | Built to the agreed design |
| `billing-schema/` | `plans`, `billing_accounts`, `invoices`, `credit_ledger`, `usage_charges`, `billing_events` | Platform | Design reviewed; 10 business decisions open |
| `contact-schema/` | `contacts`, `contact_identities` | Platform | New, ready for review |
| `inbox-schema/` | `conversations`, `messages` | Platform | New, ready for review |
| `tool-run-schema/` | `tool_runs` | Platform (agreed with the agent side) | New, ready for review |
| `notification-schema/` | `notifications` | Platform | New, ready for review |
| `audit-schema/` | `audit_events` | Platform | New, ready for review |
| `knowledge-source-schema/` | `knowledge_sources` | Platform | Built (section 13.1) |
| `assistant-schema/` | `assistants` | Platform | Built (section 13.1) |
| `agent-schema/` | `node_types`, `agent_templates`, `agents`, `credentials` | Agent side (other team member) | See its own README |
| `knowledge-schema/` | `rags`, `rag_documents`, `pinecone_indexes`, `rag_jobs` | Agent side (other team member) | See its own README |
| `transactions-schema/` | `transactions`, `prices`, `agent_storage` | Agent side (other team member) | See its own README |
| `shared.types.ts` | — | Platform | Types used by more than one folder |

Each platform folder has the same set of files:

| File | What it is |
|---|---|
| `*.types.ts` | TypeScript types, small helpers, and at the top a **"Rules enforced in code"** block: everything the API must check that the database can't |
| `*.mongo.js` | Validators and indexes for the MongoDB backend, which is being replaced. Not used on Firestore (section 16) |
| `*.example.json` | Realistic example documents |
| `*-erd.svg`, `*-erd.png` | Diagram with relationships and cardinality |

`shared.types.ts` holds:

- `OrgRole`: `owner`, `admin` or `member`.
- `AuthProvider`: the sign-in methods `google`, `email` (email + password) and `github`.
- `FIREBASE_SIGN_IN_PROVIDERS`: maps Firebase's names (`google.com`, `password`, `github.com`) to ours.
- `Channel`: where a contact talks to an agent: `web_widget`, `whatsapp`, `email`, `line`.

---

## 2. Conventions used everywhere

- **Field names** are `snake_case`. Optional fields end in `?` in the types and in this file.
- **Ids** are UUID v4 strings, made by the app (`crypto.randomUUID()`).
  Random ids also suit Firestore, which advises against ids that increase over time.
- **Dates** are `Date` objects in code; Firestore stores them as timestamps.
- **Money**:
  - Prices and invoices are integer minor units of the currency: paise for INR, cents for USD. `99900` = ₹999.00.
  - Our own costs (Transactions schema) are integer micro-USD: 1 USD = 1,000,000.
  - Credits connect the two (section 7).
- **Soft delete**: `status: "deleted"` and `deleted_at` are always set together, and only together.
- **Rules in code**: Firestore has no validators, so the API checks every rule itself.
- **Uniqueness**: Firestore has no unique indexes. A unique value is held by a document in `unique_values`
  (section 16).
- **Append-only records** (`credit_ledger`, settled `usage_charges`, `invoices`, `messages`, `audit_events`) are
  never edited, except the few fields each section names.
- **Status changes** follow a small map in code (`CONVERSATION_TRANSITIONS`, `TOOL_RUN_TRANSITIONS`), checked with
  one helper (`canMoveConversation()`, `canMoveToolRun()`), so the allowed moves are written in one place.
- **"Do it once" keys:** where a webhook or a retry could repeat work, a unique key stops it:
  `invitations.pending_key`, `conversations.open_key`, `messages.external_key`, `tool_runs.idempotency_key`,
  `credit_ledger.idempotency_key`, `notifications.dedupe_key`.
- **Automatic deletion (TTL)** is used only for temporary records: invites, webhook events, notifications,
  audit events.

---

## 3. How everything connects

```
auth_identities N ── 1 users N ── 1 organizations 1 ── 1 billing_accounts ── plans
                         │             │  ├── 0..N invitations, invoices, credit_ledger, usage_charges
                         │             │  ├── 0..N audit_events
                         │             │  └── 1..N projects
                         │             │              ├── agents, credentials, rags, transactions   (agent side)
                         │             │              ├── 0..N contacts ── 1..N contact_identities
                         │             │              └── 0..N conversations ── 0..N messages
                         │             │                         └── 0..N tool_runs
                         └── 0..N notifications
transactions 1 ── 0..1 usage_charges (same _id)        messages (AI) → transaction_id
```

In words:

- A **user** signs in through one or more **auth identities**, and belongs to exactly one **organization**.
- An **organization** is the customer account. It holds the **plan**, has exactly one **billing account**
  (same id), its invitations, invoices, credit history and audit log, and one or more **projects**.
- A **project** groups agents. Agents, credentials, knowledge, costs, **contacts** and **conversations** all
  belong to a project.
- A **contact** is a person who chats with an agent, reachable through one or more **contact identities** (a
  WhatsApp number, a web chat visitor id, an email address).
- A **conversation** is one thread between a contact and an agent, made of **messages**. Handoffs to a teammate are
  its status and assignee, with each step recorded as a system message.
- A **tool run** is one tool call an agent makes; risky ones wait for a teammate's approval.
- Every agent run (**transaction**) is charged once, as a **usage charge** with the same id, and the AI message it
  wrote points back to it.
- **Notifications** are per person; the **audit log** is per organization.

---

## 4. Users

Files: [`user-schema/`](user-schema/) · diagram [`users-erd.png`](user-schema/users-erd.png)

Who a person is on the platform (`users`) and how they sign in (`auth_identities`). Sign-in is kept separate so the
login system can change later (Firebase today, our own later) without touching users or anything pointing to them.

### 4.1 `users`

One document per person. Every user is a customer; the free or paid plan sits on their organization.

- `_id`: the user's permanent id. Every other collection points to the user by it; it never changes.
- `display_name`: the name shown in the app. If sign-in gives none, the part of the email before "@".
- `email?`: contact email, lowercase. No two users share one.
- `phone?`: contact number in international (E.164) format, e.g. `+919812345678`.
- `avatar_url?`: profile picture.
- `dob?`: date of birth as `YYYY-MM-DD` (text, so it can't shift by a day across time zones). Optional, never
  required to sign up, cleared when the account is deleted.
- `gender?`: free text, up to 50 characters. Optional, cleared when the account is deleted.
- `status`: `active` can use the app; `suspended` is blocked by us; `deleted` is closed by the user.
- `membership`: the one organization the user belongs to. Always set.
  - `org_id`: which organization.
  - `role`: `owner`, `admin` or `member` (see 5.4 for what each can do).
  - `created_at`, `updated_at`: when they joined and when the role last changed.
- `settings?`: the user's own preferences, the same on every device.
  - `theme?`: `light`, `dark` or `system`.
  - `language?`: e.g. `en`, `hi-IN`.
  - `timezone?`: e.g. `Asia/Kolkata`.
  - `notifications.email?`: account and activity emails.
  - `notifications.product_updates?`: marketing emails. Off unless the user turns it on.
- `terms_accepted_at?`, `terms_version?`: when they accepted which version of the terms. Always set together.
  Missing = not accepted yet; ask before they use the app.
- `created_at`, `updated_at`: when the account was made and last changed.
- `deleted_at?`: when it was deleted. Set together with status `deleted`; the account is purged after a grace period.

### 4.2 `auth_identities`

How a person signs in. A user has one or more.

- `_id`: the identity's id.
- `user_id`: which user this login belongs to.
- `provider`: who checked the sign-in: `firebase` today (covers Google, GitHub and email + password), `local` later.
- `subject`: the person's account id at that provider, e.g. the Firebase uid. `provider` + `subject` is unique.
- `created_at`: when this sign-in method was added.

### 4.3 Decisions

1. A user belongs to exactly one organization.
2. Any new user with no organization attached gets their own organization (e.g. "Asha's workspace") on the
   **default plan**, with them as owner. A new user who signs up through an invite joins that organization instead.
   Which plan is the default is set in billing (`plans.is_default`).
3. Each environment (local, staging, production) has its own Firebase project and its own database. That is why
   `auth_identities` has no `issuer` field. If that ever changes, add one with a single script.
4. Plans belong to organizations, not users. "Free or paid customer" means the organization's plan.
5. Joining another organization moves the user there. Their own projects stay behind in the old organization,
   which is closed; the projects are kept but no one can open them (decided 2026-10-30, so a joiner doesn't use up
   the company's project slots). Only offered while they are its only member.
   An individual becoming a company updates their own organization in place (name, slug, plan); nothing moves.
6. Sign-in always resolves to our own `users._id`. The Firebase uid is never used as a user id.
7. A user whose status isn't `active` is refused after the identity is resolved.
8. A user always keeps at least one identity; removing the last one is refused.
9. Passwords never go in `users`.

### 4.4 Sign-in, step by step

1. Verify the Firebase token.
2. Find `auth_identities` by `provider: "firebase"` and `subject` = the token's uid, and take its `user_id`.
   Not found means first sign-in. In one transaction create the user, the identity and the membership: in the
   inviting organization if they came through an invite, otherwise in a new organization of their own on the
   default plan (together with its billing account, section 7).
3. Read the user by `_id`; refuse if `status` isn't `active`.
4. Before checking the organization's `allowed_providers`, map the token's `firebase.sign_in_provider` with
   `FIREBASE_SIGN_IN_PROVIDERS`. An unknown value is not allowed.

**Reads per organization request:** identity + user + organization = 3 with an empty cache; user + organization = 2
after a cache hit. (Today's backend: organization + member = 2.)

**Identity cache** (in memory, inside the API process):

- Key `provider + subject`, value `user_id`. Never cache the user's status, so a suspension applies on the next request.
- Bounded size and a short expiry (e.g. 10 minutes), so a removed identity stops working on every API instance
  within that time.
- Remove the entry when that identity is removed or changed.

### 4.5 Moving off Firebase later

Add a `local` identity next to the `firebase` one, then remove the `firebase` one. `users._id` and everything that
points to it stay the same.

- Passwords go in a separate `password_credentials` collection (`user_id` unique, `password_hash`,
  `password_changed_at`), never in `users`.
- Firebase password hashes can be exported for eligible email/password users when the required IAM permission and
  hash parameters are available. If the local authentication service supports Firebase's modified Scrypt algorithm,
  those users may migrate without resetting their passwords. OAuth-only users and accounts with unavailable or
  unsupported hashes need to set local credentials or reset their password.
- The real cost of leaving Firebase is building login features ourselves: password reset, email verification,
  lockout after failed attempts, two-factor login.

### 4.6 Indexes

| Collection | Index | Use |
|---|---|---|
| `users` | `email` (unique, sparse) | One account per email, where an email exists |
| `users` | `membership.org_id` | An organization's members |
| `auth_identities` | `provider, subject` (unique) | Find the user on sign-in |
| `auth_identities` | `user_id` | A user's sign-in methods |

---

## 5. Organizations

Files: [`organization-schema/`](organization-schema/) · diagram [`organizations-erd.png`](organization-schema/organizations-erd.png)

The customer account (`organizations`) and how people join one (`invitations`). Which organization a user is in,
and their role, is stored on the user (`users.membership`).

### 5.1 `organizations`

A company, or an individual's own workspace. Holds the plan.

- `_id`: the organization's id. Its billing account uses the same id.
- `name`: company name, e.g. "Acme Robotics", or "Asha's workspace" for an individual.
- `slug`: short unique name, e.g. `acme-robotics`. Made automatically for new users with
  `defaultSlug(name, _id)` → `ashas-workspace-3b9e7c`. Owners can change it if the new one is still unique.
  Renaming the organization doesn't change the slug.
- `logo_url?`: company logo.
- `plan_id`: the plan it is on now (section 7). New organizations get the default plan.
- `status`: `active` works normally; `suspended` is blocked by us, data kept; `deleted` is closed, data kept forever.
- `created_by`: the user who created it.
- `created_at`, `updated_at`: when it was made and last changed.
- `deleted_at?`: when it was closed. Set together with status `deleted`.
- `settings`: organization-wide options. Always set; a new organization starts with `DEFAULT_ORG_SETTINGS`.
  - `default_role`: the role pre-selected when someone sends an invite (`admin` or `member`; default `member`).
  - `allowed_providers`: sign-in methods members may use (`google`, `email`, `github`; default all three).

### 5.2 `invitations`

An invite for one email address to join one organization.

- `_id`: the invite's id.
- `org_id`: which organization the invite is for.
- `email`: who it is for, lowercase. They must be signed in with this email, verified, to accept.
- `role`: the role they get on accepting.
- `token_hash`: SHA-256 fingerprint of the secret link. The link itself is never stored.
- `pending_key?`: `{org_id}:{email}` (`pendingKey()`), only while the invite is open. Stops two open invites to the
  same person in the same organization.
- `invited_by`: who sent it.
- `status`: `pending` (open), `accepted`, `revoked` (cancelled by the sender) or `expired`.
- `expires_at`: 24 hours after it was sent (`INVITE_VALID_HOURS`). The invite is deleted automatically 7 days after
  that (`EXPIRED_INVITE_RETENTION_DAYS`).
- `created_at`, `updated_at`: when it was sent and last changed.

### 5.3 Decisions

1. Every user belongs to exactly one organization (see 4.3).
2. People join only by invitation. There are no join codes or join requests.
3. An invite is valid for 24 hours. Expired invites are deleted automatically 7 days after they expire.
4. One open invite per person per organization. Inviting the same person again replaces the open invite: the old
   one is revoked and the new one created in one transaction.
5. Accepting needs a pending invite that hasn't expired, and the signed-in email must match the invite and be
   **verified**. (This check was missing in today's backend and has been added: `platform-api/src/modules/auth/routes.ts`,
   with a test in `platform-api/tests/invitation-accept.test.ts`.)
6. An organization always has at least one owner. The last owner can't be demoted or removed; when they leave or
   delete their account, the organization is closed.
7. A closed organization (status `deleted` plus `deleted_at`) is kept, never purged. A paid plan is cancelled first.
8. A member who leaves, is removed, or whose organization is closed gets a new organization of their own on the
   default plan. Their work stays with the old organization.
9. Only the platform team can suspend an organization. While suspended, its members are refused and its data is kept.
10. Ids are UUID v4.

### 5.4 Roles

Roles are fixed. What each can do at organization level is one map in code, `ORG_ROLE_ACTIONS`:

| Action | owner | admin | member |
|---|---|---|---|
| `org.edit`: name, logo, settings | yes | yes | no |
| `members.manage`: invite and remove members and admins | yes | yes | no |
| `owners.manage`: invite, remove or change owners | yes | no | no |
| `billing.manage`: plan and payments | yes | no | no |
| `org.close` | yes | no | no |
| `projects.view_all`: see every project | yes | yes | no |
| `projects.create` | yes | yes | no |
| `projects.manage_access`: change who can do what in a project (6.4) | yes | yes | no |
| `audit.view`: read the audit log (section 12) | yes | yes | no |

- Changing what a role can do is one line in `ORG_ROLE_ACTIONS`.
- Anything that touches an owner needs `owners.manage`, so an admin can never change an owner.
- Work inside a project (agents, inbox, knowledge) is controlled per project (section 6), checked after this.

### 5.5 Request check

1. Resolve the user (4.4).
2. Read the organization from `users.membership.org_id`. Refuse if the user or the organization isn't `active`.
3. Check `canOrg(users.membership.role, action)`.

Every user has exactly one organization, so routes don't need an organization id in the URL.

### 5.6 Indexes

| Collection | Index | Use |
|---|---|---|
| `organizations` | `slug` (unique) | One organization per slug |
| `organizations` | `plan_id` | Every organization on a plan |
| `invitations` | `pending_key` (unique, sparse) | One open invite per person per organization |
| `invitations` | `token_hash` (unique) | Find the invite when someone opens the link |
| `invitations` | `expires_at` (TTL, 7 days) | Delete expired invites |
| `users` | `membership.org_id` | An organization's members (created in `users.mongo.js`) |

---

## 6. Projects

Files: [`project-schema/`](project-schema/) · diagram [`projects-erd.png`](project-schema/projects-erd.png)

A project is a group of agents inside one organization (for example "Support India", "Sales"). Agents,
credentials, knowledge bases, costs, contacts and conversations all belong to a project through `project_id`.

### 6.1 `projects`

- `_id`: the project's id.
- `org_id`: the organization it belongs to. Always set; there are no personal projects.
- `name`, `description?`: what it is called and what it is for.
- `status`: `active`; `archived` (its agents stop answering, data kept); `deleted` (with `deleted_at`).
- `role_permissions?`: **role-based** permissions for this project. Replaces the code defaults for that role here.
  - `admin?`: project permissions for admins in this project.
  - `member?`: project permissions for members in this project.
- `members`: **individual-based** access, embedded (a project has a handful of people, so one read gives the project
  with everyone's access). Each entry:
  - `user_id`: the person; must be in the same organization, at most once per project.
  - `grants`: extra permissions for this person in this project.
  - `denies`: removed permissions for this person in this project.
  - `added_by`, `added_at`: who added them, and when.
- `created_by`, `created_at`, `updated_at`, `deleted_at?`.

Removed from the first design: `scope` (personal/org), `PERSONAL_SHARE_LIMIT`, `member_count` and the `project_roles`
collection (roles are fixed). Membership is embedded in `members`, which is the source of truth. `project_members` is
back only as a copy that the RAG reads (6.5).

### 6.2 Project permissions

`ALL_PROJECT_PERMISSIONS` (23): `agents.view`, `agents.create`, `agents.update`, `agents.publish`, `agents.test`,
`agents.archive`, `contacts.view`, `contacts.manage`, `conversations.view`, `conversations.reply`,
`conversations.assign`, `conversations.manage`, `channels.view`, `channels.manage`, `knowledge.view`,
`knowledge.manage`, `integrations.view`, `integrations.manage`, `tools.view`, `tools.manage`, `tools.approve`,
`analytics.view`, `usage.view`.

These are today's names, except `customers.*`, renamed to `contacts.*` (section 8). Organization-level permissions are
the `OrgAction` list in 5.4.

`DEFAULT_ROLE_PERMISSIONS`, used when a project doesn't set `role_permissions`:

- **admin:** all 23.
- **member** (support staff): `agents.view`, `contacts.view`, `contacts.manage`, `conversations.view`,
  `conversations.reply`, `conversations.assign`, `channels.view`, `knowledge.view`, `tools.view`, `analytics.view`,
  `usage.view`.
- **owner:** always everything, whatever the project says.

### 6.3 How a person's permissions in a project are worked out (`projectPermissions()`)

1. Owners get every permission, so nobody can lock the organization out of its own project.
2. Members see only the projects they are listed in; admins see every project.
3. Start from the role's list: the project's `role_permissions` for that role if set, otherwise the default.
4. Add the person's `grants`, then take away their `denies`.

Example (`projects.example.json`): members in "Support India" also get `knowledge.manage`. Ravi is granted
`tools.approve`, and Meera is denied `contacts.manage`.

### 6.4 Rules

- **Who can change access:** changing a project's `role_permissions`, `members`, `grants` or `denies` needs the
  organization action `projects.manage_access` (owners and admins). On top of that:
  - only owners change `role_permissions.admin`, so admins can't widen their own role;
  - nobody changes their own entry in `members`;
  - a person can only grant permissions they hold in that project themselves (owners hold all). `ungrantable()` lists
    anything asked for that they don't hold, and the change is refused unless it is empty.
  - Every access change is written to the audit log.
- Only people in the project's organization can be added. Someone leaving the organization is removed from every
  project in it.
- Creating a project needs `projects.create`, and the plan's `limits.projects` is checked first.
- A project request costs 3 reads: user, organization, project.
- "Projects Ravi can see" reads the organization's projects (an organization has few) and filters in code, which
  avoids an index over the `members` list.
- Only owners and admins create projects (decided 2026-10-30). Members work in the projects they are added to.
- A project never changes organization. Someone joining another organization leaves their projects behind (4.3).

### 6.5 `project_members`: access copy for the RAG

Decided 2026-10-29. The RAG (`LiftOfMain`) lets an account use a project only if
`project_members/{projectId}_{userId}` exists. It checks that the document exists and reads nothing in it. The
platform keeps these copies so the RAG doesn't change. The platform never reads them to make its own decisions.

- **Fields:** `_id` (`{projectId}_{userId}`), `project_id`, `user_id`, `updated_at` (when the platform last wrote it).
- **Who has one:** exactly the people whose `projectPermissions()` (6.3) for the project isn't empty: owners, admins,
  and members listed in `members`, unless denies take everything away. A deleted project has none.
- **Kept in step** by `syncAccessCopies()` in `platform-api/src/firestore/platform.ts`, in the same transaction as
  every change that can alter it. It writes the copy for each person who should have one and deletes the rest.
  - Project created, or its access changed (`role_permissions`, `members`, grants, denies): every person in the
    organization, for that project.
  - Organization role changed, or a person joins (first sign-in or an accepted invite): that person, for every
    project in the organization. An accepted invite also deletes the joiner's copies for the projects they leave
    behind.
  - A person removed from the organization, or the organization closed: their copies are deleted.
- **Not covered:** a suspended user keeps their copies. The platform is the only caller of the RAG's `/rag/...` routes
  and checks the user's status itself.
- A missed copy shows up as a 403 "not a member" from the RAG. A copy that should have been deleted still lets that
  person into the RAG for that project. The emulator tests (`platform-api/tests/firestore/`) cover each change above.

### 6.6 Indexes

| Collection | Index | Use |
|---|---|---|
| `projects` | `org_id, created_at` | An organization's projects |

---

## 7. Billing

Files: [`billing-schema/`](billing-schema/) · diagram [`billing-erd.png`](billing-schema/billing-erd.png)

Plans, who pays, subscriptions, invoices and credits. The structure has been through several review rounds;
the prices, credit amounts and the business decisions in section 15 are still open.

### 7.1 Collections at a glance

| Collection | One document per | Holds |
|---|---|---|
| `plans` | Plan we sell or give away | Prices, monthly credits, limits, default flag |
| `billing_accounts` | Organization (`_id` = `organizations._id`) | Payment provider customer, billing profile, latest subscription, credit period, balances |
| `invoices` | Invoice from the payment provider | Amounts, tax, lines, status, PDF link |
| `credit_ledger` | Credit change other than agent usage | Grants, purchases, expiries, manual adjustments |
| `usage_charges` | Agent run (`_id` = `transactions._id`) | Organization charged, credits used, split, shortfall |
| `billing_events` | Webhook event from the payment provider (temporary) | Raw payload, processing status, attempts |

```
organizations     1 ── 1     billing_accounts   (same _id)
plans             1 ── 0..N  organizations      (organizations.plan_id)
plans             1 ── 0..N  billing_accounts   (subscription.plan_id, embedded)
organizations     1 ── 0..N  invoices
organizations     1 ── 0..N  credit_ledger
invoices          1 ── 0..N  credit_ledger      (a credit purchase)
organizations     1 ── 0..N  usage_charges
transactions      1 ── 0..1  usage_charges      (same _id)
```

### 7.2 `plans`

One product we sell or give away (Free, Starter, Pro): its price, what's included and its limits. A short list
managed by us; customers never edit it.

**Connection with organizations:** `organizations.plan_id` → `plans._id` is the plan an organization is on now.
New organizations get the plan with `is_default`. A paid subscription also points to a plan
(`subscription.plan_id`), and `organizations.plan_id` is kept equal to it while the subscription is active.
One plan, many organizations; each organization, one plan.

- `_id`: the plan's id.
- `code`: short unique name used in code, e.g. `free`, `starter-2026-10`. The date lets a new price version sit
  beside the old one.
- `name`: what customers see, e.g. "Starter".
- `is_default`: `true` on exactly one active plan, the one every new organization starts on.
- `status`: `active` can be chosen; `retired` takes no new customers, but organizations already on it keep it.
- `prices`: one entry per currency and billing interval; empty for a free plan.
  - `currency`: `INR` or `USD`.
  - `interval`: `month` or `year`.
  - `amount_minor`: the price in paise or cents. `99900` = ₹999.00.
  - `provider_price_id?`: the same price's id at Razorpay or Stripe.
- `monthly_credits`: credits given at the start of every credit period (the "included" credits). Unused ones expire
  at the next period.
- `limits`: the most an organization on this plan can have: `projects`, `agents`, `members`, `knowledge_documents`.
- `created_at`, `updated_at`: when the plan was added and last changed.

Prices are never edited: add a new plan (`starter-2027-01`) and retire the old one, so nobody is repriced by
accident. The API keeps the few plans in memory, so checking a limit costs no extra read.

### 7.3 `billing_accounts`

One per organization, created with it (same transaction as sign-up). Who pays, the latest subscription and the
credit balances.

- `_id`: same as the organization's `_id`.
- `provider?`: `razorpay` or `stripe`; set at the first checkout.
- `provider_customer_id?`: this customer's id at the payment provider. Unique.
- `profile?`: who the invoices are for.
  - `legal_name?`: registered business name.
  - `email?`: where invoices go.
  - `address?`: `line1`, `line2?`, `city`, `state?`, `postal_code`, `country` (two letters, e.g. `IN`).
  - `tax_id?`: e.g. GSTIN in India.
- `subscription?`: the latest paid subscription (missing = never subscribed).
  - `plan_id`: which plan it is for.
  - `status`: `active`, `past_due` (a payment failed, still within the grace period) or `cancelled`.
  - `currency`, `interval`: what was chosen at checkout.
  - `provider_subscription_id`: its id at the payment provider. Unique.
  - `current_period_start`, `current_period_end`: the billing period it is in.
  - `cancel_at_period_end`: the customer cancelled; it ends at `current_period_end`.
  - `started_at`: when it first started.
  - `cancelled_at?`: when it ended. Set only by the credit-period transition (7.9).
- `credit_period`: number of the current credit period, 1 from sign-up.
- `credit_period_cause`: what started the current period (a cause key, 7.9). Stops one transition being applied twice.
- `subscription_revision`: goes up by 1 on every subscription or credit-period change; checked when saving (7.8).
- `included_credits_left`: credits left from the plan in this period.
- `purchased_credits_left`: credits left from top-ups; these never expire.
- `credits_reset_at`: when the current credit period ends.
- `created_at`, `updated_at`.

### 7.4 `invoices`

Copied from the payment provider through its webhooks. Kept forever (tax records).

- `_id`, `org_id`: the invoice and the organization it is for.
- `provider`, `provider_invoice_id`: where it came from; the pair is unique, so a repeat webhook updates the same row.
- `number?`: the invoice number shown to the customer.
- `status`: `open`, `paid`, `failed` or `void`.
- `currency`, `subtotal_minor`, `tax_minor`, `total_minor`: the amounts (total = subtotal + tax).
- `lines`: what was billed. Each line has `description` (e.g. "Starter plan, Oct 2026" or "5,000 credits"),
  `quantity` and `amount_minor`.
- `period_start?`, `period_end?`: the period, for subscription invoices.
- `issued_at`, `paid_at?`: when it was issued and paid.
- `pdf_url?`: link to the provider's PDF.
- `created_at`, `updated_at`.

### 7.5 `credit_ledger`

Every credit change except agent usage. Append-only: entries are never edited or deleted.

- `_id`, `org_id`.
- `type`: `grant` (plan credits for a period), `purchase` (a top-up), `expiry` (unused included credits removed at
  the end of a period) or `adjustment` (a manual correction by us).
- `idempotency_key`: unique; the same change can only be applied once (`ledgerKey()`):
  - purchase: `purchase:{provider}:{payment id}`
  - grant: `grant:` + the period's cause key
  - expiry: `expiry:{org}:{period number}`
  - adjustment: `adjustment:{id}`
- `credits`: positive adds, negative removes.
- `pool`: which balance it changes: `included` or `purchased`.
- `invoice_id?`: the invoice, for a purchase.
- `reason?`: required for an adjustment.
- `created_by?`: who made an adjustment; missing = the system.
- `created_at`.

### 7.6 `usage_charges`

One per agent run. Created when the run is admitted, settled once when it finishes.

- `_id`: same as the transaction's `_id`, so a run can only be charged once.
- `org_id`: the organization chosen when the run started. It is charged even if the project moves mid-run.
- `status`: `pending` (running) or `settled`.
- `project_id`, `agent_id`, `total_micros`: copied from the transaction.
- `credits`: what the run cost in credits, `creditsFor(total_micros)`.
- `included`, `purchased`: how much came from each balance.
- `shortfall`: what the balance couldn't cover (normally 0).
- `created_at`: when the run was admitted.
- `settled_at?`: when it was charged. The amounts are 0 until then.

### 7.7 `billing_events`

Raw webhook events from the payment provider. Temporary: deleted 90 days after they arrive.

- `_id`.
- `provider`, `provider_event_id`: the pair is unique, so a repeat delivery finds the same row.
- `type`: the provider's event name, e.g. `subscription.charged`.
- `payload`: the raw body, stored as received.
- `status`: `received`, `processed` or `failed`. Only `processed` means finished.
- `attempts`: how many times processing was tried.
- `error?`: the last failure.
- `received_at`, `processed_at?`, `expires_at` (`received_at` + 90 days).

### 7.8 How money flows

1. **Sign-up:** the organization and its billing account are created together, on the default plan, in credit
   period 1, with that plan's `monthly_credits` as `included_credits_left`.
2. **Upgrade:** the browser asks the API for a checkout; the payment provider takes the payment. Only the provider's
   verified webhook then sets `subscription` and `organizations.plan_id` (same transaction). The browser never marks
   anything paid.
3. **Webhooks:**
   - Each event is stored in `billing_events`. A repeat delivery of a `processed` event is skipped; a `received` or
     `failed` one is processed again. The billing changes and the `processed` status are saved in one transaction.
     A failure sets `failed`, adds 1 to `attempts` and keeps the error.
   - Events can arrive out of order, so an event is only a signal: the API fetches the subscription's current state
     from the provider and applies that. A late "activated" after a cancellation still ends as cancelled.
   - Only the account's current subscription can change it. An event for another subscription id replaces it only
     when it is a new subscription and the current one is `cancelled` (a new checkout). Events for an older
     subscription only update its invoices.
   - Two workers at once: read `subscription_revision`, fetch from the provider, and save only if the revision hasn't
     changed. Otherwise fetch again and retry, up to 3 times, then leave the event `failed` for later. An older fetch
     can never overwrite a newer one. Usage settlements don't change the revision, so busy agents don't hold up
     webhooks.
4. **Renewal or failed payment:** webhooks create or update `invoices` and set `subscription.status`.
5. **Agent run:**
   - **Admission:** the project's organization is read once. The run starts only if that billing account has at
     least 1 credit. A `usage_charges` row (same `_id` as the transaction) is created as `pending` with that `org_id`.
   - **Settlement:** the real cost, `creditsFor(transactions.total_micros)`, is charged with `chargeUsage()` to the
     stored `org_id`: included credits first, then purchased. The row becomes `settled` together with the balance
     change.
   - If the balance can't cover it, both balances go to 0 and the rest is recorded as `shortfall`. Balances never go
     below 0, so an organization overruns by at most the runs already in progress.
   - A row still `pending` after its transaction ended is settled with that transaction's cost (0 if none).
6. **Credit changes:** every grant, purchase, expiry and adjustment is a `credit_ledger` entry with a unique
   `idempotency_key`, saved together with the balance change. A duplicate key means it was already applied, even when
   the same payment arrives through a different webhook event.
7. **New credit period:** see 7.9.
8. **Cancel:** sets `cancel_at_period_end`. At the period end the subscription becomes `cancelled` (kept as the last
   subscription) and the organization moves to the default plan, through 7.9.

A balance can always be explained: per pool, the sum of `credit_ledger` entries minus the sum of `usage_charges`
deductions.

### 7.9 New credit period (`rollCreditPeriod`)

Every trigger (the scheduled worker, any webhook, a checkout) calls `dueCause(account, now)` inside its transaction.
The cause comes from the account's state, never from which trigger fired:

- **sign-up**;
- **subscription period:** the subscription id plus the provider's period start; covers a new subscription and
  each renewal;
- **subscription ended:** cancelled at period end, or cancelled by the provider;
- **scheduled reset:** monthly on the default plan, at the `credits_reset_at` it was due.

If the cause matches `credit_period_cause`, the transition has already been applied: `dueCause` returns `null` and
nothing changes. Otherwise, in one transaction:

1. For a subscription ending: set `subscription.status` to `cancelled` and `subscription.cancelled_at`, and move the
   organization to the default plan. A cancellation scheduled for the period end can still be `active` until here.
2. Decide the plan that applies now: the subscription's while it hasn't ended, otherwise the default.
3. Expire unused included credits of period N (`expiry:{org}:N`).
4. Grant that plan's monthly credits (`grant:` + the cause key).
5. Set `credit_period` to N + 1, `credit_period_cause`, the next `credits_reset_at` (the subscription's period end,
   or one month on for the default plan) and `subscription_revision` + 1.

**Example:** the worker applies a cancellation at period end, which sets `cancelled_at`. The cancellation webhook
arrives later; because `cancelled_at` is set, `dueCause` skips the subscription and only checks the default-plan reset
date, which isn't due yet, so it returns `null` and nothing changes.

The unique grant key is a second guard, and the revision check stops two triggers saving at the same moment.
Purchased credits are never touched.

### 7.10 Indexes

| Collection | Index | Use |
|---|---|---|
| `plans` | `code` (unique) | One plan per code |
| `billing_accounts` | `provider_customer_id` (unique, sparse) | Webhooks find the account |
| `billing_accounts` | `subscription.provider_subscription_id` (unique, sparse) | Webhooks find the account |
| `billing_accounts` | `credits_reset_at` | Accounts due for a new credit period |
| `invoices` | `provider, provider_invoice_id` (unique) | An invoice webhook updates the same row |
| `invoices` | `org_id, issued_at` | An organization's invoices, newest first |
| `credit_ledger` | `org_id, created_at` | An organization's credit history |
| `credit_ledger` | `idempotency_key` (unique) | Apply each change once |
| `usage_charges` | `org_id, created_at` | An organization's usage, newest first |
| `usage_charges` | `status, created_at` | Pending charges to settle |
| `billing_events` | `provider, provider_event_id` (unique) | A repeat delivery finds the same row |
| `billing_events` | `expires_at` (TTL) | Delete events after 90 days |

### 7.11 Helpers in `billing.types.ts`

- `creditsFor(total_micros)`: credits a run costs; `MICROS_PER_CREDIT` = 1,000 (1 credit = $0.001 of our cost,
  placeholder).
- `chargeUsage(credits, account)`: the split `{ included, purchased, shortfall }`. Refuses negative or fractional
  amounts.
- `causeKey(cause)`, `dueCause(account, now)`: the credit-period transition (7.9).
- `ledgerKey(entry)`: the `idempotency_key` for a ledger entry.

These are written and checked. `rollCreditPeriod` itself is a written rule set, to be built in the backend with
tests for transactions, concurrent workers and recovery.

---

## 8. Contacts

Files: [`contact-schema/`](contact-schema/) · diagram [`contacts-erd.png`](contact-schema/contacts-erd.png)

The people who chat with agents on WhatsApp, web chat, email or LINE. Called **contacts** so "customer" keeps meaning
our paying user. Today these are `customers` and `customerIdentities`.

### 8.1 `contacts`

One person, in one project. The same person writing to two projects is two contacts; contacts move with their
project.

- `_id`, `project_id`.
- `display_name?`: from the channel profile, or typed in by a teammate.
- `email?`: lowercase.
- `phone?`: E.164, e.g. `+919812345678`.
- `country?`: two letters, e.g. `IN`; from the phone number or set by a teammate. Lets knowledge and prices follow
  the country.
- `language?`: e.g. `hi`.
- `metadata`: anything the business wants to keep, e.g. `{ "tier": "gold" }`.
- `status`: `active`; `blocked` (their messages are ignored, no agent runs); `merged` (folded into another contact,
  see `merged_into`); `deleted` (erased, with `deleted_at`).
- `merged_into?`: the contact this one was merged into.
- `created_at` (first contact), `updated_at`, `deleted_at?`.

### 8.2 `contact_identities`

One way to reach a contact. A contact has one or more.

- `_id`, `project_id`, `contact_id`.
- `channel`: `web_widget`, `whatsapp`, `email` or `line`.
- `external_id`: the address on that channel. WhatsApp: the phone in E.164; email: the address in lowercase;
  web chat: the visitor id; LINE: the user id. Normalised with `normaliseExternalId()`
  (`"+91 98123-45678"` → `"+919812345678"`), which refuses anything invalid afterwards: an empty value, `"abc"`
  or a bare `"+"`. Otherwise all junk input would match one contact.
- `created_at`.

`project_id` + `channel` + `external_id` is unique.

### 8.3 Rules

- An incoming message is matched to its contact by `project_id` + `channel` + `external_id`, after
  `normaliseExternalId()`; an invalid id is refused before any lookup. If none is found, the contact and the identity
  are created in one transaction.
- **Erasure** (a contact asks to be forgotten): delete their identities, clear `display_name`, `email`, `phone` and
  `metadata`, and set status `deleted`. What happens to their messages is an open decision (section 15).
- **Merging** the same person across channels moves the identities to one contact and marks the other `merged`.
  It isn't needed at launch.

### 8.4 Indexes

| Collection | Index | Use |
|---|---|---|
| `contacts` | `project_id, created_at` | The Contacts page |
| `contact_identities` | `project_id, channel, external_id` (unique) | Match an incoming message |
| `contact_identities` | `contact_id` | A contact's identities |

---

## 9. Inbox: conversations, messages, handoffs

Files: [`inbox-schema/`](inbox-schema/) · diagram [`inbox-erd.png`](inbox-schema/inbox-erd.png)

The inbox. **Handoffs** don't have their own collection (today `handoffs`). The current state lives on the
conversation (status, assignee, reason), and every step is a `system` message, which gives the full history in the
conversation itself.

### 9.1 `conversations`

One thread between one contact and one agent.

- `_id`, `project_id`.
- `agent_id`: the agent answering it.
- `contact_id`: who it is with.
- `identity_id`: the contact identity replies are sent to.
- `channel`: copied from the identity.
- `connection_id`: the connected account it came through. The credential id (agent schema) for WhatsApp, email and
  LINE; the widget id for web chat. Replies go out through the same account.
- `open_key?`: `{agent_id}:{connection_id}:{identity_id}` (`openKey()`), set while the conversation isn't `closed`.
  Unique, so there is one open conversation per agent, connected account and contact identity, and an incoming
  message finds it in one read. The same contact emailing two connected inboxes gets two conversations, each
  replying through its own account and thread.
- `external_thread_id?`: the provider's thread, e.g. an email thread id.
- `status`:
  - `ai_active`: the agent answers.
  - `waiting_for_agent`: the AI, the contact or a teammate asked for a person; nobody has it yet.
  - `agent_active`: a teammate has it, and the AI stays silent.
  - `resolved`: done. A new message from the contact reopens it as `ai_active`.
  - `closed`: final. `open_key` is removed, so the next message starts a new conversation.
- `assigned_user_id?`: the teammate who has it. Only while `agent_active`.
- `handoff_reason?`: why a person was asked for, e.g. "Asked for a refund over ₹5,000".
- `summary?`: a short summary, e.g. written by the AI at handoff so the teammate doesn't have to read everything.
- `last_message_at`: sorts the inbox.
- `last_message_preview?`: the first 140 characters of the last message (`previewOf()`), so the inbox list never
  reads messages.
- `created_at`, `updated_at`.
- `resolved_at?`: with status `resolved` or `closed`.
- `closed_at?`: with status `closed`.

**Allowed status changes** (`CONVERSATION_TRANSITIONS`, `canMoveConversation()`):

| From | To |
|---|---|
| `ai_active` | `waiting_for_agent`, `agent_active`, `resolved` |
| `waiting_for_agent` | `agent_active`, `ai_active`, `resolved` |
| `agent_active` | `agent_active` (a transfer), `ai_active`, `resolved` |
| `resolved` | `ai_active`, `waiting_for_agent`, `closed` |
| `closed` | nothing |

### 9.2 `messages`

One message in a conversation. Kept in its own collection, so a long conversation never hits the document size limit.

- `_id`, `conversation_id`, `project_id` (copied, for queries and erasure).
- `sender_type`: `contact`, `ai`, `agent` (a teammate) or `system` (a status change).
- `sender_user_id?`: the teammate, for `agent` messages and teammate-made events.
- `content_type`: `text`, `image` or `file`.
- `content`: the text; a caption for an image or file; empty for most events.
- `attachments?`: files or images, each with `url`, `mime_type`, `name?` and `size_bytes?`.
- `citations?`: for `ai` messages, the knowledge the answer used. Each has `rag_id`, `document_id`, `title` (copied,
  so it reads correctly after the document changes), `url?` and `snippet?`.
- `transaction_id?`: for `ai` messages, the agent run that wrote it. This links the answer to its cost and its tool
  calls.
- `event?`: for `system` messages: `handoff_requested`, `assigned`, `transferred`, `returned_to_ai`, `resolved`,
  `reopened` or `closed`.
- `event_data?`: for `system` messages: `from_user_id?`, `to_user_id?`, `reason?`.
- `external_key?`: `{project_id}:{connection_id}:{provider message id}` (`externalKey()`). Unique, so a webhook
  delivered twice stores the message once. It is scoped to the project and the connected account, because a provider's
  message ids are only unique within one account (two email inboxes can both report message "123").
- `delivery?`: for outgoing WhatsApp, LINE and email messages: `sent`, `delivered`, `read` or `failed`.
- `created_at`.

### 9.3 Rules

- **Who can reply:** only the assigned teammate while `agent_active`, and the AI only while `ai_active`.
  - Replying needs `conversations.reply`.
  - Assigning someone else or transferring needs `conversations.assign`.
  - The assigned teammate can resolve, hand back to the AI or ask for help on their own conversation with
    `conversations.reply`, so support staff can finish what they take. Any other status change needs
    `conversations.manage`.
- **Recording handoffs:** every status change, assignment or transfer adds a `system` message with its event, in the
  same transaction as the conversation update.
- **Writing a message:** the message and the conversation's `last_message_at` and `last_message_preview` are saved in
  one transaction, so each message costs 2 writes.
- **Edits:** messages aren't edited, except `delivery` and erasure.
- **Closing:** a `resolved` conversation is closed `CLOSE_AFTER_DAYS` (placeholder 7) after `resolved_at`, by a
  scheduled job.
- **An incoming message, step by step:**
  1. Match the contact (8.3); a `blocked` contact stops here.
  2. Find the conversation by `open_key`, or create one.
  3. Save the message.
  4. If the conversation is `ai_active`, admit an agent run (billing, 7.8).
  5. Save the AI's reply with its `transaction_id` and `citations`.

### 9.4 Indexes

| Collection | Index | Use |
|---|---|---|
| `conversations` | `open_key` (unique, sparse) | One open conversation per agent, account and contact identity |
| `conversations` | `project_id, last_message_at` | All conversations, newest activity first |
| `conversations` | `project_id, status, last_message_at` | Queues: waiting for a person, with a person, … |
| `conversations` | `project_id, assigned_user_id, last_message_at` | "Assigned to me" |
| `conversations` | `contact_id, last_message_at` | A contact's history |
| `conversations` | `status, resolved_at` | Resolved conversations due to close |
| `messages` | `conversation_id, created_at` | A conversation's messages in order |
| `messages` | `external_key` (unique, sparse) | Store a webhook message once |

---

## 10. Tool runs

Files: [`tool-run-schema/`](tool-run-schema/) · diagram [`tool_runs-erd.png`](tool-run-schema/tool_runs-erd.png)

One document per tool call an agent makes (today `toolRuns`), so risky calls can wait for a person and every call has
a record. The tools themselves are tool nodes in the agent schema; this is the platform side of running them.

### 10.1 `tool_runs`

- `_id`, `project_id`, `agent_id`.
- `transaction_id`: the agent run that made the call.
- `conversation_id?`: the conversation, when the run was answering one.
- `node_id`, `tool_name`: the tool node, and its name copied, so history reads correctly after edits.
- `idempotent`: copied from the node; `true` when the tool's provider honours an idempotency key (e.g. Stripe's
  `Idempotency-Key`), so repeating the call with the same key can't act twice.
- `retry_window_seconds?`: copied from the node; how long after the first call a retry is still safe. It is set
  shorter than the provider's key retention (Stripe keeps keys 24 hours, so e.g. 23 hours). Missing = unknown, so a
  crashed run is never retried automatically.
- `idempotency_key`: `{transaction_id}:{node_id}:{call number}` (`toolRunKey()`). Unique in our database, and also sent
  to the provider.
- `arguments`: what the agent asked the tool to do.
- `result?`: what the tool returned.
- `status`: `pending_approval`, `approved`, `rejected`, `expired`, `running`, `succeeded`, `failed` or
  `needs_review` (we don't know whether the action happened; a person must check).
- `attempts`: how many times a worker has claimed it. The value set at a claim is that worker's claim number.
- `first_attempt_at?`: when the tool was first called; the retry window starts here.
- `lease_until?`: while `running`, the claiming worker's deadline.
- `approval_expires_at?`: for runs that needed approval, the moment after which approval is refused.
- `error?`: with `failed` or `needs_review`.
- `decided_by?`, `decided_at?`, `decision_note?`: who approved, rejected or reviewed it, when, and why.
- `created_at`, `updated_at`.
- `finished_at?`: with `succeeded`, `failed`, `rejected` or `expired`.

**Allowed status changes** (`TOOL_RUN_TRANSITIONS`, `canMoveToolRun()`):

| From | To |
|---|---|
| `pending_approval` | `approved`, `rejected`, `expired` |
| `approved` | `running` |
| `running` | `succeeded`, `failed`, `needs_review`, `running` (reclaimed after a crash) |
| `needs_review` | `succeeded`, `failed`, `approved` (a person checked and wants it run again) |
| `rejected`, `expired`, `succeeded`, `failed` | nothing |

### 10.2 Rules

- **Starting status:** a tool node with `requires_approval: true` starts as `pending_approval`, with
  `approval_expires_at` = `created_at` + `APPROVAL_TIMEOUT_HOURS` (placeholder 24). Any other starts as `approved`.
- **Approving:** done in one transaction that checks the run is `pending_approval` and that now is before
  `approval_expires_at` (`canApprove()`).
  - A late approval is refused and the run becomes `expired`.
  - Approving or rejecting needs `tools.approve`.
  - The scheduled expiry job only tidies up overdue runs; it never decides whether a late approval counts.
  - The people who can approve get a `tool_run.approval_needed` notification when the run is created.
- **Executing:** a worker claims the run in one transaction: `approved` → `running`, `attempts` + 1,
  `lease_until` = now + `LEASE_SECONDS`, and `first_attempt_at` if not set yet. It keeps the new `attempts` value as
  its claim number. Tools whose provider supports it get `idempotency_key` passed through.
- **Saving the outcome:** in one transaction, re-read the run and save `succeeded` or `failed` only if `ownsClaim()`
  holds: status `running`, `attempts` still equal to the worker's claim number, and now before `lease_until`.
  Otherwise another worker has reclaimed the run (worker A stalled, its lease ran out, worker B took over). The stale
  worker saves nothing and only logs what it saw; the current owner, or a person in `needs_review`, settles it.
- **Crash recovery:** a run still `running` after `lease_until` may or may not have done its action (the refund went
  through, then the worker crashed before saving). `recoveryStep()` decides:
  - **idempotent tool, inside its retry window** (`first_attempt_at` + `retry_window_seconds`) and under
    `MAX_ATTEMPTS` (3): claim it again and repeat the call with the same key. The provider returns the first result
    instead of acting twice.
  - **after the window, or with no window set:** `needs_review`. A provider only remembers keys for a while, after
    which the same key would be a new request, so a refund recovered days later must be checked by a person.
  - **any other tool:** never retried automatically. It becomes `needs_review`: a person checks the provider (did the
    refund happen?) and sets `succeeded`, `failed`, or `approved` to run it again.
- **Why both:** the unique `idempotency_key` stops the same call being recorded twice; the lease, the provider key and
  `needs_review` stop the action happening twice.
- **No secrets:** `arguments` and `result` never hold secrets. Credentials are referenced by the tool node, not copied.

### 10.3 Indexes

| Collection | Index | Use |
|---|---|---|
| `tool_runs` | `idempotency_key` (unique) | Record each call once |
| `tool_runs` | `project_id, status, created_at` | The approvals queue and a project's history |
| `tool_runs` | `conversation_id, created_at` | The calls made inside one conversation |
| `tool_runs` | `status, approval_expires_at` | Overdue approvals to tidy up |
| `tool_runs` | `status, lease_until` | Runs whose worker lease ended (crash recovery) |

---

## 11. Notifications

Files: [`notification-schema/`](notification-schema/) · diagram [`notifications-erd.png`](notification-schema/notifications-erd.png)

The in-app bell. One document per notification per person. Deleted automatically after 90 days.

### 11.1 `notifications`

- `_id`.
- `user_id`: who sees it.
- `org_id`: their organization.
- `type`, for example:
  - `conversation.handoff_requested`
  - `conversation.assigned`
  - `tool_run.approval_needed`
  - `invitation.accepted`
  - `billing.payment_failed`
  - `billing.credits_low`
- `title`, `body`: the text, written when it is created so it reads the same later.
- `section?`: where clicking goes in the app, e.g. `inbox`.
- `resource_type?`, `resource_id?`: what it is about, e.g. `tool_run` and its id.
- `project_id?`: when it belongs to a project.
- `actor_user_id?`: who caused it; missing = the system.
- `dedupe_key`: `{type}:{event id}:{user_id}` (`dedupeKey()`). Unique, so one event notifies a person once. The event
  id names one occurrence, not the record it is about: a retry of the same event reuses it, and a later event gets a
  new one. A conversation transferred A → B → A gives A two notifications.

  | Type | Event id |
  |---|---|
  | `conversation.handoff_requested` | the `handoff_requested` system message id |
  | `conversation.assigned` | the `assigned` or `transferred` system message id |
  | `tool_run.approval_needed` | the tool run id (a run asks for approval once) |
  | `invitation.accepted` | the invitation id |
  | `billing.payment_failed` | the billing event id of that failure |
  | `billing.credits_low` | `{org_id}:{credit_period}` (once per credit period) |
- `read_at?`: missing = unread.
- `created_at`.
- `expires_at`: `created_at` + 90 days (TTL).

### 11.2 Rules

- **One document per recipient.** "Everyone who can approve tools in this project" is written once for each of those
  people.
- **Edits:** only `read_at` ever changes.
- **In-app only.** Emails go out separately, only to users with `settings.notifications.email` on, and aren't stored
  here.
- **Privacy:** every read is filtered by `user_id`, so people see only their own.

### 11.3 Indexes

| Collection | Index | Use |
|---|---|---|
| `notifications` | `user_id, created_at` | A person's bell, newest first |
| `notifications` | `user_id, read_at` | Unread count |
| `notifications` | `dedupe_key` (unique) | Notify once per event |
| `notifications` | `expires_at` (TTL) | Delete after 90 days |

---

## 12. Audit log

Files: [`audit-schema/`](audit-schema/) · diagram [`audit_events-erd.png`](audit-schema/audit_events-erd.png)

Who did what, and when, in an organization (today `auditEvents`). A security record covering member and role changes,
agent and knowledge changes, credentials, billing and tool approvals.

### 12.1 `audit_events`

- `_id`, `org_id`.
- `project_id?`: when the change is inside a project.
- `actor_type`: `user`; `system` (a scheduled job, a webhook); or `platform` (our own staff acting inside a customer's
  organization).
- `actor_user_id?`: missing for `system`.
- `action`: `<thing>.<verb>`, e.g. `member.invited`, `agent.published`, `tool_run.approved`, `plan.changed`.
- `resource_type`, `resource_id?`: what was changed, e.g. `agent` and its id.
- `changes?`: only the fields that changed, as `before` and `after`. Secrets are never written, only that they
  changed: `{ "secret_values": "changed" }`.
- `request_id?`, `ip_address?`, `user_agent?`: to match the API's own logs.
- `created_at`.
- `expires_at`: `created_at` + 365 days (TTL, placeholder).

### 12.2 Rules

- **Recorded with the change:** written in the same transaction as the change it records, so nothing changes
  unrecorded.
- **Append-only:** never edited.
- **Who can read it:** reading needs the organization action `audit.view` (owners and admins).

### 12.3 Indexes

| Collection | Index | Use |
|---|---|---|
| `audit_events` | `org_id, created_at` | An organization's log, newest first |
| `audit_events` | `org_id, resource_type, resource_id, created_at` | The history of one thing |
| `audit_events` | `expires_at` (TTL) | Delete after the retention period |

---

## 13. Agents, knowledge and transactions

Designed by the other team member; their own READMEs are the reference:
[`agent-schema/README.md`](agent-schema/README.md), [`knowledge-schema/README.md`](knowledge-schema/README.md),
[`transactions-schema/README.md`](transactions-schema/README.md).

Where they meet the platform schemas:

- **`project_id`:** agents, agent templates, credentials, knowledge bases, documents, transactions and agent storage
  all belong to a project (section 6).
- **Inbox:** an AI message points to its `transaction_id`; citations point to `rags` and `rag_documents`.
- **Tool runs:** tool nodes need `requires_approval`, `idempotent` and `retry_window_seconds` settings, and tools whose
  provider supports it should send the run's `idempotency_key` (section 10).
- **`agent_storage`** holds the agent's own copy of a conversation. The inbox (`conversations`, `messages`) is the
  record teammates see. Agree whether the agent reads its history from `messages` instead, so it isn't stored twice.
- **Billing:** reads `transactions._id`, `project_id`, `agent_id` and `total_micros` when a run finishes and writes
  its own `usage_charges` row. Nothing needs to be added to `transactions`.
- **Costs and credits:** `transactions.prices` is our cost per unit (micro-USD); what the customer pays in credits is
  billing (section 7).

Points raised for the other team member (from the platform review):

- **Web chat widget:** today's main channel has no node handler or trigger. It needs a `web_widget` io node with a
  public widget id and the websites allowed to use it.
- **Today's agent settings** (instructions, model, tone, languages, escalation, tools, knowledge sources) need a home
  in node config.
- **Shared templates or own copy:** editing a shared template changes every live agent. Suggested: each agent keeps
  its own nodes and triggers.
- **Draft, test and publish:** suggested a draft next to the live setup, with a version number recorded on each
  transaction.
- **Cron triggers:** one cloud scheduler job per trigger costs money as it grows. Suggested: one worker that runs due
  triggers.
- **Credential encryption:** Cloud KMS is paid. Suggested: start with one key kept as an environment secret.
- **Which knowledge bases an agent searches:** still open in the knowledge schema. Suggested: an explicit `rag_ids`
  list, as the Assistants page does today.
- **The RAG service** uses its own namespace and vector-id rules and its own job table. Per-document re-indexing
  needs a change there.

### 13.1 The platform's side: `knowledge_sources` and `assistants`

- **`knowledge_sources`** (`knowledge-source-schema/`): one uploaded document, or a .zip of several. It has the same
  `_id` as the RAG's `rags` record, and keeps what the RAG doesn't: the name people gave it, the upload until the RAG
  has read it, and who added it. Status and counts are read from `rags` and `rag_jobs`.
- **`assistants`** (`assistant-schema/`): the agent the team edits in the studio. It holds the draft
  (`instructions`, `tone`, `languages`, `source_id`, `model`, `flow`) and, once published, a copy of it in
  `published`.
  - The RAG has no drafts, and caches its `agents`, `agent_templates` and `node_types` records without reading them
    again. So the platform never edits a RAG agent. It writes a new one (an `agents` record and its template) for
    each set of settings to run, and deletes the one it replaces:
    - `live_agent_id`: the published settings, for customers. Publishing and resuming write a new one; pausing and
      archiving delete it.
    - `test_agent_id`: the saved draft, for the studio's test chat. It is written the first time someone tests a
      new draft version.
  - Each RAG template is `input → reply → history → output` (flow `direct`). `reply` runs the chosen model, with a
    system prompt built from the instructions, tone and languages. It searches the knowledge source when there is
    one: the template's `rag_id` is `source_id`. `history` is a `chat_history` node.
  - Flow `checked` adds `review` after `reply`. It reads each reply and either sends it back to be written again
    (at most twice, `pick_limits`) or passes it on to `history`. It needs an OpenAI model (see below).
  - Models: the ones in the RAG's `configLLM.json` for OpenAI, Google and DeepSeek (`ASSISTANT_MODELS`), each run by
    its provider's handler (`openai_chat`, `gemini_chat`, `deepseek_chat`). Default `gpt-5.4-mini`.
  - The node types are the platform ones (no `project_id`) for those handlers and `chat_history`. They must exist
    in the database; `npm run db:init` creates them on the emulator.
  - One knowledge source per agent, as the template has a single `rag_id`. Publishing needs it to be ready, and a
    source an agent uses can't be deleted.
  - Statuses: `draft` (never published), `live`, `paused`, `archived` (kept, hidden, never runs).

To raise with the other team member (2026-11-02):

- **Reloading a changed agent:** a way to tell the RAG an agent or template changed, so the platform could keep one
  RAG agent per agent. A new RAG agent per publish also starts customers' conversations afresh.
- **Citations:** the agent query answers with text only. The studio would show which documents an answer used.
- **Gemini and a step that sends a reply back:** when a picking node sends the run back to a Gemini node, the
  request ends with the picking node's message, and Gemini refuses it ("Requests ending with a model turn are not
  supported"). The same happens when the picking node itself is Gemini. Until that's handled in the RAG, the
  platform allows the `checked` flow on OpenAI models only.
- **xAI:** the RAG reads `XAI_API_KEY`, but `server.env` has `GROG_API_KEY`, so `grok-4.5` can't run. It's left
  out of the model list.

---

## 14. Not designed yet

- **Daily analytics totals** (today `stats/totals`): dashboard numbers can be summed from `transactions`,
  `usage_charges` and `conversations`. Add a daily totals collection only if the dashboards get slow.
- **`password_credentials`:** only when we build our own login (4.5).
- **Web widget lookup** (today `publicChannels`): maps a public widget id to its agent. Agree with the other team
  member whether it lives with their channel nodes (section 13) or with us.

---

## 15. Open decisions

**Billing** (business choices; the structure is ready):

1. **Payment provider:** Razorpay (India: UPI, cards, netbanking), Stripe, or both. Both charge a fee per payment;
   neither has a fixed monthly cost for the basics.
2. **Currencies:** INR only, USD only, or both (the design allows both).
3. **Pricing model:** subscription with included credits (current design), credits only (pay as you go), or
   subscription only with hard limits.
4. **Credit value:** what one credit is worth. Placeholder: 1 credit = $0.001 of our cost, with the margin built into
   plan prices.
5. **Free plan:** monthly credits and limits (example: 1,000 credits, 1 project, 1 agent, 2 members, 20 documents).
6. **Out of credits:** stop agents (current design), or allow overage billed at the end of the month.
7. **Top-ups:** can customers buy extra credits (current design: yes, they never expire)?
8. **Failed payment (`past_due`):** how many days before moving to the default plan.
9. **Yearly billing and trials:** offer them or not.
10. **Tax:** GST on Indian invoices (18%); who calculates it (the provider or us), and whether to collect GSTIN.

**Inbox, tools, audit** (placeholders in code until decided):

11. **Closing resolved conversations:** after how many days (`CLOSE_AFTER_DAYS`, placeholder 7).
12. **Approval timeout:** how long a tool call may wait for approval (`APPROVAL_TIMEOUT_HOURS`, placeholder 24).
13. **Audit retention:** how long the audit log is kept (`RETENTION_DAYS`, placeholder 365).
14. **Contact erasure:** when a contact asks to be forgotten, delete their messages, or keep them with the text
    replaced by "[removed]".

**Other:**

- Agree the points in section 13 with the other team member, including `requires_approval` and `idempotent` on tool
  nodes, and whether agents read history from `messages`.
- Rename `customers.*` to `contacts.*` in today's permission catalog and frontend when the migration starts.

---

## 16. Native Firestore

The platform and the RAG share one native Firestore database (decided 2026-10-26). How the platform's storage layer
(`platform-api/src/firestore/database.ts`) maps this design onto it:

- **Documents** are stored under their `_id` and keep `_id` as a field too, the way the RAG reads records. Dates come
  back as `Date`.
- **Rules in code:** the API checks every rule in the "Rules enforced in code" block of each `*.types.ts`.
  `firestore.rules` denies all browser access; only the Admin SDK on the server reads and writes.
- **Unique values:** each one gets a document in `unique_values` named `<kind>:<value>`, for example
  `users.email:ravi%40example.com`, created in the same transaction as the record. A second claim of the same value
  fails the transaction with `ALREADY_EXISTS`, which the API answers with 409.
  - Claimed so far: `users.email`, `auth_identities.subject`, `organizations.slug`, `plans.code` and
    `credit_ledger.idempotency_key`.
  - `invitations.pending_key` needs no claim: invites are made under the organization lock, which revokes the open
    invite first.
- **Transactions:** Firestore needs every read before the first write. The `Tx` helper holds writes back and sends
  them together at the end, so a read in a transaction never sees that transaction's own writes. Firestore reruns a
  transaction that overlaps another, so the work inside must have no side effects outside the database.
- **Organization lock:** changes to membership or plan limits read and write the organization document, so two
  overlapping ones can't both commit.
- **Queries** use equality filters, which need no extra index. Small result sets (an organization's people, projects
  and invitations) are filtered and sorted in code. No index is built over `projects.members`.
  - Composite indexes live in `firestore.indexes.json`. So far there is one: `audit_events (org_id, created_at desc)`.
- **TTL:** `invitations.expires_at`, `billing_events.expires_at`, `notifications.expires_at` and
  `audit_events.expires_at` need Firestore TTL policies, which need the Blaze plan. Until then the maintenance job
  deletes expired records. Code always checks the time itself, so a late deletion never lets an old record through.
- **Busy documents:** Firestore suggests keeping sustained writes to one document around one per second. Every agent
  run updates its organization's billing account, so a very busy organization may later need its usage batched.
