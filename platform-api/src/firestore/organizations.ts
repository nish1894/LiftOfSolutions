import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { parse } from "../common/schemas.js";
import { conflict, forbidden, notFound } from "../common/errors.js";
import { deleteField } from "./database.js";
import { type Platform } from "./platform.js";
import {
  authentication,
  defined,
  dto,
  legacyRole,
  p,
  roleInput,
  uuidParam,
  type TokenVerifier,
} from "./http.js";
import {
  ALL_PROJECT_PERMISSIONS,
  projectPermissions,
} from "../domain/schema/project-schema/projects.types.js";
import { canOrg } from "../domain/schema/organization-schema/organizations.types.js";
import type { User } from "../domain/schema/user-schema/users.types.js";

// A person moved into their own new organization, as an owner (leaving, or the old one closing).
const ownerOf = (user: User, orgId: string, now: Date): User => ({
  ...user,
  membership: {
    org_id: orgId,
    role: "owner",
    created_at: now,
    updated_at: now,
  },
  updated_at: now,
});

export async function organizationRoutes(
  app: FastifyInstance,
  platform: Platform,
  verify: TokenVerifier,
) {
  const { authenticated } = authentication(platform, verify);
  for (const root of ["/organizations", "/businesses"]) {
    app.get(root, { preHandler: authenticated }, async (request) => {
      const { org } = await platform.context(p(request));
      return [dto(org)];
    });
    app.post(root, { preHandler: authenticated }, async () => {
      throw conflict(
        "ONE_ORGANIZATION_PER_USER",
        "Your account already has an organization. Rename it or accept an invitation.",
      );
    });
    app.get(
      `${root}/:orgId`,
      { preHandler: authenticated },
      async (request) => {
        const { org } = await platform.context(
          p(request),
          uuidParam(request, "orgId"),
        );
        return { ...dto(org), settings_json: org.settings };
      },
    );
    app.patch(
      `${root}/:orgId`,
      { preHandler: authenticated },
      async (request) => {
        const input = parse(
          z
            .object({
              name: z.string().trim().min(2).max(200).optional(),
              slug: z
                .string()
                .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
                .min(2)
                .max(80)
                .optional(),
              logo_url: z.url().optional(),
              settings: z
                .object({
                  default_role: z.enum(["admin", "member"]).optional(),
                  allowed_providers: z
                    .array(z.enum(["google", "email", "github"]))
                    .min(1)
                    .optional(),
                })
                .strict()
                .optional(),
            })
            .strict(),
          request.body,
        );
        return platform.db.transaction(async (tx) => {
          const { user, org } = await platform.context(
            p(request),
            uuidParam(request, "orgId"),
            "org.edit",
            tx,
          );
          await platform.lockOrganization(tx, org._id);
          if (input.slug !== undefined && user.membership.role !== "owner")
            throw forbidden("owners.manage");
          const next = {
            ...org,
            ...defined(input),
            settings: { ...org.settings, ...defined(input.settings ?? {}) },
            updated_at: new Date(),
          };
          platform.checkProvider(next, p(request).token); // Don't lock the editor out of the organization.
          if (next.slug !== org.slug) {
            tx.release("organizations.slug", org.slug);
            tx.claim("organizations.slug", next.slug, org._id);
          }
          tx.set("organizations", next);
          platform.audit(
            tx,
            p(request),
            org._id,
            "organization.updated",
            "organization",
            org._id,
            {
              before: Object.fromEntries(
                Object.keys(input).map((key) => [
                  key,
                  org[key as keyof typeof org],
                ]),
              ),
              after: input,
            },
          );
          return dto(next);
        });
      },
    );
    app.get(
      `${root}/:orgId/members`,
      { preHandler: authenticated },
      async (request) => {
        const { org } = await platform.context(
          p(request),
          uuidParam(request, "orgId"),
        );
        const users = await platform.orgUsers(platform.db, org._id);
        return users.slice(0, 200).map((user) => ({
          user_id: user._id,
          email: user.email ?? "",
          display_name: user.display_name,
          role: legacyRole(user.membership.role),
          organization_role: user.membership.role,
          status: user.status.toUpperCase(),
          permissions: [],
          denied_permissions: [],
        }));
      },
    );
    app.patch(
      `${root}/:orgId/members/:userId`,
      { preHandler: authenticated },
      async (request) => {
        const input = parse(
          z
            .object({ role: roleInput, status: z.literal("ACTIVE").optional() })
            .strict(),
          request.body,
        );
        return platform.db.transaction(async (tx) => {
          const { user, org } = await platform.context(
            p(request),
            uuidParam(request, "orgId"),
            "members.manage",
            tx,
          );
          await platform.lockOrganization(tx, org._id);
          const people = await platform.orgUsers(tx, org._id);
          const target = people.find(
            (person) => person._id === uuidParam(request, "userId"),
          );
          if (!target) throw notFound("Member");
          if (
            (target.membership.role === "owner" || input.role === "owner") &&
            !canOrg(user.membership.role, "owners.manage")
          )
            throw forbidden("owners.manage");
          const owners = people.filter(
            (person) => person.membership.role === "owner",
          );
          if (
            target.membership.role === "owner" &&
            input.role !== "owner" &&
            owners.length <= 1
          )
            throw conflict(
              "LAST_OWNER",
              "The organization must retain an owner.",
            );
          const now = new Date();
          tx.update("users", target._id, {
            "membership.role": input.role,
            "membership.updated_at": now,
            updated_at: now,
          });
          // Admins see every project and members only theirs, so the RAG's copies change with the role.
          const changed: User = {
            ...target,
            membership: { ...target.membership, role: input.role },
          };
          platform.syncAccessCopies(
            tx,
            [changed],
            await platform.orgProjects(tx, org._id),
          );
          platform.audit(
            tx,
            p(request),
            org._id,
            "member.role_changed",
            "user",
            target._id,
            {
              before: { role: target.membership.role },
              after: { role: input.role },
            },
          );
          return { user_id: target._id, role: legacyRole(input.role) };
        });
      },
    );
    app.delete(
      `${root}/:orgId/members/:userId`,
      { preHandler: authenticated },
      async (request) => {
        return platform.db.transaction(async (tx) => {
          const targetId = uuidParam(request, "userId");
          const { user, org } = await platform.context(
            p(request),
            uuidParam(request, "orgId"),
            targetId === p(request).userId ? undefined : "members.manage",
            tx,
          );
          await platform.lockOrganization(tx, org._id);
          const people = await platform.orgUsers(tx, org._id);
          const target = people.find((person) => person._id === targetId);
          if (!target) throw notFound("Member");
          if (target.membership.role === "owner") {
            if (!canOrg(user.membership.role, "owners.manage"))
              throw forbidden("owners.manage");
            const owners = people.filter(
              (person) => person.membership.role === "owner",
            );
            if (owners.length <= 1)
              throw conflict(
                "LAST_OWNER",
                "Transfer ownership or close the organization before leaving.",
              );
          }
          const fresh = await platform.createOrganization(
            tx,
            targetId,
            `${target.display_name}'s workspace`,
          );
          const now = new Date();
          const leaver = ownerOf(target, fresh._id, now);
          tx.update("users", targetId, {
            membership: leaver.membership,
            updated_at: now,
          });
          const projects = await tx.find("projects", (q) =>
            q.where("org_id", "==", org._id),
          );
          for (const project of projects)
            if (project.members.some((m) => m.user_id === targetId))
              tx.update("projects", project._id, {
                members: project.members.filter((m) => m.user_id !== targetId),
                updated_at: now,
              });
          platform.syncAccessCopies(tx, [leaver], projects);
          platform.audit(
            tx,
            p(request),
            org._id,
            "member.removed",
            "user",
            targetId,
          );
          return { removed: true };
        });
      },
    );
    app.get(
      `${root}/:orgId/invitations`,
      { preHandler: authenticated },
      async (request) => {
        const { org } = await platform.context(
          p(request),
          uuidParam(request, "orgId"),
          "members.manage",
        );
        // Few per organization: expired invites are deleted a week after they expire.
        const invitations = (
          await platform.db.find("invitations", (q) =>
            q.where("org_id", "==", org._id),
          )
        )
          .sort((a, b) => b.created_at.getTime() - a.created_at.getTime())
          .slice(0, 200);
        return invitations.map(
          ({ token_hash: _hash, pending_key: _key, ...invitation }) => ({
            ...dto(invitation),
            role: legacyRole(invitation.role),
            status:
              invitation.status === "pending" &&
              invitation.expires_at <= new Date()
                ? "EXPIRED"
                : invitation.status.toUpperCase(),
          }),
        );
      },
    );
    app.post(
      `${root}/:orgId/invitations`,
      { preHandler: authenticated },
      async (request) => {
        const input = parse(
          z
            .object({
              email: z.email().transform((value) => value.toLowerCase()),
              role: roleInput,
            })
            .strict(),
          request.body,
        );
        return platform.invite(
          p(request),
          uuidParam(request, "orgId"),
          input.email,
          input.role,
        );
      },
    );
    app.delete(
      `${root}/:orgId/invitations/:invitationId`,
      { preHandler: authenticated },
      async (request) => {
        return platform.db.transaction(async (tx) => {
          const { user, org } = await platform.context(
            p(request),
            uuidParam(request, "orgId"),
            "members.manage",
            tx,
          );
          await platform.lockOrganization(tx, org._id);
          const invitation = await tx.get(
            "invitations",
            uuidParam(request, "invitationId"),
          );
          if (
            !invitation ||
            invitation.org_id !== org._id ||
            invitation.status !== "pending"
          )
            throw notFound("Invitation");
          if (
            invitation.role === "owner" &&
            !canOrg(user.membership.role, "owners.manage")
          )
            throw forbidden("owners.manage");
          tx.update("invitations", invitation._id, {
            status: "revoked",
            updated_at: new Date(),
            pending_key: deleteField(),
          });
          platform.audit(
            tx,
            p(request),
            org._id,
            "invitation.revoked",
            "invitation",
            invitation._id,
          );
          return { revoked: true };
        });
      },
    );
    app.get(
      `${root}/:orgId/projects`,
      { preHandler: authenticated },
      async (request) => {
        const { user, org } = await platform.context(
          p(request),
          uuidParam(request, "orgId"),
        );
        const projects = await platform.orgProjects(platform.db, org._id);
        return projects
          .filter(
            (project) =>
              projectPermissions(user.membership.role, project, user._id).size,
          )
          .map((project) => ({
            ...dto(project),
            effective_permissions: [
              ...projectPermissions(user.membership.role, project, user._id),
            ],
          }));
      },
    );
    app.post(
      `${root}/:orgId/projects`,
      { preHandler: authenticated },
      async (request, reply) => {
        const input = parse(
          z
            .object({
              name: z.string().trim().min(2).max(200),
              description: z.string().max(2000).optional(),
            })
            .strict(),
          request.body,
        );
        return reply
          .code(201)
          .send(
            dto(
              await platform.createProject(
                p(request),
                uuidParam(request, "orgId"),
                input,
              ),
            ),
          );
      },
    );
    app.get(
      `${root}/:orgId/audit`,
      { preHandler: authenticated },
      async (request) => {
        const { org } = await platform.context(
          p(request),
          uuidParam(request, "orgId"),
          "audit.view",
        );
        // Needs the composite index audit_events (org_id, created_at desc) in firestore.indexes.json.
        const events = await platform.db.find("audit_events", (q) =>
          q
            .where("org_id", "==", org._id)
            .orderBy("created_at", "desc")
            .limit(100),
        );
        return events.map(dto);
      },
    );
    app.get(
      `${root}/:orgId/join-requests`,
      { preHandler: authenticated },
      async (request) => {
        await platform.context(
          p(request),
          uuidParam(request, "orgId"),
          "members.manage",
        );
        return [];
      },
    );
    app.post(
      `${root}/:orgId/close`,
      { preHandler: authenticated },
      async (request) => {
        parse(z.object({ confirm: z.literal(true) }).strict(), request.body);
        return platform.db.transaction(async (tx) => {
          const { org } = await platform.context(
            p(request),
            uuidParam(request, "orgId"),
            "org.close",
            tx,
          );
          await platform.lockOrganization(tx, org._id);
          const billing = await tx.get("billing_accounts", org._id);
          if (
            billing?.subscription &&
            billing.subscription.status !== "cancelled"
          )
            throw conflict(
              "CANCEL_SUBSCRIPTION_FIRST",
              "Cancel the paid subscription before closing.",
            );
          const now = new Date();
          const leavers: User[] = [];
          for (const member of await platform.orgUsers(tx, org._id)) {
            const fresh = await platform.createOrganization(
              tx,
              member._id,
              `${member.display_name}'s workspace`,
            );
            const leaver = ownerOf(member, fresh._id, now);
            tx.update("users", member._id, {
              membership: leaver.membership,
              updated_at: now,
            });
            leavers.push(leaver);
          }
          const projects = await tx.find("projects", (q) =>
            q.where("org_id", "==", org._id),
          );
          for (const project of projects)
            tx.update("projects", project._id, {
              members: [],
              updated_at: now,
            });
          platform.syncAccessCopies(tx, leavers, projects);
          const invitations = await tx.find("invitations", (q) =>
            q.where("org_id", "==", org._id),
          );
          for (const invitation of invitations)
            if (invitation.status === "pending")
              tx.update("invitations", invitation._id, {
                status: "revoked",
                updated_at: now,
                pending_key: deleteField(),
              });
          tx.update("organizations", org._id, {
            status: "deleted",
            deleted_at: now,
            updated_at: now,
          });
          platform.audit(
            tx,
            p(request),
            org._id,
            "organization.closed",
            "organization",
            org._id,
          );
          return { closed: true };
        });
      },
    );
  }
  app.get(
    "/projects/:projectId",
    { preHandler: authenticated },
    async (request) => {
      const { project, permissions } = await platform.project(
        p(request),
        uuidParam(request, "projectId"),
      );
      return { ...dto(project), effective_permissions: [...permissions] };
    },
  );
  app.put(
    "/projects/:projectId/access",
    { preHandler: authenticated },
    async (request) => {
      const permissions = z.array(z.enum(ALL_PROJECT_PERMISSIONS)).max(23);
      const input = parse(
        z
          .object({
            role_permissions: z
              .object({
                admin: permissions.optional(),
                member: permissions.optional(),
              })
              .strict()
              .optional(),
            member: z
              .object({
                user_id: z.uuid(),
                grants: permissions,
                denies: permissions,
              })
              .strict()
              .optional(),
            remove_user_id: z.uuid().optional(),
          })
          .strict()
          .refine(
            (value) => !(value.member && value.remove_user_id),
            "Choose add/update or remove, not both.",
          ),
        request.body,
      );
      return dto(
        await platform.changeProjectAccess(
          p(request),
          uuidParam(request, "projectId"),
          {
            ...input,
            ...(input.role_permissions
              ? { role_permissions: defined(input.role_permissions) }
              : { role_permissions: undefined }),
          },
        ),
      );
    },
  );
  app.patch(
    "/projects/:projectId",
    { preHandler: authenticated },
    async (request) => {
      const input = parse(
        z
          .object({
            name: z.string().trim().min(2).max(200).optional(),
            description: z.string().max(2000).optional(),
            status: z.enum(["active", "archived"]).optional(),
          })
          .strict(),
        request.body,
      );
      return platform.db.transaction(async (tx) => {
        const { org } = await platform.context(
          p(request),
          undefined,
          "projects.manage_access",
          tx,
        );
        await platform.lockOrganization(tx, org._id);
        const project = await tx.get(
          "projects",
          uuidParam(request, "projectId"),
        );
        if (
          !project ||
          project.org_id !== org._id ||
          project.status === "deleted"
        )
          throw notFound("Project");
        const changes = { ...defined(input), updated_at: new Date() };
        tx.update("projects", project._id, changes);
        platform.audit(
          tx,
          p(request),
          org._id,
          "project.updated",
          "project",
          project._id,
          { after: input },
          project._id,
        );
        return dto({ ...project, ...changes });
      });
    },
  );
}
