# User schema

Who a person is on the platform (`users`) and how they sign in (`auth_identities`).
MongoDB-style documents; works on Firestore with MongoDB compatibility.

## Files

| File | What it is |
|---|---|
| `users-erd.svg`, `users-erd.png` | Diagram with relationships and cardinality |
| `users.types.ts` | TypeScript types and the rules the API enforces |
| `users.mongo.js` | MongoDB validators and indexes (run once with mongosh) |
| `users.example.json` | One user and its Firebase identity |
| `../shared.types.ts` | `OrgRole`, `AuthProvider` and the Firebase sign-in name map, shared with the Organization schema |

## Collections

| Collection | One document per | Holds |
|---|---|---|
| `users` | Person (a customer; the plan is on their organization) | Name, contact details, date of birth and gender (optional), status, organization membership, settings, terms acceptance |
| `auth_identities` | Way a person signs in | `provider` (`firebase` or `local`), `subject` (the provider-specific account identifier), `user_id` |

## Relationships

```
users          1 ── 1..N  auth_identities
users          1 ── 1     membership      (embedded)
users          1 ── 0..1  settings        (embedded)
organizations  1 ── 1..N  users           (through membership.org_id)
```

## Decisions

Settled; change them only on purpose.

1. A user belongs to exactly one organization.
2. Any new user with no organization attached gets their own organization (e.g. "Asha's workspace")
   on the **default plan**, with them as owner. A new user who signs up through an invite joins that
   organization instead. Which plan is the default is set in the Billing schema.
3. Each environment (local, staging, production) has its own Firebase project and its own database.
   That is why `auth_identities` has no `issuer` field.
4. Plans belong to organizations, not users. "Free or paid customer" means the organization's plan.
5. Joining another organization moves the user there, and their projects move with them
   (`projects.org_id` changes; everything else hangs off `project_id`). The emptied organization is closed.
   Only offered while they are its only member. Becoming a company updates their own organization
   in place (name, slug, plan); nothing moves.
6. Sign-in always resolves to our own `users._id`. The Firebase uid is never used as a user id.
7. A user whose status isn't `active` is refused after the identity is resolved.

## Sign-in

1. Verify the Firebase token.
2. Find `auth_identities` by `provider: "firebase"` and `subject` = the token's uid, and take its `user_id`.
   Not found means first sign-in. In one transaction, create the user, the identity and the membership:
   in the inviting organization if they came through an invite, otherwise in a new organization of
   their own on the default plan.
3. Read the user by `_id`; refuse if `status` isn't `active`.
4. Before checking the organization's `allowed_providers`, map the token's `firebase.sign_in_provider`
   with `FIREBASE_SIGN_IN_PROVIDERS` (`google.com` → `google`, `password` → `email`, `github.com` → `github`).

Reads per organization request: identity + user + organization = 3 with an empty cache,
user + organization = 2 after a cache hit. (The current backend: organization + member = 2.)

**Identity cache** (in memory, inside the API process):

- Key: `provider + subject`. Value: `user_id`. Never cache the user's status, so a suspension applies on the next request.
- Bounded size and a short expiry (for example 10 minutes), so a removed identity stops working on every API instance within that time.
- Remove the entry when that identity is removed or changed.

## Moving off Firebase later

Add a `local` identity next to the `firebase` one, then remove the `firebase` one.
`users._id` and everything that points to it stay the same.

- Passwords go in a separate `password_credentials` collection (`user_id` unique, `password_hash`, `password_changed_at`), never in `users`.
- Firebase password hashes can be exported for eligible email/password users when the required
  IAM permission and hash parameters are available. If the local authentication service supports
  Firebase's modified Scrypt algorithm, those users may migrate without resetting their passwords.
  OAuth-only users and accounts with unavailable or unsupported hashes need to set local credentials
  or reset their password.

## Indexes

| Collection | Index | Use |
|---|---|---|
| `users` | `email` (unique, sparse) | One account per email, where an email exists |
| `users` | `membership.org_id` | An organization's members |
| `auth_identities` | `provider, subject` (unique) | Find the user on sign-in |
| `auth_identities` | `user_id` | A user's sign-in methods |

## On Firestore with MongoDB compatibility

- Validators (`$jsonSchema`, `collMod`) don't run there; the API checks the same rules (listed in `users.types.ts`).
- `email` uses a sparse index instead of a partial one, because partial indexes aren't supported.
