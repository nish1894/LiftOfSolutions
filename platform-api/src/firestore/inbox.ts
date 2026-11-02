import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { parse } from "../common/schemas.js";
import { conflict, forbidden, notFound, AppError } from "../common/errors.js";
import { duplicate, type Tx } from "./database.js";
import { Platform, id, type Principal } from "./platform.js";
import {
  authentication,
  defined,
  dto,
  p,
  uuidParam,
  type TokenVerifier,
} from "./http.js";
import {
  normaliseExternalId,
  type Contact,
  type ContactIdentity,
} from "../domain/schema/contact-schema/contacts.types.js";
import {
  CLOSE_AFTER_DAYS,
  canMoveConversation,
  externalKey,
  openKey,
  previewOf,
  type Conversation,
  type ConversationEvent,
  type ConversationStatus,
  type Message,
} from "../domain/schema/inbox-schema/inbox.types.js";
import {
  projectPermissions,
  type Project,
  type ProjectPermission,
} from "../domain/schema/project-schema/projects.types.js";
import {
  dedupeKey,
  type NotificationType,
} from "../domain/schema/notification-schema/notifications.types.js";
import type { Channel } from "../domain/schema/shared.types.js";

// Inbox writes don't lock the organization document: each transaction writes only the
// conversation, message, contact and notification documents it changes, so concurrent
// conversations in one organization never queue behind each other. Unique values
// (a message's external_key, a conversation's open_key, a contact identity) are claimed in
// unique_values, which also finds their holder by id.

type IncomingMessage = {
  projectId: string;
  agentId: string;
  connectionId: string;
  channel: Channel;
  externalId: string;
  providerMessageId: string;
  content: string;
  externalThreadId?: string;
};

type ReceiveResult =
  | {
      conversation_id: string;
      message_id: string;
      duplicate: boolean;
      ignored: false;
    }
  | { ignored: true; duplicate: false };

const MAX_RECEIVE_ATTEMPTS = 3;
const DAY_MS = 86_400_000;
const identityKey = (projectId: string, channel: Channel, externalId: string) =>
  `${projectId}|${channel}|${externalId}`;

// The system-message event for a status change.
function eventFor(
  from: ConversationStatus,
  to: ConversationStatus,
): ConversationEvent {
  if (to === "agent_active")
    return from === "agent_active" ? "transferred" : "assigned";
  if (to === "waiting_for_agent") return "handoff_requested";
  if (to === "resolved") return "resolved";
  if (to === "closed") return "closed";
  return from === "resolved" ? "reopened" : "returned_to_ai";
}

// Assigning or transferring needs conversations.assign. The assigned teammate can resolve, hand back
// to the AI or ask for help on their own conversation with conversations.reply; anything else
// needs conversations.manage.
function permissionFor(
  conversation: Conversation,
  to: ConversationStatus,
  userId: string,
): ProjectPermission {
  if (to === "agent_active") return "conversations.assign";
  const ownsIt =
    conversation.status === "agent_active" &&
    conversation.assigned_user_id === userId;
  const ownMove =
    to === "resolved" || to === "ai_active" || to === "waiting_for_agent";
  return ownsIt && ownMove ? "conversations.reply" : "conversations.manage";
}

export class Inbox {
  constructor(readonly platform: Platform) {}

  get db() {
    return this.platform.db;
  }

  // One notification per event and person: a repeated event finds its claimed key and writes nothing.
  async notify(
    tx: Tx,
    orgId: string,
    userId: string,
    type: NotificationType,
    eventId: string,
    title: string,
    resourceId: string,
    projectId?: string,
  ) {
    const key = dedupeKey(type, eventId, userId);
    if (await tx.claimed("notifications.dedupe_key", key)) return;
    const now = new Date(),
      notificationId = id();
    const isConversation = type.startsWith("conversation.");
    tx.create("notifications", {
      _id: notificationId,
      user_id: userId,
      org_id: orgId,
      type,
      title,
      body: "",
      dedupe_key: key,
      resource_id: resourceId,
      resource_type: isConversation ? "conversation" : "tool_run",
      section: isConversation ? "inbox" : "requests",
      ...(projectId ? { project_id: projectId } : {}),
      created_at: now,
      expires_at: new Date(now.getTime() + 90 * DAY_MS),
    });
    tx.claim("notifications.dedupe_key", key, notificationId);
  }

  // Called only by a trusted channel adapter AFTER provider signature verification.
  // No public route accepts arbitrary contacts, connections or agent IDs.
  async receive(input: IncomingMessage): Promise<ReceiveResult> {
    const externalId = normaliseExternalId(input.channel, input.externalId);
    const messageKey = externalKey(
      input.projectId,
      input.connectionId,
      input.providerMessageId,
    );
    for (let attempt = 1; attempt <= MAX_RECEIVE_ATTEMPTS; attempt++) {
      try {
        return await this.db.transaction((tx) =>
          this.receiveOnce(tx, input, externalId, messageKey),
        );
      } catch (error) {
        // Two first messages from one new contact can race on a claimed value; the retry finds the winner.
        if (!duplicate(error) || attempt === MAX_RECEIVE_ATTEMPTS) throw error;
      }
    }
    throw conflict("MESSAGE_CONFLICT", "Retry message delivery.");
  }

  private async receiveOnce(
    tx: Tx,
    input: IncomingMessage,
    externalId: string,
    messageKey: string,
  ): Promise<ReceiveResult> {
    await this.activeProjectAndAgent(tx, input.projectId, input.agentId);

    const prior = await tx.claimed("messages.external_key", messageKey);
    const priorMessage = prior && (await tx.get("messages", prior.owner_id));
    if (priorMessage)
      return {
        conversation_id: priorMessage.conversation_id,
        message_id: priorMessage._id,
        duplicate: true,
        ignored: false,
      };

    const now = new Date();
    const identity = await this.findOrCreateIdentity(
      tx,
      input,
      externalId,
      now,
    );
    const contact = identity.isNew
      ? identity.contact
      : await tx.get("contacts", identity.record.contact_id);
    if (
      !contact ||
      contact.project_id !== input.projectId ||
      contact.status !== "active"
    )
      return { ignored: true, duplicate: false };

    const conversation = await this.findOrOpenConversation(
      tx,
      input,
      identity.record,
      now,
    );
    const message: Message = {
      _id: id(),
      project_id: input.projectId,
      conversation_id: conversation._id,
      sender_type: "contact",
      content_type: "text",
      content: input.content,
      external_key: messageKey,
      created_at: now,
    };
    tx.create("messages", message);
    tx.claim("messages.external_key", messageKey, message._id);

    conversation.last_message_at = now;
    conversation.last_message_preview = previewOf(input.content);
    conversation.updated_at = now;
    tx.set("conversations", conversation);
    return {
      conversation_id: conversation._id,
      message_id: message._id,
      duplicate: false,
      ignored: false,
    };
  }

  private async activeProjectAndAgent(
    tx: Tx,
    projectId: string,
    agentId: string,
  ) {
    const project = await tx.get("projects", projectId);
    if (!project || project.status !== "active")
      throw notFound("Active project");
    // agents belong to the RAG's agent schema; only its project, status and deletion are read.
    const agent = await tx.get("agents", agentId);
    if (
      !agent ||
      agent.project_id !== projectId ||
      agent.status !== "active" ||
      agent.deleted_at
    )
      throw notFound("Active agent");
    return project;
  }

  private async findOrCreateIdentity(
    tx: Tx,
    input: IncomingMessage,
    externalId: string,
    now: Date,
  ): Promise<
    | { isNew: false; record: ContactIdentity }
    | { isNew: true; record: ContactIdentity; contact: Contact }
  > {
    const key = identityKey(input.projectId, input.channel, externalId);
    const holder = await tx.claimed("contact_identities.key", key);
    const found =
      holder && (await tx.get("contact_identities", holder.owner_id));
    if (found) return { isNew: false, record: found };

    const contact: Contact = {
      _id: id(),
      project_id: input.projectId,
      status: "active",
      metadata: {},
      created_at: now,
      updated_at: now,
    };
    const identity: ContactIdentity = {
      _id: id(),
      project_id: input.projectId,
      contact_id: contact._id,
      channel: input.channel,
      external_id: externalId,
      created_at: now,
    };
    tx.create("contacts", contact);
    tx.create("contact_identities", identity);
    tx.claim("contact_identities.key", key, identity._id);
    return { isNew: true, record: identity, contact };
  }

  // The open conversation for this agent, connection and identity; a resolved one is reopened, none is created.
  // The caller writes it (tx.set) once it has added the message.
  private async findOrOpenConversation(
    tx: Tx,
    input: IncomingMessage,
    identity: ContactIdentity,
    now: Date,
  ): Promise<Conversation> {
    const key = openKey(input.agentId, input.connectionId, identity._id);
    const holder = await tx.claimed("conversations.open_key", key);
    const existing = holder && (await tx.get("conversations", holder.owner_id));

    if (!existing || existing.project_id !== input.projectId) {
      const conversation: Conversation = {
        _id: id(),
        project_id: input.projectId,
        agent_id: input.agentId,
        contact_id: identity.contact_id,
        identity_id: identity._id,
        channel: input.channel,
        connection_id: input.connectionId,
        open_key: key,
        status: "ai_active",
        ...(input.externalThreadId
          ? { external_thread_id: input.externalThreadId }
          : {}),
        last_message_at: now,
        created_at: now,
        updated_at: now,
      };
      tx.claim("conversations.open_key", key, conversation._id);
      return conversation;
    }

    if (existing.status === "resolved") {
      existing.status = "ai_active";
      delete existing.resolved_at;
      this.systemMessage(
        tx,
        existing,
        "reopened",
        "Conversation reopened",
        now,
      );
    }
    return existing;
  }

  private systemMessage(
    tx: Tx,
    conversation: Conversation,
    event: ConversationEvent,
    content: string,
    now: Date,
    extra: Pick<Message, "sender_user_id" | "event_data"> = {},
  ): Message {
    const message: Message = {
      _id: id(),
      project_id: conversation.project_id,
      conversation_id: conversation._id,
      sender_type: "system",
      content_type: "text",
      content,
      event,
      created_at: now,
      ...extra,
    };
    tx.create("messages", message);
    return message;
  }

  async transition(
    principal: Principal,
    projectId: string,
    conversationId: string,
    to: ConversationStatus,
    assignee?: string,
    reason?: string,
  ) {
    return this.db.transaction(async (tx) => {
      const { org, project, permissions } = await this.platform.project(
        principal,
        projectId,
        undefined,
        tx,
      );
      const conversation = await tx.get("conversations", conversationId);
      if (!conversation || conversation.project_id !== projectId)
        throw notFound("Conversation");

      const needed = permissionFor(conversation, to, principal.userId);
      if (!permissions.has(needed)) throw forbidden(needed);
      if (!canMoveConversation(conversation.status, to)) {
        throw conflict(
          "INVALID_TRANSITION",
          `Cannot move ${conversation.status} to ${to}.`,
        );
      }
      if (to === "agent_active")
        await this.checkAssignee(tx, org._id, project, assignee);

      const from = conversation.status;
      const now = new Date();
      applyStatus(tx, conversation, to, now, assignee, reason);

      const event = eventFor(from, to);
      const message = this.systemMessage(
        tx,
        conversation,
        event,
        reason ?? event,
        now,
        {
          sender_user_id: principal.userId,
          event_data: {
            ...(assignee ? { to_user_id: assignee } : {}),
            ...(reason ? { reason } : {}),
          },
        },
      );
      conversation.last_message_at = now;
      conversation.last_message_preview = previewOf(message.content);
      tx.set("conversations", conversation);

      await this.notifyForTransition(
        tx,
        org._id,
        project,
        conversationId,
        to,
        message._id,
        assignee,
      );
      this.platform.audit(
        tx,
        principal,
        org._id,
        `conversation.${event}`,
        "conversation",
        conversationId,
        { before: { status: from }, after: { status: to } },
        projectId,
      );
      return conversation;
    });
  }

  private async checkAssignee(
    tx: Tx,
    orgId: string,
    project: Project,
    assignee?: string,
  ) {
    if (!assignee) throw conflict("ASSIGNEE_REQUIRED", "Choose a teammate.");
    const user = await tx.get("users", assignee);
    if (
      !user ||
      user.membership.org_id !== orgId ||
      user.status !== "active" ||
      !projectPermissions(user.membership.role, project, user._id).has(
        "conversations.reply",
      )
    ) {
      throw forbidden("conversations.reply");
    }
  }

  private async notifyForTransition(
    tx: Tx,
    orgId: string,
    project: Project,
    conversationId: string,
    to: ConversationStatus,
    eventId: string,
    assignee?: string,
  ) {
    if (to === "agent_active") {
      await this.notify(
        tx,
        orgId,
        assignee!,
        "conversation.assigned",
        eventId,
        "Conversation assigned to you",
        conversationId,
        project._id,
      );
      return;
    }
    if (to !== "waiting_for_agent") return;
    for (const member of await this.platform.orgUsers(tx, orgId)) {
      if (
        member.status !== "active" ||
        !projectPermissions(member.membership.role, project, member._id).has(
          "conversations.assign",
        )
      )
        continue;
      await this.notify(
        tx,
        orgId,
        member._id,
        "conversation.handoff_requested",
        eventId,
        "A contact needs a teammate",
        conversationId,
        project._id,
      );
    }
  }

  async reply(
    principal: Principal,
    projectId: string,
    conversationId: string,
    content: string,
  ) {
    return this.db.transaction(async (tx) => {
      await this.platform.project(
        principal,
        projectId,
        "conversations.reply",
        tx,
      );
      const conversation = await tx.get("conversations", conversationId);
      if (!conversation || conversation.project_id !== projectId)
        throw notFound("Conversation");
      if (
        conversation.status !== "agent_active" ||
        conversation.assigned_user_id !== principal.userId
      ) {
        throw forbidden("conversations.reply");
      }
      // Do not pretend a stored message was sent through an unimplemented provider adapter.
      if (conversation.channel !== "web_widget") {
        throw new AppError(
          "CHANNEL_DELIVERY_NOT_CONFIGURED",
          "This channel delivery adapter is not connected yet.",
          501,
        );
      }
      const now = new Date();
      const message: Message = {
        _id: id(),
        project_id: projectId,
        conversation_id: conversationId,
        sender_type: "agent",
        sender_user_id: principal.userId,
        content_type: "text",
        content,
        created_at: now,
      };
      tx.create("messages", message);
      tx.update("conversations", conversationId, {
        last_message_at: now,
        last_message_preview: previewOf(content),
        updated_at: now,
      });
      return message;
    });
  }

  // Scheduled job: a resolved conversation closes CLOSE_AFTER_DAYS after resolved_at.
  // Returns false when it was reopened or closed meanwhile.
  async closeResolved(
    conversationId: string,
    now = new Date(),
  ): Promise<boolean> {
    const cutoff = new Date(now.getTime() - CLOSE_AFTER_DAYS * DAY_MS);
    return this.db.transaction(async (tx) => {
      const conversation = await tx.get("conversations", conversationId);
      if (
        !conversation ||
        conversation.status !== "resolved" ||
        !conversation.resolved_at ||
        conversation.resolved_at > cutoff
      )
        return false;
      const project = await tx.get("projects", conversation.project_id);
      applyStatus(tx, conversation, "closed", now);
      const message = this.systemMessage(
        tx,
        conversation,
        "closed",
        "closed",
        now,
      );
      conversation.last_message_at = now;
      conversation.last_message_preview = previewOf(message.content);
      tx.set("conversations", conversation);
      if (project)
        this.platform.audit(
          tx,
          null,
          project.org_id,
          "conversation.closed",
          "conversation",
          conversationId,
          { before: { status: "resolved" }, after: { status: "closed" } },
          project._id,
        );
      return true;
    });
  }
}

// Moves the conversation to `to` in memory. Closing frees its open_key, so the contact's next
// message opens a new conversation.
function applyStatus(
  tx: Tx,
  conversation: Conversation,
  to: ConversationStatus,
  now: Date,
  assignee?: string,
  reason?: string,
) {
  conversation.status = to;
  conversation.updated_at = now;
  if (to === "agent_active") conversation.assigned_user_id = assignee!;
  else delete conversation.assigned_user_id;
  if (to === "resolved") conversation.resolved_at = now;
  else if (to !== "closed") delete conversation.resolved_at;
  if (to === "closed") {
    conversation.closed_at = now;
    if (conversation.open_key)
      tx.release("conversations.open_key", conversation.open_key);
    delete conversation.open_key;
  }
  if (reason) conversation.handoff_reason = reason;
}

// ---------- HTTP ----------

const SENDER_NAMES = {
  contact: "CUSTOMER",
  ai: "ASSISTANT",
  agent: "AGENT",
  system: "SYSTEM",
} as const;

const conversationDto = (c: Conversation) => ({
  ...dto(c),
  status: c.status.toUpperCase(),
  assistant_id: c.agent_id,
  customer_id: c.contact_id,
  channel_connection_id: c.connection_id,
});

const messageDto = (m: Message) => ({
  ...dto(m),
  sender_type: SENDER_NAMES[m.sender_type],
  sender_user_id: m.sender_user_id ?? null,
  message_metadata: { citations: m.citations ?? [] },
});

const contactInput = z
  .object({
    display_name: z.string().trim().min(1).max(200).optional(),
    email: z
      .email()
      .transform((v) => v.toLowerCase())
      .optional(),
    phone: z
      .string()
      .regex(/^\+[1-9][0-9]{6,14}$/)
      .optional(),
    language: z.string().max(35).optional(),
    country: z
      .string()
      .regex(/^[A-Z]{2}$/)
      .optional(),
  })
  .strict();

const limitQuery = (max: number, fallback: number) =>
  z.object({
    limit: z.coerce.number().int().min(1).max(max).default(fallback),
  });

const MOVES = {
  claim: "agent_active",
  transfer: "agent_active",
  escalate: "waiting_for_agent",
  resolve: "resolved",
  reopen: "ai_active",
  "return-to-ai": "ai_active",
  close: "closed",
} as const;

// Notifications looked at for the bell: the latest of these, so the unread count is exact up to it.
const NOTIFICATION_WINDOW = 100;

export async function inboxRoutes(
  app: FastifyInstance,
  platform: Platform,
  verify: TokenVerifier,
) {
  const { authenticated } = authentication(platform, verify);
  const inbox = new Inbox(platform);
  const db = platform.db;

  // "customers" is the old name, kept at the HTTP boundary while the frontend moves over.
  for (const resource of ["contacts", "customers"]) {
    const root = `/projects/:projectId/${resource}`;

    const liveContact = async (projectId: string, contactId: string) => {
      const contact = await db.get("contacts", contactId);
      if (
        !contact ||
        contact.project_id !== projectId ||
        contact.status === "deleted"
      )
        throw notFound("Contact");
      return contact;
    };

    app.get(root, { preHandler: authenticated }, async (request) => {
      const { project } = await platform.project(
        p(request),
        uuidParam(request, "projectId"),
        "contacts.view",
      );
      const query = parse(limitQuery(200, 100), request.query);
      // Index: contacts (project_id, created_at desc).
      const contacts = await db.find("contacts", (q) =>
        q
          .where("project_id", "==", project._id)
          .orderBy("created_at", "desc")
          .limit(query.limit),
      );
      return contacts.filter((c) => c.status !== "deleted").map(dto);
    });

    app.get(
      `${root}/:contactId`,
      { preHandler: authenticated },
      async (request) => {
        const { project } = await platform.project(
          p(request),
          uuidParam(request, "projectId"),
          "contacts.view",
        );
        return dto(
          await liveContact(project._id, uuidParam(request, "contactId")),
        );
      },
    );

    app.get(
      `${root}/:contactId/history`,
      { preHandler: authenticated },
      async (request) => {
        const { project } = await platform.project(
          p(request),
          uuidParam(request, "projectId"),
          "contacts.view",
        );
        const contact = await liveContact(
          project._id,
          uuidParam(request, "contactId"),
        );
        // Index: conversations (project_id, contact_id, last_message_at desc).
        const conversations = await db.find("conversations", (q) =>
          q
            .where("project_id", "==", project._id)
            .where("contact_id", "==", contact._id)
            .orderBy("last_message_at", "desc")
            .limit(100),
        );
        return conversations.map((item) => ({
          ...conversationDto(item),
          lastMessageAt: item.last_message_at,
        }));
      },
    );

    app.post(root, { preHandler: authenticated }, async (request, reply) => {
      const input = parse(contactInput, request.body);
      const contact = await db.transaction(async (tx) => {
        const { org, project } = await platform.project(
          p(request),
          uuidParam(request, "projectId"),
          "contacts.manage",
          tx,
        );
        const now = new Date();
        const created: Contact = {
          _id: id(),
          project_id: project._id,
          ...defined(input),
          metadata: {},
          status: "active",
          created_at: now,
          updated_at: now,
        };
        tx.create("contacts", created);
        platform.audit(
          tx,
          p(request),
          org._id,
          "contact.created",
          "contact",
          created._id,
          undefined,
          project._id,
        );
        return created;
      });
      return reply.code(201).send(dto(contact));
    });

    app.patch(
      `${root}/:contactId`,
      { preHandler: authenticated },
      async (request) => {
        const input = parse(
          contactInput.extend({
            status: z.enum(["active", "blocked"]).optional(),
          }),
          request.body,
        );
        return db.transaction(async (tx) => {
          const { org, project } = await platform.project(
            p(request),
            uuidParam(request, "projectId"),
            "contacts.manage",
            tx,
          );
          const contact = await tx.get(
            "contacts",
            uuidParam(request, "contactId"),
          );
          if (
            !contact ||
            contact.project_id !== project._id ||
            !["active", "blocked"].includes(contact.status)
          )
            throw notFound("Contact");
          const changes = { ...defined(input), updated_at: new Date() };
          tx.update("contacts", contact._id, changes);
          platform.audit(
            tx,
            p(request),
            org._id,
            "contact.updated",
            "contact",
            contact._id,
            { after: { fields: Object.keys(input) } },
            project._id,
          );
          return dto({ ...contact, ...changes });
        });
      },
    );

    app.delete(
      `${root}/:contactId`,
      { preHandler: authenticated },
      async (request) => {
        await platform.project(
          p(request),
          uuidParam(request, "projectId"),
          "contacts.manage",
        );
        throw new AppError(
          "ERASURE_POLICY_REQUIRED",
          "Choose the contact-message erasure policy before enabling deletion.",
          409,
        );
      },
    );
  }

  const root = "/projects/:projectId/conversations";

  app.get(root, { preHandler: authenticated }, async (request) => {
    const { project } = await platform.project(
      p(request),
      uuidParam(request, "projectId"),
      "conversations.view",
    );
    const input = parse(
      z.object({
        limit: z.coerce.number().int().min(1).max(200).default(50),
        conversation_status: z
          .enum([
            "AI_ACTIVE",
            "WAITING_FOR_AGENT",
            "AGENT_ACTIVE",
            "RESOLVED",
            "CLOSED",
          ])
          .optional(),
        assigned_agent_id: z.uuid().optional(),
      }),
      request.query,
    );
    // Indexes: conversations (project_id[, status][, assigned_user_id], last_message_at desc).
    const conversations = await db.find("conversations", (q) => {
      let query = q.where("project_id", "==", project._id);
      if (input.conversation_status)
        query = query.where(
          "status",
          "==",
          input.conversation_status.toLowerCase(),
        );
      if (input.assigned_agent_id)
        query = query.where("assigned_user_id", "==", input.assigned_agent_id);
      return query.orderBy("last_message_at", "desc").limit(input.limit);
    });
    return conversations.map(conversationDto);
  });

  app.get(
    `${root}/:conversationId`,
    { preHandler: authenticated },
    async (request) => {
      const { project } = await platform.project(
        p(request),
        uuidParam(request, "projectId"),
        "conversations.view",
      );
      const conversation = await db.get(
        "conversations",
        uuidParam(request, "conversationId"),
      );
      if (!conversation || conversation.project_id !== project._id)
        throw notFound("Conversation");
      return conversationDto(conversation);
    },
  );

  // The latest `limit` messages, oldest first. next_cursor (the oldest message's id) asks for the page
  // before it with ?before=, so a long conversation can be read back to its start.
  app.get(
    `${root}/:conversationId/messages`,
    { preHandler: authenticated },
    async (request) => {
      const { project } = await platform.project(
        p(request),
        uuidParam(request, "projectId"),
        "conversations.view",
      );
      const input = parse(
        limitQuery(200, 100).extend({ before: z.uuid().optional() }),
        request.query,
      );
      const conversationId = uuidParam(request, "conversationId");
      const conversation = await db.get("conversations", conversationId);
      if (!conversation || conversation.project_id !== project._id)
        throw notFound("Conversation");
      const cursor = input.before
        ? await db.collection("messages").doc(input.before).get()
        : undefined;
      if (cursor && cursor.get("conversation_id") !== conversationId)
        throw notFound("Message");
      // Index: messages (conversation_id, created_at desc). One extra row tells whether more exist.
      const page = await db.find("messages", (q) => {
        let query = q
          .where("conversation_id", "==", conversationId)
          .orderBy("created_at", "desc");
        if (cursor?.exists) query = query.startAfter(cursor);
        return query.limit(input.limit + 1);
      });
      const items = page.slice(0, input.limit);
      const hasOlder = page.length > input.limit;
      return {
        items: items.reverse().map(messageDto),
        next_cursor: hasOlder ? items[0]!._id : null,
      };
    },
  );

  app.post(
    `${root}/:conversationId/messages`,
    { preHandler: authenticated },
    async (request) => {
      const input = parse(
        z.object({ content: z.string().trim().min(1).max(20000) }).strict(),
        request.body,
      );
      const message = await inbox.reply(
        p(request),
        uuidParam(request, "projectId"),
        uuidParam(request, "conversationId"),
        input.content,
      );
      return messageDto(message);
    },
  );

  for (const [action, to] of Object.entries(MOVES)) {
    app.post(
      `${root}/:conversationId/${action}`,
      { preHandler: authenticated },
      async (request) => {
        const input = parse(
          z
            .object({
              assigned_user_id: z.uuid().optional(),
              user_id: z.uuid().optional(),
              reason: z.string().max(2000).optional(),
            })
            .strict(),
          request.body ?? {},
        );
        const assignee =
          action === "claim"
            ? p(request).userId
            : (input.assigned_user_id ?? input.user_id);
        const conversation = await inbox.transition(
          p(request),
          uuidParam(request, "projectId"),
          uuidParam(request, "conversationId"),
          to,
          assignee,
          input.reason,
        );
        return conversationDto(conversation);
      },
    );
  }

  app.get("/notifications", { preHandler: authenticated }, async (request) => {
    const { user, org } = await platform.context(p(request));
    const input = parse(limitQuery(100, 20), request.query);
    const now = new Date();
    // Index: notifications (user_id, created_at desc). Expiry and organization are checked here.
    const recent = (
      await db.find("notifications", (q) =>
        q
          .where("user_id", "==", user._id)
          .orderBy("created_at", "desc")
          .limit(NOTIFICATION_WINDOW),
      )
    ).filter((n) => n.org_id === org._id && n.expires_at > now);
    return {
      items: recent.slice(0, input.limit).map((n) => ({
        ...dto(n),
        organization_id: n.org_id,
        organization_name: org.name,
        read: !!n.read_at,
        read_at: n.read_at ?? null,
      })),
      unread_count: recent.filter((n) => !n.read_at).length,
    };
  });

  // The bell's "Mark all as read": every unread one in the window the bell shows.
  app.post(
    "/notifications/read-all",
    { preHandler: authenticated },
    async (request) => {
      const { user, org } = await platform.context(p(request));
      const unread = (
        await db.find("notifications", (q) =>
          q
            .where("user_id", "==", user._id)
            .orderBy("created_at", "desc")
            .limit(NOTIFICATION_WINDOW),
        )
      ).filter((n) => n.org_id === org._id && !n.read_at);
      const now = new Date();
      await db.transaction(async (tx) => {
        for (const n of unread)
          tx.update("notifications", n._id, { read_at: now });
      });
      return { read: unread.length };
    },
  );

  app.post(
    "/notifications/:notificationId/read",
    { preHandler: authenticated },
    async (request) => {
      const { user, org } = await platform.context(p(request));
      const notificationId = uuidParam(request, "notificationId");
      const notification = await db.get("notifications", notificationId);
      if (
        !notification ||
        notification.user_id !== user._id ||
        notification.org_id !== org._id
      )
        throw notFound("Notification");
      await db.transaction(async (tx) => {
        tx.update("notifications", notificationId, { read_at: new Date() });
      });
      return { read: true };
    },
  );
}
