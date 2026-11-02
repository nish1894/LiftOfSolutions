import type { FastifyInstance } from "fastify";
import { document, now } from "../../firebase/store.js";
import { permissionsFor, type Permission } from "../../permissions/catalog.js";

/**
 * Notification types are stable strings stored on the document. The frontend
 * maps them to an icon and a target section, so add a case there when adding
 * one here.
 */
export type NotificationType =
  "join_request.created" | "join_request.approved" | "join_request.rejected";

export interface NotificationInput {
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  organizationId: string | null;
  organizationName: string | null;
  /** Platform section the bell should open when the notification is clicked. */
  section?: string;
  resourceType?: string | null;
  resourceId?: string | null;
  actorUserId?: string | null;
}

const MAX_FANOUT = 100;

/**
 * Writes one notification per recipient. Notifications are top-level rather
 * than organization-scoped so a rejected applicant — who is not a member of
 * the organization — can still be told what happened.
 */
export async function notify(
  app: FastifyInstance,
  inputs: NotificationInput[],
): Promise<void> {
  if (!inputs.length) return;
  const batch = app.store.db.batch();
  for (const input of inputs.slice(0, MAX_FANOUT)) {
    batch.create(app.store.db.collection("notifications").doc(), {
      userId: input.userId,
      type: input.type,
      title: input.title,
      body: input.body,
      organizationId: input.organizationId,
      organizationName: input.organizationName,
      section: input.section ?? null,
      resourceType: input.resourceType ?? null,
      resourceId: input.resourceId ?? null,
      actorUserId: input.actorUserId ?? null,
      readAt: null,
      createdAt: now(),
    });
  }
  await batch.commit();
}

/**
 * Resolves the active members of an organization whose effective permissions
 * include `permission`, using the same role bundle + grant - deny arithmetic
 * as `requireOrganization`. Prime always qualifies.
 */
export async function membersWithPermission(
  app: FastifyInstance,
  organizationId: string,
  permission: Permission,
  primeUserId: string,
): Promise<string[]> {
  const snapshot = await app.store
    .collection(organizationId, "members")
    .limit(MAX_FANOUT)
    .get();
  const recipients: string[] = [];
  for (const item of snapshot.docs) {
    const member = document<{
      uid: string;
      role: string;
      status: string;
      permissions?: Permission[];
      deniedPermissions?: Permission[];
    }>(item);
    if (!member || member.status !== "ACTIVE") continue;
    const uid = member.uid ?? item.id;
    if (uid === primeUserId) {
      recipients.push(uid);
      continue;
    }
    const effective = permissionsFor(member.role);
    for (const granted of member.permissions ?? []) effective.add(granted);
    for (const denied of member.deniedPermissions ?? [])
      effective.delete(denied);
    if (effective.has(permission)) recipients.push(uid);
  }
  return recipients;
}

/**
 * Marks every outstanding notification about a resource as read. Called once
 * the resource has been acted on, so a request approved by one manager stops
 * showing as unread work for the others.
 */
export async function resolveNotifications(
  app: FastifyInstance,
  resourceType: string,
  resourceId: string,
): Promise<void> {
  const snapshot = await app.store.db
    .collection("notifications")
    .where("resourceId", "==", resourceId)
    .limit(MAX_FANOUT)
    .get();
  const stale = snapshot.docs.filter(
    (item) => item.get("resourceType") === resourceType && !item.get("readAt"),
  );
  if (!stale.length) return;
  const batch = app.store.db.batch();
  for (const item of stale) batch.update(item.ref, { readAt: now() });
  await batch.commit();
}

/**
 * Notification delivery must never fail the action that triggered it — a
 * manager missing a bell entry is far cheaper than a rejected join request.
 */
export async function notifyQuietly(
  app: FastifyInstance,
  inputs: NotificationInput[],
): Promise<void> {
  try {
    await notify(app, inputs);
  } catch (error) {
    app.log.warn({ err: error }, "Failed to write notifications");
  }
}
