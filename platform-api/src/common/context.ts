import type { DecodedIdToken } from "firebase-admin/auth";
import type { FastifyReply, FastifyRequest } from "fastify";
import type { Config } from "../config.js";
import type { FirebaseServices } from "../firebase/admin.js";
import { document, PlatformStore } from "../firebase/store.js";
import { permissionsFor, type Permission } from "../permissions/catalog.js";
import { forbidden, unauthorized } from "./errors.js";

export interface AuthUser {
  id: string;
  uid: string;
  email: string;
  display_name: string | null;
  photo_url: string | null;
  email_verified: boolean;
}
export interface OrganizationContext {
  id: string;
  name: string;
  slug: string;
  primeUserId: string;
  role: string;
  permissions: Set<Permission>;
}

declare module "fastify" {
  interface FastifyInstance {
    config: Config;
    firebase: FirebaseServices;
    store: PlatformStore;
  }
  interface FastifyRequest {
    auth?: { user: AuthUser; token: DecodedIdToken };
    organization?: OrganizationContext;
  }
}

export async function authenticate(request: FastifyRequest): Promise<void> {
  const authorization = request.headers.authorization;
  if (!authorization?.startsWith("Bearer ")) throw unauthorized();
  const rawToken = authorization.slice(7).trim();
  if (!rawToken) throw unauthorized();
  let decoded: DecodedIdToken;
  try {
    decoded = await request.server.firebase.auth.verifyIdToken(
      rawToken,
      request.server.config.FIREBASE_CHECK_REVOKED_TOKENS,
    );
  } catch {
    throw unauthorized("The Firebase ID token is invalid or expired.");
  }
  request.auth = {
    token: decoded,
    user: {
      id: decoded.uid,
      uid: decoded.uid,
      email: decoded.email ?? "",
      display_name: typeof decoded.name === "string" ? decoded.name : null,
      photo_url: typeof decoded.picture === "string" ? decoded.picture : null,
      email_verified: decoded.email_verified ?? false,
    },
  };
}

export function requireOrganization(permission: Permission) {
  return async (
    request: FastifyRequest,
    _reply: FastifyReply,
  ): Promise<void> => {
    if (!request.auth) await authenticate(request);
    const params = request.params as Record<string, string>;
    const organizationId = params.businessId ?? params.organizationId;
    if (!organizationId || !request.auth) throw forbidden(permission);
    const [organizationSnapshot, memberSnapshot] = await Promise.all([
      request.server.store.organization(organizationId).get(),
      request.server.store.member(organizationId, request.auth.user.uid).get(),
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
      permissions?: Permission[];
      deniedPermissions?: Permission[];
    }>(memberSnapshot);
    if (
      !organization ||
      organization.status !== "ACTIVE" ||
      !member ||
      member.status !== "ACTIVE"
    )
      throw forbidden(permission);
    const isPrime = organization.primeUserId === request.auth.user.uid;
    const effective = permissionsFor(isPrime ? "PRIME" : member.role);
    for (const granted of member.permissions ?? []) effective.add(granted);
    if (!isPrime)
      for (const denied of member.deniedPermissions ?? [])
        effective.delete(denied);
    if (!effective.has(permission)) throw forbidden(permission);
    request.organization = {
      id: organizationId,
      name: organization.name,
      slug: organization.slug,
      primeUserId: organization.primeUserId,
      role: isPrime ? "PRIME" : member.role,
      permissions: effective,
    };
  };
}
