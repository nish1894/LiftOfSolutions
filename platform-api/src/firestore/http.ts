import type { FastifyInstance, FastifyRequest } from "fastify";
import type { DecodedIdToken } from "firebase-admin/auth";
import { z } from "zod";
import { parse } from "../common/schemas.js";
import { unauthorized, conflict } from "../common/errors.js";
import { Platform, type Principal } from "./platform.js";
import { ORG_ROLE_ACTIONS } from "../domain/schema/organization-schema/organizations.types.js";
import { projectPermissions } from "../domain/schema/project-schema/projects.types.js";

declare module "fastify" {
  interface FastifyRequest {
    principal?: Principal;
  }
}
export type TokenVerifier = (raw: string) => Promise<DecodedIdToken>;
export const params = (req: FastifyRequest) =>
  req.params as Record<string, string>;
export const uuidParam = (req: FastifyRequest, key: string) =>
  parse(z.uuid(), params(req)[key]);
export const p = (req: FastifyRequest) => req.principal!;
export const dto = <T extends { _id: string }>(value: T) => ({
  ...value,
  id: value._id,
});
export function defined<T extends object>(
  value: T,
): { [K in keyof T]: Exclude<T[K], undefined> } {
  return Object.fromEntries(
    Object.entries(value).filter(([, item]) => item !== undefined),
  ) as { [K in keyof T]: Exclude<T[K], undefined> };
}
export const listQuery = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(100),
});

export function authentication(platform: Platform, verify: TokenVerifier) {
  async function token(request: FastifyRequest): Promise<DecodedIdToken> {
    const header = request.headers.authorization;
    if (!header?.startsWith("Bearer ") || !header.slice(7).trim())
      throw unauthorized();
    try {
      return await verify(header.slice(7).trim());
    } catch {
      throw unauthorized("The Firebase ID token is invalid or expired.");
    }
  }
  async function authenticated(request: FastifyRequest) {
    const decoded = await token(request);
    const user = await platform.findUser(decoded);
    request.principal = {
      userId: user._id,
      token: decoded,
      requestId: request.id,
      user,
    };
  }
  return { token, authenticated };
}

// Compatibility names exist only at the HTTP boundary, never in stored documents.
export function legacyRole(role: string) {
  return role === "owner" ? "OWNER" : role === "admin" ? "ADMIN" : "AGENT";
}
export const roleInput = z
  .enum(["owner", "admin", "member", "OWNER", "ADMIN", "AGENT"])
  .transform((value) =>
    value === "OWNER"
      ? "owner"
      : value === "ADMIN"
        ? "admin"
        : value === "AGENT"
          ? "member"
          : value,
  );
export function uiPermissions(
  role: "owner" | "admin" | "member",
  permissions: Iterable<string>,
) {
  const result = new Set<string>(permissions);
  result.add("organization.view");
  result.add("organization.members.view");
  for (const action of ORG_ROLE_ACTIONS[role]) {
    const alias: Record<string, string> = {
      "org.edit": "organization.update",
      "members.manage": "organization.members.manage",
      "billing.manage": "billing.manage",
      "projects.manage_access": "organization.permissions.manage",
    };
    result.add(alias[action] ?? action);
  }
  if (result.has("contacts.view")) result.add("customers.view");
  if (result.has("contacts.manage")) result.add("customers.manage");
  return [...result];
}

// Always reads the user again: this runs after changes such as accepting the terms.
export async function accountResponse(
  platform: Platform,
  principal: Principal,
) {
  const { user: _cached, ...fresh } = principal;
  const { user, org } = await platform.context(
    fresh,
    undefined,
    undefined,
    undefined,
    true,
  );
  const projects = (await platform.orgProjects(platform.db, org._id)).filter(
    (project) =>
      projectPermissions(user.membership.role, project, user._id).size > 0,
  );
  return {
    user: {
      ...dto(user),
      uid: principal.token.uid,
      email: user.email ?? "",
      photo_url: user.avatar_url ?? null,
      phone: user.phone ?? null,
      job_title: null,
      bio: null,
      timezone: user.settings?.timezone ?? "UTC",
      locale: user.settings?.language ?? "en",
      email_verified: principal.token.email_verified ?? false,
      preferences: {
        email_notifications: user.settings?.notifications?.email ?? true,
        product_updates: user.settings?.notifications?.product_updates ?? false,
      },
      default_organization_id: org._id,
      terms_required: user.terms_version !== platform.config.TERMS_VERSION,
      current_terms_version: platform.config.TERMS_VERSION,
      terms_url: platform.config.TERMS_URL ?? null,
    },
    memberships: [
      {
        business_id: org._id,
        organization_id: org._id,
        business_name: org.name,
        organization_name: org.name,
        business_slug: org.slug,
        role: legacyRole(user.membership.role),
        organization_role: user.membership.role,
        // Organization-level only. Project permissions differ per project and are in projects[].effective_permissions.
        permissions: [],
        effective_permissions: uiPermissions(user.membership.role, []),
      },
    ],
    projects: projects.map((project) => ({
      ...dto(project),
      effective_permissions: [
        ...projectPermissions(user.membership.role, project, user._id),
      ],
    })),
    join_requests: [],
  };
}

export async function authRoutes(
  app: FastifyInstance,
  platform: Platform,
  verify: TokenVerifier,
  revoke: (uid: string) => Promise<void>,
) {
  const { token, authenticated } = authentication(platform, verify);
  // GitHub sign-in isn't offered (decided 2026-10-30).
  app.get("/auth/providers", async () => ({
    password: true,
    google: true,
    github: false,
  }));
  app.post("/auth/onboard", async (request) => {
    const decoded = await token(request);
    const input = parse(
      z
        .object({
          organization_name: z.string().trim().min(2).max(200).optional(),
          invitation_token: z.string().min(20).max(200).optional(),
        })
        .strict(),
      request.body ?? {},
    );
    const user = await platform.onboard(decoded, input);
    return accountResponse(platform, {
      userId: user._id,
      token: decoded,
      requestId: request.id,
    });
  });
  for (const path of ["/auth/me", "/me"])
    app.get(path, { preHandler: authenticated }, (request) =>
      accountResponse(platform, p(request)),
    );
  app.post("/auth/terms", { preHandler: authenticated }, async (request) => {
    const input = parse(
      z
        .object({ accepted: z.literal(true), version: z.string().min(1) })
        .strict(),
      request.body,
    );
    if (input.version !== platform.config.TERMS_VERSION)
      throw conflict(
        "TERMS_VERSION_CHANGED",
        "Refresh and accept the current terms.",
      );
    await platform.db.transaction(async (tx) => {
      const { user, org } = await platform.context(
        p(request),
        undefined,
        undefined,
        tx,
        true,
      );
      tx.update("users", user._id, {
        terms_version: input.version,
        terms_accepted_at: new Date(),
        updated_at: new Date(),
      });
      platform.audit(
        tx,
        p(request),
        org._id,
        "user.terms_accepted",
        "user",
        user._id,
        { after: { terms_version: input.version } },
      );
    });
    return accountResponse(platform, p(request));
  });
  app.patch("/auth/profile", { preHandler: authenticated }, async (request) => {
    const input = parse(
      z
        .object({
          display_name: z.string().trim().min(1).max(200).optional(),
          photo_url: z.url().max(2048).nullable().optional(),
          phone: z
            .string()
            .regex(/^\+[1-9][0-9]{6,14}$/)
            .nullable()
            .optional(),
          timezone: z
            .string()
            .refine((value) => {
              try {
                new Intl.DateTimeFormat("en", { timeZone: value });
                return true;
              } catch {
                return false;
              }
            })
            .optional(),
          locale: z.string().min(2).max(35).optional(),
          theme: z.enum(["light", "dark", "system"]).optional(),
          preferences: z
            .object({
              email_notifications: z.boolean().optional(),
              product_updates: z.boolean().optional(),
            })
            .strict()
            .optional(),
        })
        .strict(),
      request.body,
    );
    await platform.db.transaction(async (tx) => {
      const { user, org } = await platform.context(
        p(request),
        undefined,
        undefined,
        tx,
        true,
      );
      const next = structuredClone(user);
      if (input.display_name !== undefined)
        next.display_name = input.display_name;
      if (input.photo_url === null) delete next.avatar_url;
      else if (input.photo_url !== undefined) next.avatar_url = input.photo_url;
      if (input.phone === null) delete next.phone;
      else if (input.phone !== undefined) next.phone = input.phone;
      next.settings ??= {};
      if (input.timezone !== undefined) next.settings.timezone = input.timezone;
      if (input.locale !== undefined) next.settings.language = input.locale;
      if (input.theme !== undefined) next.settings.theme = input.theme;
      if (input.preferences) {
        next.settings.notifications ??= {};
        if (input.preferences.email_notifications !== undefined)
          next.settings.notifications.email =
            input.preferences.email_notifications;
        if (input.preferences.product_updates !== undefined)
          next.settings.notifications.product_updates =
            input.preferences.product_updates;
      }
      next.updated_at = new Date();
      tx.set("users", next);
      // Audit field names only; avoid retaining profile PII in a second collection.
      platform.audit(
        tx,
        p(request),
        org._id,
        "user.profile_updated",
        "user",
        user._id,
        { after: { fields: Object.keys(input) } },
      );
    });
    return accountResponse(platform, p(request));
  });
  app.post(
    "/auth/logout-all",
    { preHandler: authenticated },
    async (request) => {
      await revoke(p(request).token.uid);
      return { revoked: true };
    },
  );
  app.post(
    "/auth/invitations/preview",
    { preHandler: authenticated },
    async (request) => {
      const input = parse(
        z.object({ token: z.string().min(20).max(200) }).strict(),
        request.body,
      );
      const preview = await platform.previewInvitation(p(request), input.token);
      return { ...preview, role: legacyRole(preview.role) };
    },
  );
  app.post(
    "/auth/invitations/accept",
    { preHandler: authenticated },
    async (request) => {
      const input = parse(
        z.object({ token: z.string().min(20).max(200) }).strict(),
        request.body,
      );
      await platform.acceptInvitation(p(request), input.token);
      return accountResponse(platform, p(request));
    },
  );
}
