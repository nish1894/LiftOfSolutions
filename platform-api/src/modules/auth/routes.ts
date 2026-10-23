import type { FastifyInstance, FastifyRequest } from "fastify";
import { FieldValue } from "firebase-admin/firestore";
import { z } from "zod";
import { authenticate } from "../../common/context.js";
import { AppError, unauthorized } from "../../common/errors.js";
import { parse } from "../../common/schemas.js";
import { organizationJoinCode } from "../../common/security.js";
import { document, now } from "../../firebase/store.js";
import { ALL_PERMISSIONS, permissionsFor } from "../../permissions/catalog.js";

const slugify = (value: string): string =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80) || "organization";

async function authResponse(app: FastifyInstance, request: FastifyRequest) {
  const uid = request.auth!.user.uid;
  const userSnapshot = await app.store.user(uid).get();
  const profile = document<{
    email: string;
    displayName: string | null;
    photoURL: string | null;
    phone?: string | null;
    jobTitle?: string | null;
    bio?: string | null;
    timezone?: string;
    locale?: string;
    preferences?: { emailNotifications?: boolean; productUpdates?: boolean };
    organizationIds?: string[];
    defaultOrganizationId?: string | null;
    createdAt: unknown;
  }>(userSnapshot);
  if (!profile)
    throw new AppError(
      "ONBOARDING_REQUIRED",
      "Complete account onboarding first.",
      409,
    );
  const organizations = await Promise.all(
    (profile.organizationIds ?? []).map(async (organizationId) => {
      const [organizationSnapshot, memberSnapshot] = await Promise.all([
        app.store.organization(organizationId).get(),
        app.store.member(organizationId, uid).get(),
      ]);
      const organization = document<{
        name: string;
        slug: string;
        status: string;
        primeUserId: string;
      }>(organizationSnapshot);
      const member = document<{
        role: string;
        status: string;
        permissions?: string[];
        deniedPermissions?: string[];
      }>(memberSnapshot);
      if (
        !organization ||
        !member ||
        member.status !== "ACTIVE" ||
        organization.status !== "ACTIVE"
      )
        return null;
      const effectivePermissions = permissionsFor(
        organization.primeUserId === uid ? "PRIME" : member.role,
      );
      for (const permission of member.permissions ?? [])
        effectivePermissions.add(permission as (typeof ALL_PERMISSIONS)[number]);
      for (const permission of member.deniedPermissions ?? [])
        effectivePermissions.delete(permission as (typeof ALL_PERMISSIONS)[number]);
      return {
        business_id: organizationId,
        organization_id: organizationId,
        business_name: organization.name,
        organization_name: organization.name,
        business_slug: organization.slug,
        role: organization.primeUserId === uid ? "PRIME" : member.role,
        permissions:
          organization.primeUserId === uid ? ["*"] : (member.permissions ?? []),
        effective_permissions:
          organization.primeUserId === uid
            ? ["*"]
            : Array.from(effectivePermissions),
      };
    }),
  );
  const joinRequestsSnapshot = await app.store.db
    .collection("organizationJoinRequests")
    .where("userId", "==", uid)
    .limit(50)
    .get();
  const joinRequests = await Promise.all(
    joinRequestsSnapshot.docs.map(async (item) => {
      const value = document<{
        organizationId: string;
        status: string;
        requestedAt: unknown;
      }>(item)!;
      const organization = document<{ name: string }>(
        await app.store.organization(value.organizationId).get(),
      );
      return {
        id: item.id,
        organization_id: value.organizationId,
        organization_name: organization?.name ?? "Unknown organization",
        status: value.status,
        requested_at: value.requestedAt,
      };
    }),
  );
  return {
    user: {
      id: uid,
      uid,
      email: profile.email,
      display_name: profile.displayName,
      photo_url: profile.photoURL,
      phone: profile.phone ?? null,
      job_title: profile.jobTitle ?? null,
      bio: profile.bio ?? null,
      timezone: profile.timezone ?? "UTC",
      locale: profile.locale ?? "en",
      preferences: {
        email_notifications: profile.preferences?.emailNotifications ?? true,
        product_updates: profile.preferences?.productUpdates ?? false,
      },
      default_organization_id: profile.defaultOrganizationId ?? null,
      email_verified: request.auth!.user.email_verified,
      created_at: profile.createdAt,
    },
    memberships: organizations.filter(Boolean),
    join_requests: joinRequests,
  };
}

export async function authRoutes(app: FastifyInstance): Promise<void> {
  app.get("/providers", async () => ({
    password: true,
    google: true,
    github: true,
  }));

  app.post("/onboard", { preHandler: authenticate }, async (request, reply) => {
    const body = parse(
      z.object({
        organization_name: z.string().trim().min(2).max(200).optional(),
      }),
      request.body ?? {},
    );
    const uid = request.auth!.user.uid;
    const userRef = app.store.user(uid);
    const organizationRef = body.organization_name
      ? app.store.organization(app.store.db.collection("organizations").doc().id)
      : null;
    await app.store.db.runTransaction(async (transaction) => {
      const existing = await transaction.get(userRef);
      const existingData = existing.data() as
        { organizationIds?: string[] } | undefined;
      if (
        existing.exists &&
        ((existingData?.organizationIds?.length ?? 0) > 0 || !organizationRef)
      ) {
        transaction.set(
          userRef,
          {
            email: request.auth!.user.email,
            displayName: request.auth!.user.display_name,
            photoURL: request.auth!.user.photo_url,
            updatedAt: now(),
          },
          { merge: true },
        );
        return;
      }
      if (!organizationRef) {
        transaction.set(
          userRef,
          {
            email: request.auth!.user.email,
            displayName: request.auth!.user.display_name,
            photoURL: request.auth!.user.photo_url,
            organizationIds: [],
            createdAt: existing.exists
              ? (existing.get("createdAt") ?? now())
              : now(),
            updatedAt: now(),
          },
          { merge: true },
        );
        return;
      }
      const organizationName = body.organization_name!;
      transaction.set(
        userRef,
        {
          email: request.auth!.user.email,
          displayName: request.auth!.user.display_name,
          photoURL: request.auth!.user.photo_url,
          organizationIds: FieldValue.arrayUnion(organizationRef.id),
          defaultOrganizationId: organizationRef.id,
          createdAt: existing.exists
            ? (existing.get("createdAt") ?? now())
            : now(),
          updatedAt: now(),
        },
        { merge: true },
      );
      transaction.create(organizationRef, {
        name: organizationName,
        slug: `${slugify(organizationName)}-${organizationRef.id.slice(0, 6)}`,
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
    });
    return reply.status(201).send(await authResponse(app, request));
  });

  app.get("/me", { preHandler: authenticate }, async (request) =>
    authResponse(app, request),
  );
  app.patch("/profile", { preHandler: authenticate }, async (request) => {
    const body = parse(
      z
        .object({
          display_name: z.string().trim().max(200).nullable().optional(),
          photo_url: z.string().url().nullable().optional(),
          phone: z.string().trim().max(40).nullable().optional(),
          job_title: z.string().trim().max(120).nullable().optional(),
          bio: z.string().trim().max(1000).nullable().optional(),
          timezone: z.string().trim().min(1).max(100).optional(),
          locale: z.string().trim().min(2).max(20).optional(),
          default_organization_id: z.string().nullable().optional(),
          preferences: z
            .object({
              email_notifications: z.boolean().optional(),
              product_updates: z.boolean().optional(),
            })
            .optional(),
        })
        .refine((value) => Object.keys(value).length > 0),
      request.body,
    );
    if (body.default_organization_id) {
      const membership = await app.store
        .member(body.default_organization_id, request.auth!.user.uid)
        .get();
      if (!membership.exists)
        throw unauthorized("Choose an organization you belong to.");
    }
    await app.store.user(request.auth!.user.uid).set(
      {
        ...(body.display_name !== undefined
          ? { displayName: body.display_name }
          : {}),
        ...(body.photo_url !== undefined ? { photoURL: body.photo_url } : {}),
        ...(body.phone !== undefined ? { phone: body.phone } : {}),
        ...(body.job_title !== undefined ? { jobTitle: body.job_title } : {}),
        ...(body.bio !== undefined ? { bio: body.bio } : {}),
        ...(body.timezone !== undefined ? { timezone: body.timezone } : {}),
        ...(body.locale !== undefined ? { locale: body.locale } : {}),
        ...(body.default_organization_id !== undefined
          ? { defaultOrganizationId: body.default_organization_id }
          : {}),
        ...(body.preferences
          ? {
              preferences: {
                ...(body.preferences.email_notifications !== undefined
                  ? {
                      emailNotifications:
                        body.preferences.email_notifications,
                    }
                  : {}),
                ...(body.preferences.product_updates !== undefined
                  ? { productUpdates: body.preferences.product_updates }
                  : {}),
              },
            }
          : {}),
        updatedAt: now(),
      },
      { merge: true },
    );
    return authResponse(app, request);
  });
  app.post("/logout", { preHandler: authenticate }, async () => ({
    message: "Signed out on the client.",
  }));
  app.post("/logout-all", { preHandler: authenticate }, async (request) => {
    try {
      await app.firebase.auth.revokeRefreshTokens(request.auth!.user.uid);
    } catch {
      throw new AppError(
        "FIREBASE_UNAVAILABLE",
        "Firebase could not revoke sessions.",
        503,
      );
    }
    return { message: "All Firebase sessions were revoked." };
  });
  app.get("/sessions", { preHandler: authenticate }, async () => ({
    managed_by: "firebase",
    sessions: [],
  }));
  app.delete("/sessions/:sessionId", { preHandler: authenticate }, async () => {
    throw new AppError(
      "FIREBASE_MANAGED_SESSION",
      "Individual Firebase sessions are managed by Firebase Authentication.",
      409,
    );
  });
  app.post(
    "/invitations/accept",
    { preHandler: authenticate },
    async (request) => {
      const body = parse(z.object({ token: z.string().min(20) }), request.body);
      // The invite is matched by email, so the person must have proved they own that address.
      if (!request.auth!.user.email_verified)
        throw new AppError(
          "EMAIL_NOT_VERIFIED",
          "Verify your email address before accepting an invitation.",
          403,
        );
      const invitationRef = app.store.db
        .collection("invitations")
        .doc(body.token);
      await app.store.db.runTransaction(async (transaction) => {
        const invitation = await transaction.get(invitationRef);
        const data = invitation.data() as
          | {
              organizationId: string;
              email: string;
              role: string;
              permissions?: string[];
              status: string;
              expiresAt: FirebaseFirestore.Timestamp;
            }
          | undefined;
        if (
          !data ||
          data.status !== "PENDING" ||
          data.expiresAt.toMillis() <= Date.now() ||
          data.email.toLowerCase() !== request.auth!.user.email.toLowerCase()
        )
          throw unauthorized("The invitation is invalid or expired.");
        transaction.set(
          app.store.member(data.organizationId, request.auth!.user.uid),
          {
            uid: request.auth!.user.uid,
            email: request.auth!.user.email,
            displayName: request.auth!.user.display_name,
            role: data.role,
            permissions: data.permissions ?? [],
            deniedPermissions: [],
            status: "ACTIVE",
            joinedAt: now(),
            updatedAt: now(),
          },
        );
        transaction.set(
          app.store.user(request.auth!.user.uid),
          {
            email: request.auth!.user.email,
            displayName: request.auth!.user.display_name,
            organizationIds: FieldValue.arrayUnion(data.organizationId),
            updatedAt: now(),
          },
          { merge: true },
        );
        transaction.update(invitationRef, {
          status: "ACCEPTED",
          acceptedAt: now(),
          acceptedBy: request.auth!.user.uid,
        });
      });
      return authResponse(app, request);
    },
  );
}

export async function meRoute(app: FastifyInstance): Promise<void> {
  app.get("/", { preHandler: authenticate }, async (request) =>
    authResponse(app, request),
  );
}

export const firebasePermissionCatalog = ALL_PERMISSIONS;
