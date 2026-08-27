import type { FastifyInstance } from "fastify";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { z } from "zod";
import { audit } from "../../common/audit.js";
import { authenticate, requireOrganization } from "../../common/context.js";
import { conflict, forbidden, notFound } from "../../common/errors.js";
import { parse } from "../../common/schemas.js";
import { document, now } from "../../firebase/store.js";
import { ALL_PERMISSIONS, type Permission } from "../../permissions/catalog.js";
import { opaqueToken, organizationJoinCode } from "../../common/security.js";
import {
  membersWithPermission,
  notifyQuietly,
  resolveNotifications,
} from "../notifications/service.js";

const role = z.enum(["PRIME", "OWNER", "ADMIN", "AGENT", "VIEWER", "CUSTOM"]);
const delegatedRole = z.enum(["OWNER", "ADMIN", "AGENT", "VIEWER", "CUSTOM"]);
const slugify = (value: string): string =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80) || "organization";

export async function organizationRoutes(app: FastifyInstance): Promise<void> {
  app.post("/", { preHandler: authenticate }, async (request, reply) => {
    const body = parse(
      z.object({
        name: z.string().trim().min(2).max(200),
        slug: z.string().min(2).max(100).optional(),
      }),
      request.body,
    );
    const organizationRef = app.store.db.collection("organizations").doc();
    const uid = request.auth!.user.uid;
    await app.store.db.runTransaction(async (transaction) => {
      transaction.create(organizationRef, {
        name: body.name,
        slug: `${slugify(body.slug ?? body.name)}-${organizationRef.id.slice(0, 6)}`,
        status: "ACTIVE",
        primeUserId: uid,
        joinCode: organizationJoinCode(),
        settings: {},
        createdAt: now(),
        updatedAt: now(),
      });
      transaction.create(app.store.member(organizationRef.id, uid), {
        uid,
        email: request.auth!.user.email,
        displayName: request.auth!.user.display_name,
        role: "PRIME",
        permissions: ["*"],
        deniedPermissions: [],
        status: "ACTIVE",
        joinedAt: now(),
        updatedAt: now(),
      });
      transaction.set(
        app.store.user(uid),
        {
          email: request.auth!.user.email,
          displayName: request.auth!.user.display_name,
          photoURL: request.auth!.user.photo_url,
          organizationIds: FieldValue.arrayUnion(organizationRef.id),
          updatedAt: now(),
        },
        { merge: true },
      );
    });
    request.organization = {
      id: organizationRef.id,
      name: body.name,
      slug: body.slug ?? slugify(body.name),
      primeUserId: uid,
      role: "PRIME",
      permissions: new Set(ALL_PERMISSIONS),
    };
    await audit(
      request,
      "organization.created",
      "organization",
      organizationRef.id,
      null,
      body,
    );
    return reply.status(201).send({
      id: organizationRef.id,
      name: body.name,
      slug: body.slug ?? slugify(body.name),
      status: "ACTIVE",
      settings_json: {},
      prime_user_id: uid,
      join_code: (await organizationRef.get()).get("joinCode"),
    });
  });

  app.post("/join-requests", { preHandler: authenticate }, async (request, reply) => {
    const body = parse(
      z.object({ join_code: z.string().trim().min(6).max(20) }),
      request.body,
    );
    const organizations = await app.store.db
      .collection("organizations")
      .where("joinCode", "==", body.join_code.toUpperCase())
      .limit(1)
      .get();
    const organizationSnapshot = organizations.docs[0];
    const organization = organizationSnapshot
      ? document<{ name: string; status: string; primeUserId: string }>(
          organizationSnapshot,
        )
      : null;
    if (!organization || organization.status !== "ACTIVE")
      throw notFound("organization");
    const uid = request.auth!.user.uid;
    if ((await app.store.member(organization.id, uid).get()).exists)
      throw conflict("ALREADY_MEMBER", "You already belong to this organization.");
    const ref = app.store.db
      .collection("organizationJoinRequests")
      .doc(`${organization.id}_${uid}`);
    const existing = document<{ status: string }>(await ref.get());
    if (existing?.status === "PENDING")
      throw conflict("JOIN_REQUEST_PENDING", "Your join request is already pending.");
    await ref.set({
      organizationId: organization.id,
      userId: uid,
      email: request.auth!.user.email,
      displayName: request.auth!.user.display_name,
      status: "PENDING",
      requestedAt: now(),
      updatedAt: now(),
    });
    const applicant = request.auth!.user.display_name || request.auth!.user.email;
    const managers = await membersWithPermission(
      app,
      organization.id,
      "organization.members.manage",
      organization.primeUserId,
    );
    await notifyQuietly(
      app,
      managers.map((userId) => ({
        userId,
        type: "join_request.created" as const,
        title: "New join request",
        body: `${applicant} used the join code to request access to ${organization.name}.`,
        organizationId: organization.id,
        organizationName: organization.name,
        section: "team",
        resourceType: "join_request",
        resourceId: ref.id,
        actorUserId: uid,
      })),
    );
    return reply.status(201).send({
      id: ref.id,
      organization_id: organization.id,
      organization_name: organization.name,
      status: "PENDING",
    });
  });

  app.get(
    "/:businessId",
    { preHandler: [authenticate, requireOrganization("organization.view")] },
    async (request) => {
      const organization = document<Record<string, unknown>>(
        await app.store.organization(request.organization!.id).get(),
      );
      if (!organization) throw notFound("organization");
      let joinCode = organization.joinCode;
      if (!joinCode) {
        joinCode = organizationJoinCode();
        await app.store.organization(request.organization!.id).update({
          joinCode,
          updatedAt: now(),
        });
      }
      return {
        id: organization.id,
        name: organization.name,
        slug: organization.slug,
        status: organization.status,
        settings_json: organization.settings ?? {},
        prime_user_id: organization.primeUserId,
        join_code: request.organization!.permissions.has(
          "organization.members.manage",
        )
          ? joinCode
          : null,
        created_at: organization.createdAt,
        updated_at: organization.updatedAt,
      };
    },
  );

  app.patch(
    "/:businessId",
    { preHandler: [authenticate, requireOrganization("organization.update")] },
    async (request) => {
      const body = parse(
        z
          .object({
            name: z.string().trim().min(2).max(200).optional(),
            settings_json: z.record(z.string(), z.unknown()).optional(),
          })
          .refine((value) => Object.keys(value).length > 0),
        request.body,
      );
      const ref = app.store.organization(request.organization!.id);
      const before = document<Record<string, unknown>>(await ref.get());
      if (!before) throw notFound("organization");
      await ref.update({
        ...(body.name ? { name: body.name } : {}),
        ...(body.settings_json ? { settings: body.settings_json } : {}),
        updatedAt: now(),
      });
      await audit(
        request,
        "organization.updated",
        "organization",
        ref.id,
        before,
        body,
      );
      return {
        id: ref.id,
        name: body.name ?? before.name,
        slug: before.slug,
        status: before.status,
        settings_json: body.settings_json ?? before.settings ?? {},
        prime_user_id: before.primeUserId,
      };
    },
  );

  app.get(
    "/:businessId/members",
    {
      preHandler: [
        authenticate,
        requireOrganization("organization.members.view"),
      ],
    },
    async (request) => {
      const members = await app.store.list<Record<string, unknown>>(
        app.store
          .collection(request.organization!.id, "members")
          .orderBy("joinedAt", "asc"),
      );
      return members.map((member) => ({
        user_id: member.id,
        uid: member.id,
        email: member.email,
        display_name: member.displayName ?? null,
        role:
          member.id === request.organization!.primeUserId
            ? "PRIME"
            : member.role,
        status: member.status,
        permissions:
          member.id === request.organization!.primeUserId
            ? ["*"]
            : (member.permissions ?? []),
        denied_permissions: member.deniedPermissions ?? [],
      }));
    },
  );

  app.patch(
    "/:businessId/members/:userId",
    {
      preHandler: [
        authenticate,
        requireOrganization("organization.members.manage"),
      ],
    },
    async (request) => {
      const { userId } = request.params as { userId: string };
      const body = parse(
        z.object({
          role: role.optional(),
          status: z.enum(["ACTIVE", "DISABLED"]).optional(),
          permissions: z.array(z.enum(ALL_PERMISSIONS)).optional(),
          denied_permissions: z.array(z.enum(ALL_PERMISSIONS)).optional(),
        }),
        request.body,
      );
      if (
        userId === request.organization!.primeUserId &&
        ((body.role && body.role !== "PRIME") ||
          body.status === "DISABLED" ||
          body.denied_permissions?.length)
      )
        throw conflict(
          "PRIME_USER_IMMUTABLE",
          "Transfer ownership before restricting the Prime user.",
        );
      if (body.role === "PRIME")
        throw conflict(
          "PRIME_ROLE_RESERVED",
          "Use ownership transfer to change the Prime user.",
        );
      const ref = app.store.member(request.organization!.id, userId);
      const before = document<Record<string, unknown>>(await ref.get());
      if (!before) throw notFound("member");
      const actorIsPrime = request.auth!.user.uid === request.organization!.primeUserId;
      if (
        !actorIsPrime &&
        (body.role === "OWNER" || before.role === "OWNER")
      )
        throw forbidden("organization.prime");
      await ref.update({
        ...(body.role ? { role: body.role } : {}),
        ...(body.status ? { status: body.status } : {}),
        ...(body.permissions ? { permissions: body.permissions } : {}),
        ...(body.denied_permissions
          ? { deniedPermissions: body.denied_permissions }
          : {}),
        updatedAt: now(),
      });
      await audit(request, "member.updated", "user", userId, before, body);
      return {
        user_id: userId,
        email: before.email,
        display_name: before.displayName ?? null,
        role: body.role ?? before.role,
        status: body.status ?? before.status,
        permissions: body.permissions ?? before.permissions ?? [],
        denied_permissions:
          body.denied_permissions ?? before.deniedPermissions ?? [],
      };
    },
  );

  app.put(
    "/:businessId/members/:userId/permissions",
    {
      preHandler: [
        authenticate,
        requireOrganization("organization.permissions.manage"),
      ],
    },
    async (request) => {
      const { userId } = request.params as { userId: string };
      if (userId === request.organization!.primeUserId)
        throw conflict(
          "PRIME_PERMISSIONS_IMMUTABLE",
          "Prime permissions cannot be restricted.",
        );
      const body = parse(
        z.object({
          permissions: z.array(z.enum(ALL_PERMISSIONS)).default([]),
          denied_permissions: z.array(z.enum(ALL_PERMISSIONS)).default([]),
          overrides: z
            .array(
              z.object({
                permission: z.enum(ALL_PERMISSIONS),
                effect: z.enum(["GRANT", "DENY"]),
              }),
            )
            .optional(),
        }),
        request.body,
      );
      const permissions = body.overrides
        ? body.overrides
            .filter((item) => item.effect === "GRANT")
            .map((item) => item.permission)
        : body.permissions;
      const denied = body.overrides
        ? body.overrides
            .filter((item) => item.effect === "DENY")
            .map((item) => item.permission)
        : body.denied_permissions;
      const ref = app.store.member(request.organization!.id, userId);
      const member = document<{ role: string }>(await ref.get());
      if (!member) throw notFound("member");
      if (
        member.role === "OWNER" &&
        request.auth!.user.uid !== request.organization!.primeUserId
      )
        throw forbidden("organization.prime");
      await ref.update({
        permissions,
        deniedPermissions: denied,
        updatedAt: now(),
      });
      await audit(request, "member.permissions_updated", "user", userId, null, {
        permissions,
        denied_permissions: denied,
      });
      return { permissions, denied_permissions: denied };
    },
  );

  app.delete(
    "/:businessId/members/:userId",
    {
      preHandler: [
        authenticate,
        requireOrganization("organization.members.manage"),
      ],
    },
    async (request, reply) => {
      const { userId } = request.params as { userId: string };
      if (userId === request.organization!.primeUserId)
        throw conflict(
          "PRIME_USER_IMMUTABLE",
          "Transfer ownership before removing the Prime user.",
        );
      const ref = app.store.member(request.organization!.id, userId);
      const member = document<{ role: string }>(await ref.get());
      if (!member) throw notFound("member");
      if (
        member.role === "OWNER" &&
        request.auth!.user.uid !== request.organization!.primeUserId
      )
        throw forbidden("organization.prime");
      await app.store.db.runTransaction(async (transaction) => {
        transaction.delete(ref);
        transaction.set(
          app.store.user(userId),
          {
            organizationIds: FieldValue.arrayRemove(request.organization!.id),
            updatedAt: now(),
          },
          { merge: true },
        );
      });
      await audit(request, "member.removed", "user", userId);
      return reply.status(204).send();
    },
  );

  app.get(
    "/:businessId/join-requests",
    {
      preHandler: [
        authenticate,
        requireOrganization("organization.members.manage"),
      ],
    },
    async (request) => {
      const snapshot = await app.store.db
        .collection("organizationJoinRequests")
        .where("organizationId", "==", request.organization!.id)
        .limit(100)
        .get();
      return snapshot.docs
        .map((item) => {
          const value = document<Record<string, unknown>>(item)!;
          return {
            id: item.id,
            user_id: value.userId,
            email: value.email,
            display_name: value.displayName ?? null,
            status: value.status,
            requested_at: value.requestedAt,
            reviewed_at: value.reviewedAt ?? null,
          };
        })
        .sort((left, right) =>
          String(right.requested_at).localeCompare(String(left.requested_at)),
        );
    },
  );

  app.patch(
    "/:businessId/join-requests/:requestId",
    {
      preHandler: [
        authenticate,
        requireOrganization("organization.members.manage"),
      ],
    },
    async (request) => {
      const { requestId } = request.params as { requestId: string };
      const body = parse(
        z.object({
          decision: z.enum(["APPROVED", "REJECTED"]),
          role: delegatedRole.default("AGENT"),
          permissions: z.array(z.enum(ALL_PERMISSIONS)).default([]),
        }),
        request.body,
      );
      if (
        body.role === "OWNER" &&
        request.auth!.user.uid !== request.organization!.primeUserId
      )
        throw forbidden("organization.prime");
      const ref = app.store.db
        .collection("organizationJoinRequests")
        .doc(requestId);
      let applicantUserId: string | null = null;
      await app.store.db.runTransaction(async (transaction) => {
        const snapshot = await transaction.get(ref);
        const value = snapshot.data() as
          | {
              organizationId: string;
              userId: string;
              email: string;
              displayName?: string | null;
              status: string;
            }
          | undefined;
        if (
          !value ||
          value.organizationId !== request.organization!.id ||
          value.status !== "PENDING"
        )
          throw notFound("pending_join_request");
        applicantUserId = value.userId;
        if (body.decision === "APPROVED") {
          transaction.set(app.store.member(request.organization!.id, value.userId), {
            uid: value.userId,
            email: value.email,
            displayName: value.displayName ?? null,
            role: body.role,
            permissions: body.permissions,
            deniedPermissions: [],
            status: "ACTIVE",
            certifiedBy: request.auth!.user.uid,
            joinedAt: now(),
            updatedAt: now(),
          });
          transaction.set(
            app.store.user(value.userId),
            {
              organizationIds: FieldValue.arrayUnion(request.organization!.id),
              updatedAt: now(),
            },
            { merge: true },
          );
        }
        transaction.update(ref, {
          status: body.decision,
          assignedRole: body.decision === "APPROVED" ? body.role : null,
          reviewedBy: request.auth!.user.uid,
          reviewedAt: now(),
          updatedAt: now(),
        });
      });
      await audit(
        request,
        `join_request.${body.decision.toLowerCase()}`,
        "join_request",
        requestId,
        null,
        { role: body.role },
      );
      const organizationName = request.organization!.name;
      // The decision is made: clear the "new join request" entries the other
      // managers are still carrying before adding the applicant's result.
      await resolveNotifications(app, "join_request", requestId).catch(
        (error: unknown) =>
          app.log.warn({ err: error }, "Failed to resolve notifications"),
      );
      if (applicantUserId)
        await notifyQuietly(app, [
          body.decision === "APPROVED"
            ? {
                userId: applicantUserId,
                type: "join_request.approved" as const,
                title: `Approved for ${organizationName}`,
                body: `Your request to join ${organizationName} was approved. Your role is ${body.role}.`,
                organizationId: request.organization!.id,
                organizationName,
                section: "overview",
                resourceType: "join_request",
                resourceId: requestId,
                actorUserId: request.auth!.user.uid,
              }
            : {
                userId: applicantUserId,
                type: "join_request.rejected" as const,
                title: `Request to join ${organizationName} declined`,
                body: `A manager declined your request to join ${organizationName}.`,
                organizationId: request.organization!.id,
                organizationName,
                resourceType: "join_request",
                resourceId: requestId,
                actorUserId: request.auth!.user.uid,
              },
        ]);
      return { id: requestId, status: body.decision, role: body.role };
    },
  );

  app.get(
    "/:businessId/invitations",
    {
      preHandler: [
        authenticate,
        requireOrganization("organization.members.manage"),
      ],
    },
    async (request) => {
      const invitations = await app.store.db
        .collection("invitations")
        .where("organizationId", "==", request.organization!.id)
        .orderBy("createdAt", "desc")
        .limit(100)
        .get();
      return invitations.docs.map((item) => {
        const value = document<Record<string, unknown>>(item)!;
        return {
          id: item.id,
          business_id: request.organization!.id,
          email: value.email,
          role: value.role,
          status: value.status,
          permissions: value.permissions ?? [],
          expires_at: value.expiresAt,
          created_at: value.createdAt,
        };
      });
    },
  );

  app.post(
    "/:businessId/invitations",
    {
      preHandler: [
        authenticate,
        requireOrganization("organization.members.manage"),
      ],
    },
    async (request, reply) => {
      const body = parse(
        z.object({
          email: z.email().transform((value) => value.toLowerCase()),
          role: role.default("AGENT"),
          permissions: z.array(z.enum(ALL_PERMISSIONS)).default([]),
        }),
        request.body,
      );
      if (body.role === "PRIME") throw forbidden("organization.prime");
      if (
        body.role === "OWNER" &&
        request.auth!.user.uid !== request.organization!.primeUserId
      )
        throw forbidden("organization.prime");
      const token = opaqueToken();
      await app.store.db
        .collection("invitations")
        .doc(token)
        .create({
          organizationId: request.organization!.id,
          email: body.email,
          role: body.role,
          permissions: body.permissions,
          status: "PENDING",
          invitedBy: request.auth!.user.uid,
          expiresAt: Timestamp.fromMillis(Date.now() + 7 * 86_400_000),
          createdAt: now(),
          updatedAt: now(),
        });
      await audit(request, "member.invited", "invitation", token, null, {
        email: body.email,
        role: body.role,
      });
      return reply.status(201).send({
        id: token,
        business_id: request.organization!.id,
        email: body.email,
        role: body.role,
        permissions: body.permissions,
        status: "PENDING",
        development_token: app.config.APP_ENV === "production" ? null : token,
      });
    },
  );
}
