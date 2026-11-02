import { randomUUID, randomBytes, createHash } from "node:crypto";
import type { DecodedIdToken } from "firebase-admin/auth";
import { AppError, conflict, forbidden, notFound } from "../common/errors.js";
import type { Config } from "../config.js";
import {
  deleteField,
  duplicate,
  type Database,
  type Reader,
  type Tx,
} from "./database.js";
import type { User } from "../domain/schema/user-schema/users.types.js";
import {
  DEFAULT_ORG_SETTINGS,
  canOrg,
  defaultSlug,
  pendingKey,
  type OrgAction,
  type Organization,
  type Invitation,
} from "../domain/schema/organization-schema/organizations.types.js";
import {
  FIREBASE_SIGN_IN_PROVIDERS,
  type OrgRole,
} from "../domain/schema/shared.types.js";
import {
  projectPermissions,
  ungrantable,
  type Project,
  type ProjectPermission,
  type ProjectMember,
} from "../domain/schema/project-schema/projects.types.js";
import {
  causeKey,
  ledgerKey,
  type Plan,
} from "../domain/schema/billing-schema/billing.types.js";
import type { AuditEvent } from "../domain/schema/audit-schema/audit_events.types.js";

// user is the record read once when the request was authenticated. It is reused by context() outside
// transactions; inside a transaction the user is always read again so the change sees current data.
export type Principal = {
  userId: string;
  token: DecodedIdToken;
  requestId?: string;
  user?: User;
};

// Sign-in identity → user id. The link never changes, so it is cached in memory; the user's status
// is never cached, so a suspension applies on the next request.
const IDENTITY_CACHE_MS = 10 * 60_000;
const IDENTITY_CACHE_MAX = 10_000;
export const id = randomUUID;
export const tokenHash = (token: string) =>
  createHash("sha256").update(token).digest("hex");
const live = (doc: { status: string }) => doc.status !== "deleted";
export function nextMonth(now: Date): Date {
  const result = new Date(now);
  const day = result.getUTCDate();
  result.setUTCDate(1);
  result.setUTCMonth(result.getUTCMonth() + 1);
  const last = new Date(
    Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0),
  ).getUTCDate();
  result.setUTCDate(Math.min(day, last));
  return result;
}

export class Platform {
  private readonly identityCache = new Map<
    string,
    { userId: string; expires: number }
  >();

  constructor(
    readonly db: Database,
    readonly config: Config,
  ) {}

  private async identity(read: Reader, subject: string) {
    const identities = await read.find("auth_identities", (q) =>
      q.where("subject", "==", subject),
    );
    return identities.find((identity) => identity.provider === "firebase");
  }

  private async userIdFor(subject: string): Promise<string | null> {
    const key = `firebase:${subject}`;
    const hit = this.identityCache.get(key);
    if (hit && hit.expires > Date.now()) return hit.userId;
    const identity = await this.identity(this.db, subject);
    if (!identity) {
      this.identityCache.delete(key);
      return null;
    }
    if (this.identityCache.size >= IDENTITY_CACHE_MAX) {
      const oldest = this.identityCache.keys().next().value;
      if (oldest !== undefined) this.identityCache.delete(oldest);
    }
    this.identityCache.set(key, {
      userId: identity.user_id,
      expires: Date.now() + IDENTITY_CACHE_MS,
    });
    return identity.user_id;
  }

  // The organization's people, without deleted accounts. An organization has few, so filters are done here.
  async orgUsers(read: Reader, orgId: string): Promise<User[]> {
    const users = await read.find("users", (q) =>
      q.where("membership.org_id", "==", orgId),
    );
    return users.filter(live);
  }

  // The organization's projects, oldest first, without deleted ones. Bounded by the plan's project limit.
  async orgProjects(read: Reader, orgId: string): Promise<Project[]> {
    const projects = await read.find("projects", (q) =>
      q.where("org_id", "==", orgId),
    );
    return projects
      .filter(live)
      .sort((a, b) => a.created_at.getTime() - b.created_at.getTime());
  }

  // The RAG lets an account use a project only if project_members/{projectId}_{userId} exists
  // (Schema_liftofsol README 6.5). For each pair, write the copy if the person can use the project
  // and delete it otherwise. Pass the users and projects as they are after the change.
  syncAccessCopies(tx: Tx, users: User[], projects: Project[]) {
    const now = new Date();
    for (const user of users)
      for (const project of projects) {
        const copyId = `${project._id}_${user._id}`;
        const allowed =
          user.status === "active" &&
          live(project) &&
          user.membership.org_id === project.org_id &&
          projectPermissions(user.membership.role, project, user._id).size > 0;
        if (allowed)
          tx.set("project_members", {
            _id: copyId,
            project_id: project._id,
            user_id: user._id,
            updated_at: now,
          });
        else tx.delete("project_members", copyId);
      }
  }

  audit(
    tx: Tx,
    principal: Principal | null,
    orgId: string,
    action: string,
    resource: string,
    resourceId: string,
    changes?: AuditEvent["changes"],
    projectId?: string,
  ) {
    const now = new Date();
    tx.create("audit_events", {
      _id: id(),
      org_id: orgId,
      actor_type: principal ? "user" : "system",
      ...(principal ? { actor_user_id: principal.userId } : {}),
      ...(principal?.requestId ? { request_id: principal.requestId } : {}),
      ...(projectId ? { project_id: projectId } : {}),
      ...(changes ? { changes } : {}),
      action,
      resource_type: resource,
      resource_id: resourceId,
      created_at: now,
      expires_at: new Date(now.getTime() + 365 * 86400_000),
    });
  }

  async defaultPlan(read: Reader = this.db): Promise<Plan> {
    const plans = (
      await read.find("plans", (q) => q.where("is_default", "==", true))
    ).filter((plan) => plan.status === "active");
    if (plans.length !== 1)
      throw new AppError(
        "DEFAULT_PLAN_NOT_CONFIGURED",
        "Provision exactly one active default plan before onboarding.",
        503,
      );
    return plans[0]!;
  }

  async createOrganization(
    tx: Tx,
    userId: string,
    name: string,
  ): Promise<Organization> {
    const now = new Date(),
      orgId = id(),
      plan = await this.defaultPlan(tx);
    const org: Organization = {
      _id: orgId,
      name,
      slug: defaultSlug(name, orgId),
      plan_id: plan._id,
      status: "active",
      created_by: userId,
      created_at: now,
      updated_at: now,
      settings: structuredClone(DEFAULT_ORG_SETTINGS),
    };
    tx.create("organizations", org);
    tx.claim("organizations.slug", org.slug, orgId);
    const cause = { kind: "signup" as const, org_id: orgId };
    tx.create("billing_accounts", {
      _id: orgId,
      credit_period: 1,
      credit_period_cause: causeKey(cause),
      subscription_revision: 0,
      included_credits_left: plan.monthly_credits,
      purchased_credits_left: 0,
      credits_reset_at: nextMonth(now),
      created_at: now,
      updated_at: now,
    });
    const grantId = id(),
      grantKey = ledgerKey({ type: "grant", cause });
    tx.create("credit_ledger", {
      _id: grantId,
      org_id: orgId,
      type: "grant",
      idempotency_key: grantKey,
      credits: plan.monthly_credits,
      pool: "included",
      created_at: now,
    });
    tx.claim("credit_ledger.idempotency_key", grantKey, grantId);
    return org;
  }

  async findUser(token: DecodedIdToken): Promise<User> {
    const userId = await this.userIdFor(token.uid);
    if (!userId)
      throw conflict(
        "ONBOARDING_REQUIRED",
        "Complete account onboarding first.",
      );
    const user = await this.db.get("users", userId);
    if (!user || user.status !== "active") throw forbidden();
    return user;
  }

  async onboard(
    token: DecodedIdToken,
    input: {
      organization_name?: string | undefined;
      invitation_token?: string | undefined;
    },
  ): Promise<User> {
    try {
      return await this.db.transaction(async (tx) => {
        const identity = await this.identity(tx, token.uid);
        if (identity) {
          const user = await tx.get("users", identity.user_id);
          if (!user || user.status !== "active") throw forbidden();
          return user;
        }
        const now = new Date(),
          userId = id();
        const email = token.email?.trim().toLowerCase();
        const displayName =
          typeof token.name === "string" && token.name.trim()
            ? token.name.trim()
            : email?.split("@")[0] || "User";
        let org: Organization,
          role: OrgRole = "owner",
          projects: Project[] = [];
        let invitation: Invitation | undefined;
        if (input.invitation_token) {
          invitation = await this.validInvitation(
            tx,
            token,
            input.invitation_token,
          );
          org = await this.lockOrganization(tx, invitation.org_id);
          this.checkProvider(org, token);
          await this.checkMemberCapacity(tx, org);
          role = invitation.role;
          projects = await this.orgProjects(tx, org._id);
        } else
          org = await this.createOrganization(
            tx,
            userId,
            input.organization_name || `${displayName}'s workspace`,
          );
        const user: User = {
          _id: userId,
          display_name: displayName,
          ...(email ? { email } : {}),
          ...(typeof token.picture === "string"
            ? { avatar_url: token.picture }
            : {}),
          status: "active",
          membership: {
            org_id: org._id,
            role,
            created_at: now,
            updated_at: now,
          },
          settings: { notifications: { product_updates: false } },
          created_at: now,
          updated_at: now,
        };
        tx.create("users", user);
        if (email) tx.claim("users.email", email, userId);
        const identityId = id();
        tx.create("auth_identities", {
          _id: identityId,
          user_id: userId,
          provider: "firebase",
          subject: token.uid,
          created_at: now,
        });
        tx.claim(
          "auth_identities.subject",
          `firebase:${token.uid}`,
          identityId,
        );
        if (invitation) this.consumeInvitation(tx, invitation);
        this.syncAccessCopies(tx, [user], projects);
        this.audit(
          tx,
          { userId, token },
          org._id,
          "user.created",
          "user",
          userId,
        );
        return user;
      });
    } catch (error) {
      if (!duplicate(error)) throw error;
      // Concurrent onboarding may win the unique identity race. Never link by email.
      if (await this.identity(this.db, token.uid)) return this.findUser(token);
      throw conflict(
        "EMAIL_ALREADY_LINKED",
        "This contact email belongs to another account. Sign in with its existing identity.",
      );
    }
  }

  checkProvider(org: Organization, token: DecodedIdToken) {
    const provider =
      FIREBASE_SIGN_IN_PROVIDERS[token.firebase?.sign_in_provider ?? ""];
    if (!provider || !org.settings.allowed_providers.includes(provider))
      throw new AppError(
        "SIGN_IN_PROVIDER_NOT_ALLOWED",
        "This organization does not allow this sign-in method.",
        403,
      );
  }

  async context(
    principal: Principal,
    orgId?: string,
    action?: OrgAction,
    tx?: Tx,
    allowUnaccepted = false,
  ) {
    const read: Reader = tx ?? this.db;
    const user =
      !tx && principal.user
        ? principal.user
        : await read.get("users", principal.userId);
    if (!user || user.status !== "active") throw forbidden();
    if (!allowUnaccepted && user.terms_version !== this.config.TERMS_VERSION)
      throw new AppError(
        "TERMS_REQUIRED",
        "Accept the current terms before using the platform.",
        403,
      );
    if (orgId && user.membership.org_id !== orgId)
      throw notFound("Organization");
    const org = await read.get("organizations", user.membership.org_id);
    if (!org || org.status !== "active") throw forbidden();
    this.checkProvider(org, principal.token);
    if (action && !canOrg(user.membership.role, action))
      throw forbidden(action);
    return { user, org };
  }

  // All membership/project-limit changes read and write the organization document. Firestore then lets
  // only one of two overlapping transactions commit and reruns the other, which avoids write skew
  // (two last owners leaving, two projects taking the final plan slot).
  async lockOrganization(tx: Tx, orgId: string): Promise<Organization> {
    const org = await tx.get("organizations", orgId);
    if (!org || org.status !== "active") throw notFound("Organization");
    const now = new Date();
    tx.update("organizations", orgId, { updated_at: now });
    return { ...org, updated_at: now };
  }

  async project(
    principal: Principal,
    projectId: string,
    permission?: ProjectPermission,
    tx?: Tx,
  ) {
    const { user, org } = await this.context(
      principal,
      undefined,
      undefined,
      tx,
    );
    const project = await (tx ?? this.db).get("projects", projectId);
    if (!project || project.org_id !== org._id || !live(project))
      throw notFound("Project");
    const permissions = projectPermissions(
      user.membership.role,
      project,
      user._id,
    );
    if (!permissions.size || (permission && !permissions.has(permission)))
      throw forbidden(permission);
    return { user, org, project, permissions };
  }

  async createProject(
    principal: Principal,
    orgId: string,
    input: { name: string; description?: string | undefined },
  ) {
    return this.db.transaction(async (tx) => {
      const { user } = await this.context(
        principal,
        orgId,
        "projects.create",
        tx,
      );
      const org = await this.lockOrganization(tx, orgId);
      const plan = await tx.get("plans", org.plan_id);
      const existing = await this.orgProjects(tx, orgId);
      if (!plan || existing.length >= plan.limits.projects)
        throw conflict(
          "PLAN_LIMIT",
          "The project limit for this plan has been reached.",
        );
      const now = new Date();
      const project: Project = {
        _id: id(),
        org_id: orgId,
        name: input.name,
        ...(input.description === undefined
          ? {}
          : { description: input.description }),
        status: "active",
        members: [
          {
            user_id: user._id,
            grants: [],
            denies: [],
            added_by: user._id,
            added_at: now,
          },
        ],
        created_by: user._id,
        created_at: now,
        updated_at: now,
      };
      tx.create("projects", project);
      this.syncAccessCopies(tx, await this.orgUsers(tx, orgId), [project]);
      this.audit(
        tx,
        principal,
        orgId,
        "project.created",
        "project",
        project._id,
        { after: { name: project.name } },
        project._id,
      );
      return project;
    });
  }

  async changeProjectAccess(
    principal: Principal,
    projectId: string,
    input: {
      role_permissions?: Project["role_permissions"] | undefined;
      member?:
        | {
            user_id: string;
            grants: ProjectPermission[];
            denies: ProjectPermission[];
          }
        | undefined;
      remove_user_id?: string | undefined;
    },
  ) {
    return this.db.transaction(async (tx) => {
      const { user, org } = await this.context(
        principal,
        undefined,
        "projects.manage_access",
        tx,
      );
      await this.lockOrganization(tx, org._id);
      const project = await tx.get("projects", projectId);
      if (!project || project.org_id !== org._id || !live(project))
        throw notFound("Project");
      const ownPermissions = projectPermissions(
        user.membership.role,
        project,
        user._id,
      );
      const next = structuredClone(project);
      if (input.role_permissions) {
        if (
          input.role_permissions.admin !== undefined &&
          user.membership.role !== "owner"
        )
          throw forbidden("owners.manage");
        for (const requested of Object.values(input.role_permissions)) {
          if (ungrantable(ownPermissions, requested).length)
            throw forbidden("projects.manage_access");
        }
        next.role_permissions = {
          ...next.role_permissions,
          ...input.role_permissions,
        };
      }
      const targetId = input.member?.user_id ?? input.remove_user_id;
      if (targetId) {
        if (targetId === user._id)
          throw conflict(
            "SELF_ACCESS_CHANGE",
            "You cannot change your own project access entry.",
          );
        const target = await tx.get("users", targetId);
        if (
          !target ||
          target.membership.org_id !== org._id ||
          target.status !== "active"
        )
          throw notFound("Member");
        next.members = next.members.filter((m) => m.user_id !== targetId);
        if (input.member) {
          const previous = project.members.find((m) => m.user_id === targetId);
          const member: ProjectMember = {
            ...input.member,
            added_by: previous?.added_by ?? user._id,
            added_at: previous?.added_at ?? new Date(),
          };
          next.members.push(member);
        }
        // Removing a deny or an admin's entry can grant access too. Check the effective delta.
        const before = projectPermissions(
          target.membership.role,
          project,
          targetId,
        );
        const added = [
          ...projectPermissions(target.membership.role, next, targetId),
        ].filter((p) => !before.has(p));
        if (ungrantable(ownPermissions, added).length)
          throw forbidden("projects.manage_access");
      }
      next.updated_at = new Date();
      tx.set("projects", next);
      // A role-wide change can affect everyone, so every copy for this project is rewritten.
      this.syncAccessCopies(tx, await this.orgUsers(tx, org._id), [next]);
      this.audit(
        tx,
        principal,
        org._id,
        "project.access_changed",
        "project",
        projectId,
        {
          before: {
            role_permissions: project.role_permissions ?? {},
            members: project.members,
          },
          after: {
            role_permissions: next.role_permissions ?? {},
            members: next.members,
          },
        },
        projectId,
      );
      return next;
    });
  }

  async checkMemberCapacity(tx: Tx, org: Organization) {
    const plan = await tx.get("plans", org.plan_id);
    const members = await this.orgUsers(tx, org._id);
    if (!plan || members.length >= plan.limits.members)
      throw conflict(
        "PLAN_LIMIT",
        "The member limit for this plan has been reached.",
      );
  }

  async validInvitation(
    tx: Tx,
    token: DecodedIdToken,
    raw: string,
  ): Promise<Invitation> {
    const invite = (
      await tx.find("invitations", (q) =>
        q.where("token_hash", "==", tokenHash(raw)),
      )
    ).find((invitation) => invitation.status === "pending");
    if (!invite || invite.expires_at <= new Date())
      throw conflict(
        "INVITATION_INVALID",
        "The invitation is invalid or expired.",
      );
    if (!token.email_verified || token.email?.toLowerCase() !== invite.email)
      throw new AppError(
        "VERIFIED_EMAIL_REQUIRED",
        "Sign in with the verified email addressed by this invitation.",
        403,
      );
    return invite;
  }

  consumeInvitation(tx: Tx, invitation: Invitation) {
    tx.update("invitations", invitation._id, {
      status: "accepted",
      updated_at: new Date(),
      pending_key: deleteField(),
    });
  }

  async invite(
    principal: Principal,
    orgId: string,
    email: string,
    role: OrgRole,
  ) {
    const raw = randomBytes(32).toString("base64url");
    const invite = await this.db.transaction(async (tx) => {
      const { user } = await this.context(
        principal,
        orgId,
        role === "owner" ? "owners.manage" : "members.manage",
        tx,
      );
      const org = await this.lockOrganization(tx, orgId);
      await this.checkMemberCapacity(tx, org);
      const sameEmail = await tx.find("users", (q) =>
        q.where("email", "==", email),
      );
      if (sameEmail.some((u) => u.membership.org_id === orgId && live(u)))
        throw conflict(
          "ALREADY_MEMBER",
          "This person already belongs to the organization.",
        );
      const now = new Date(),
        key = pendingKey(orgId, email);
      // One open invite per person: the organization lock above keeps two invites from racing.
      const open = await tx.find("invitations", (q) =>
        q.where("pending_key", "==", key),
      );
      for (const previous of open)
        tx.update("invitations", previous._id, {
          status: "revoked",
          updated_at: now,
          pending_key: deleteField(),
        });
      const invitation: Invitation = {
        _id: id(),
        org_id: orgId,
        email,
        role,
        token_hash: tokenHash(raw),
        pending_key: key,
        invited_by: user._id,
        status: "pending",
        expires_at: new Date(now.getTime() + 86400_000),
        created_at: now,
        updated_at: now,
      };
      tx.create("invitations", invitation);
      this.audit(
        tx,
        principal,
        orgId,
        "member.invited",
        "invitation",
        invitation._id,
        { after: { email, role } },
      );
      return invitation;
    });
    return {
      id: invite._id,
      email,
      role,
      status: invite.status,
      invitation_token: raw,
      invitation_url: `${this.config.FRONTEND_URL}/app?invite=${encodeURIComponent(raw)}`,
      delivery: "manual",
    };
  }

  // What accepting would mean, read before anything changes: the person sees it and chooses.
  async previewInvitation(principal: Principal, raw: string) {
    return this.db.transaction(async (tx) => {
      const { org: current } = await this.context(
        principal,
        undefined,
        undefined,
        tx,
      );
      const invite = await this.validInvitation(tx, principal.token, raw);
      const target = await tx.get("organizations", invite.org_id);
      if (!target || target.status !== "active")
        throw conflict(
          "INVITATION_INVALID",
          "The invitation is invalid or expired.",
        );
      const projects = await this.orgProjects(tx, current._id);
      return {
        organization_name: target.name,
        role: invite.role,
        current_organization_name: current.name,
        projects_left_behind: projects.length,
        already_member: current._id === target._id,
      };
    });
  }

  async acceptInvitation(principal: Principal, raw: string) {
    return this.db.transaction(async (tx) => {
      const { user, org: previous } = await this.context(
        principal,
        undefined,
        undefined,
        tx,
      );
      const invite = await this.validInvitation(tx, principal.token, raw);
      const target = await this.lockOrganization(tx, invite.org_id);
      this.checkProvider(target, principal.token);
      if (previous._id === target._id)
        throw conflict(
          "ALREADY_MEMBER",
          "You already belong to this organization.",
        );
      await this.lockOrganization(tx, previous._id);
      if ((await this.orgUsers(tx, previous._id)).length !== 1)
        throw conflict(
          "ORGANIZATION_NOT_SOLO",
          "Leave the current organization before accepting this invitation.",
        );
      const account = await tx.get("billing_accounts", previous._id);
      if (account?.subscription && account.subscription.status !== "cancelled")
        throw conflict(
          "CANCEL_SUBSCRIPTION_FIRST",
          "Cancel the old organization subscription before moving.",
        );
      await this.checkMemberCapacity(tx, target);
      // The joiner's projects stay behind in the closed organization (Schema_liftofsol README 4.3).
      const leftBehind = await tx.find("projects", (q) =>
        q.where("org_id", "==", previous._id),
      );
      const now = new Date();
      tx.update("organizations", previous._id, {
        status: "deleted",
        deleted_at: now,
        updated_at: now,
      });
      this.audit(
        tx,
        principal,
        previous._id,
        "organization.closed",
        "organization",
        previous._id,
      );
      const joined: User = {
        ...user,
        membership: {
          org_id: target._id,
          role: invite.role,
          created_at: now,
          updated_at: now,
        },
        updated_at: now,
      };
      tx.update("users", user._id, {
        membership: joined.membership,
        updated_at: now,
      });
      this.consumeInvitation(tx, invite);
      this.audit(
        tx,
        principal,
        target._id,
        "invitation.accepted",
        "invitation",
        invite._id,
      );
      // Only the joiner's access changes: the organization's projects they can use, and none left behind.
      this.syncAccessCopies(
        tx,
        [joined],
        [...(await this.orgProjects(tx, target._id)), ...leftBehind],
      );
      return { organization_id: target._id };
    });
  }
}
