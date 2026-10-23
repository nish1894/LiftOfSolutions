# Organization schema

Organizations (the customer account that holds the plan) and invitations (how people join one).
MongoDB-style documents; works on Firestore with MongoDB compatibility.

## Files

| File | What it is |
|---|---|
| `organizations-erd.svg`, `organizations-erd.png` | Diagram with relationships and cardinality |
| `organizations.types.ts` | Types, role actions (`ORG_ROLE_ACTIONS`, `canOrg()`), the rules the API enforces, `defaultSlug()`, `pendingKey()` |
| `organizations.mongo.js` | MongoDB validators and indexes (run once with mongosh) |
| `organizations.example.json` | One organization and one pending invitation |
| `../shared.types.ts` | `OrgRole`, `AuthProvider` and the Firebase sign-in name map, shared with the User schema |

## Collections

| Collection | One document per | Holds |
|---|---|---|
| `organizations` | Company, or an individual's own workspace | Name, slug, logo, plan, status, settings |
| `invitations` | Invite sent to one email | Role, hashed token, `pending_key`, status, expiry |

Which organization a user is in, and their role, is stored on the user (`users.membership`, User schema).

## Relationships

```
organizations  1 ── 1..N  users           (users.membership.org_id, User schema)
organizations  1 ── 0..N  invitations
organizations  1 ── 1     settings        (embedded)
plans          1 ── 0..N  organizations   (Billing schema)
```

## Decisions

Settled; change them only on purpose.

1. Every user belongs to exactly one organization. A new user who doesn't come through an invite gets their own
   (e.g. "Asha's workspace") on the default plan, with them as owner.
2. People join only by invitation. There are no join codes or join requests.
3. An invite is valid for 24 hours. Expired invites are deleted automatically 7 days after they expire.
4. One open invite per person per organization. Inviting the same person again replaces the open invite.
5. Accepting needs a pending invite that hasn't expired, and the signed-in email must match the invite and be verified.
6. An organization always has at least one owner. The last owner can't be demoted or removed;
   when they leave or delete their account, the organization is closed.
7. A closed organization (status `deleted` plus `deleted_at`) is kept, never purged. A paid plan is cancelled first.
8. A member who leaves, is removed, or whose organization is closed gets a new organization of their own on the
   default plan. Their work stays with the old organization.
9. Only the platform team can suspend an organization. While suspended, its members are refused and its data is kept.
10. A new organization starts with `DEFAULT_ORG_SETTINGS`: invites pre-select the `member` role, and all three
    sign-in methods are allowed.
11. Slug: an organization created for a new user gets `defaultSlug(name, _id)`, e.g. `ashas-workspace-3b9e7c`.
    Owners can change it if the new one is still unique. Renaming the organization doesn't change the slug.
12. Ids are UUID v4.

## Roles

| Action | owner | admin | member |
|---|---|---|---|
| `org.edit`: name, logo, settings | yes | yes | no |
| `members.manage`: invite and remove members and admins | yes | yes | no |
| `owners.manage`: invite, remove or change owners | yes | no | no |
| `billing.manage`: plan and payments | yes | no | no |
| `org.close` | yes | no | no |
| `projects.view_all`: see every project | yes | yes | no |
| `projects.create` | yes | yes | yes |

- Changing what a role can do is one line in `ORG_ROLE_ACTIONS`.
- Anything that touches an owner needs `owners.manage`, so an admin can never change an owner.
- Work inside a project (agents, inbox, knowledge) is controlled by project roles (Project schema),
  checked after the organization check.

## Request check

1. Resolve the user (see the sign-in steps in the User schema README).
2. Read the organization from `users.membership.org_id`. Refuse if the user or the organization isn't `active`.
3. Check `canOrg(users.membership.role, action)`.

Every user has exactly one organization, so routes don't need an organization id in the URL.

## Indexes

| Collection | Index | Use |
|---|---|---|
| `organizations` | `slug` (unique) | One organization per slug |
| `organizations` | `plan_id` | Every organization on a plan |
| `invitations` | `pending_key` (unique, sparse) | One open invite per person per organization |
| `invitations` | `token_hash` (unique) | Find the invite when someone opens the link |
| `invitations` | `expires_at` (TTL, 7 days) | Delete expired invites |
| `users` | `membership.org_id` | An organization's members (created in `users.mongo.js`) |

## On Firestore with MongoDB compatibility

- Validators (`$jsonSchema`, `collMod`) don't run there; the API checks the same rules (listed in `organizations.types.ts`).
- One open invite per person uses `pending_key` with a sparse index, because partial indexes aren't supported.
- The TTL index works there, but deletion isn't instant: an expired invite is usually removed within 24 hours
  after its 7 days are up. Acceptance checks `expires_at` itself, so this never lets an old invite through.
