import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import type { Database } from "../../src/firestore/database.js";
import { createHarness, emulator } from "./harness.js";

// The emulator queues overlapping transactions slowly, so the concurrency tests need more than 5 s.
describe.skipIf(!emulator)(
  "Firestore platform (emulator)",
  { timeout: 20_000 },
  () => {
    const h = createHarness();
    const {
      tokens,
      token,
      request,
      count,
      copyExists,
      acceptTerms,
      onboard,
      join,
      newProject,
    } = h;
    let db: Database, app: FastifyInstance;
    beforeAll(async () => {
      await h.start();
      ({ db, app } = h);
    }, 30000);
    afterAll(() => h.stop());

    it("creates one UUID user, organization, billing account and grant under concurrent onboarding", async () => {
      token("race");
      const responses = await Promise.all(
        Array.from({ length: 5 }, () =>
          request("POST", "/auth/onboard", "race", {}),
        ),
      );
      for (const response of responses)
        expect(response.statusCode, response.body).toBe(200);
      const ids = new Set(responses.map((r) => r.json().user.id));
      expect(ids.size).toBe(1);
      const userId = responses[0]!.json().user.id,
        orgId = responses[0]!.json().memberships[0].organization_id;
      expect(userId).toMatch(/^[a-f0-9-]{36}$/);
      expect(await count("auth_identities", "subject", "race")).toBe(1);
      expect(await count("organizations", "created_by", userId)).toBe(1);
      expect(await count("credit_ledger", "org_id", orgId)).toBe(1);
      expect(
        (await db.get("billing_accounts", orgId))?.included_credits_left,
      ).toBe(1000);
    });

    it("requires explicit terms acceptance and never caches suspended user status", async () => {
      token("terms");
      const account = (
        await request("POST", "/auth/onboard", "terms", {})
      ).json();
      expect(
        (
          await request(
            "GET",
            `/organizations/${account.memberships[0].organization_id}/projects`,
            "terms",
          )
        ).statusCode,
      ).toBe(403);
      expect(
        (
          await request("POST", "/auth/terms", "terms", {
            accepted: true,
            version: "old",
          })
        ).statusCode,
      ).toBe(409);
      await acceptTerms("terms");
      await db
        .collection("users")
        .doc(account.user.id)
        .update({ status: "suspended" });
      expect((await request("GET", "/auth/me", "terms")).statusCode).toBe(403);
    });

    it("returns a client error for malformed JSON instead of a server error", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/api/v1/auth/onboard",
        headers: { "content-type": "application/json" },
        payload: "{",
      });
      expect(response.statusCode).toBe(400);
      expect(response.json().error.code).toBe("bad_request");
    });

    it("never links a different identity by matching email", async () => {
      await onboard("existing");
      token("different", true, "existing@example.test");
      const response = await request("POST", "/auth/onboard", "different", {});
      expect(response.statusCode, response.body).toBe(409);
      expect(await count("auth_identities", "subject", "different")).toBe(0);
    });

    it("isolates tenants and enforces project limits under simultaneous writes", async () => {
      const a = await onboard("ownerA"),
        b = await onboard("ownerB");
      expect(
        (await request("GET", `/organizations/${a.org}`, "ownerB")).statusCode,
      ).toBe(404);
      const replies = await Promise.all(
        Array.from({ length: 5 }, (_, i) =>
          request("POST", `/organizations/${a.org}/projects`, "ownerA", {
            name: `Project ${i}`,
          }),
        ),
      );
      expect(replies.filter((r) => r.statusCode === 201)).toHaveLength(3);
      expect(replies.filter((r) => r.statusCode === 409)).toHaveLength(2);
      const project = replies.find((r) => r.statusCode === 201)!.json();
      expect(
        (await request("GET", `/projects/${project.id}`, "ownerB")).statusCode,
      ).toBe(404);
      expect(await count("projects", "org_id", b.org)).toBe(0);
    });

    it("requires verified matching invite email, moves solo membership atomically, consumes once", async () => {
      const owner = await onboard("inviter");
      const newcomer = await onboard("invitee", false);
      const invitation = await request(
        "POST",
        `/organizations/${owner.org}/invitations`,
        "inviter",
        { email: "invitee@example.test", role: "member" },
      );
      expect(invitation.statusCode, invitation.body).toBe(200);
      const raw = invitation.json().invitation_token;
      expect(
        JSON.stringify(await db.get("invitations", invitation.json().id)),
      ).not.toContain(raw);
      const accept = () =>
        request("POST", "/auth/invitations/accept", "invitee", { token: raw });
      expect((await accept()).statusCode).toBe(403);
      token("invitee", true);
      const accepted = await accept();
      expect(accepted.statusCode, accepted.body).toBe(200);
      expect((await db.get("users", newcomer.id))?.membership.org_id).toBe(
        owner.org,
      );
      expect((await db.get("organizations", newcomer.org))?.status).toBe(
        "deleted",
      );
      expect((await accept()).statusCode).toBe(409);
    });

    it("joins an invitation directly at first sign-in without creating a temporary organization", async () => {
      const owner = await onboard("direct-inviter");
      const invitation = await request(
        "POST",
        `/organizations/${owner.org}/invitations`,
        "direct-inviter",
        { email: "direct-joiner@example.test", role: "member" },
      );
      token("direct-joiner");
      const response = await request("POST", "/auth/onboard", "direct-joiner", {
        invitation_token: invitation.json().invitation_token,
      });
      expect(response.statusCode, response.body).toBe(200);
      expect(response.json().memberships[0].organization_id).toBe(owner.org);
      expect(
        await count("organizations", "created_by", response.json().user.id),
      ).toBe(0);
      expect((await db.get("invitations", invitation.json().id))?.status).toBe(
        "accepted",
      );
    });

    it("rolls back a refused invite move and keeps the token pending", async () => {
      const a = await onboard("full-owner"),
        b = await onboard("moving-owner");
      // A paid subscription on the old organization refuses the move after both organizations are locked.
      await db
        .collection("billing_accounts")
        .doc(b.org)
        .update({ subscription: { status: "active" } });
      const invitation = await request(
        "POST",
        `/organizations/${a.org}/invitations`,
        "full-owner",
        { email: "moving-owner@example.test", role: "member" },
      );
      const response = await request(
        "POST",
        "/auth/invitations/accept",
        "moving-owner",
        { token: invitation.json().invitation_token },
      );
      expect(response.statusCode, response.body).toBe(409);
      expect((await db.get("users", b.id))?.membership.org_id).toBe(b.org);
      expect((await db.get("invitations", invitation.json().id))?.status).toBe(
        "pending",
      );
      expect((await db.get("organizations", b.org))?.status).toBe("active");
    });

    it("leaves the joiner's projects behind and keeps members from creating projects", async () => {
      const a = await onboard("joining-owner"),
        b = await onboard("joiner");
      const ownId = await newProject("joiner", b.org);
      const invitation = await request(
        "POST",
        `/organizations/${a.org}/invitations`,
        "joining-owner",
        { email: "joiner@example.test", role: "member" },
      );
      const preview = await request(
        "POST",
        "/auth/invitations/preview",
        "joiner",
        {
          token: invitation.json().invitation_token,
        },
      );
      expect(preview.statusCode, preview.body).toBe(200);
      expect(preview.json()).toMatchObject({
        role: "AGENT",
        projects_left_behind: 1,
        already_member: false,
      });
      // Previewing changes nothing.
      expect((await db.get("users", b.id))?.membership.org_id).toBe(b.org);
      const accepted = await request(
        "POST",
        "/auth/invitations/accept",
        "joiner",
        {
          token: invitation.json().invitation_token,
        },
      );
      expect(accepted.statusCode, accepted.body).toBe(200);
      expect(await count("projects", "org_id", a.org)).toBe(0);
      expect((await db.get("projects", ownId))?.org_id).toBe(b.org);
      expect(
        (await request("GET", `/projects/${ownId}`, "joiner")).statusCode,
      ).toBe(404);
      expect(await copyExists(ownId, b.id)).toBe(false);
      const refused = await request(
        "POST",
        `/organizations/${a.org}/projects`,
        "joiner",
        {
          name: "Member's project",
        },
      );
      expect(refused.statusCode, refused.body).toBe(403);
    });

    it("prevents last-owner demotion and rolls back its audit write", async () => {
      const owner = await onboard("last-owner");
      const before = await count("audit_events", "org_id", owner.org);
      const response = await request(
        "PATCH",
        `/organizations/${owner.org}/members/${owner.id}`,
        "last-owner",
        { role: "member" },
      );
      expect(response.statusCode, response.body).toBe(409);
      expect((await db.get("users", owner.id))?.membership.role).toBe("owner");
      expect(await count("audit_events", "org_id", owner.org)).toBe(before);
    });

    it("denies unsupported Firebase providers at the organization boundary", async () => {
      await onboard("provider");
      tokens.get("provider")!.firebase.sign_in_provider = "anonymous";
      expect((await request("GET", "/auth/me", "provider")).statusCode).toBe(
        403,
      );
    });

    it("keeps organization-level permissions free of project permissions", async () => {
      const boss = await onboard("perm-owner");
      const staffId = await join("perm-owner", boss.org, "perm-staff");
      const projectId = await newProject("perm-owner", boss.org);
      await request("PUT", `/projects/${projectId}/access`, "perm-owner", {
        member: { user_id: staffId, grants: [], denies: [] },
      });
      const me = await request("GET", "/auth/me", "perm-staff");
      expect(me.statusCode, me.body).toBe(200);
      expect(me.json().memberships[0].effective_permissions).not.toContain(
        "conversations.reply",
      );
      expect(me.json().projects[0].effective_permissions).toContain(
        "conversations.reply",
      );
    });

    it("keeps the RAG's project_members copies in step with who can use a project", async () => {
      const boss = await onboard("copy-owner");
      const projectId = await newProject("copy-owner", boss.org);
      expect(await copyExists(projectId, boss.id)).toBe(true);

      // A member sees only projects they are added to.
      const staffId = await join("copy-owner", boss.org, "copy-staff");
      expect(await copyExists(projectId, staffId)).toBe(false);
      const access = (payload: object) =>
        request("PUT", `/projects/${projectId}/access`, "copy-owner", payload);
      expect(
        (await access({ member: { user_id: staffId, grants: [], denies: [] } }))
          .statusCode,
      ).toBe(200);
      expect(await copyExists(projectId, staffId)).toBe(true);
      expect((await access({ remove_user_id: staffId })).statusCode).toBe(200);
      expect(await copyExists(projectId, staffId)).toBe(false);

      // Admins see every project, so the role change alone gives or takes the copy.
      const role = (value: string) =>
        request(
          "PATCH",
          `/organizations/${boss.org}/members/${staffId}`,
          "copy-owner",
          { role: value },
        );
      expect((await role("admin")).statusCode).toBe(200);
      expect(await copyExists(projectId, staffId)).toBe(true);
      expect((await role("member")).statusCode).toBe(200);
      expect(await copyExists(projectId, staffId)).toBe(false);

      // An admin joining gets a copy for every project; one removed from the organization loses it.
      const adminId = await join("copy-owner", boss.org, "copy-admin", "admin");
      expect(await copyExists(projectId, adminId)).toBe(true);
      const removed = await request(
        "DELETE",
        `/organizations/${boss.org}/members/${adminId}`,
        "copy-owner",
      );
      expect(removed.statusCode, removed.body).toBe(200);
      expect(await copyExists(projectId, adminId)).toBe(false);

      // Closing the organization moves everyone out, so no copy is left.
      const closed = await request(
        "POST",
        `/organizations/${boss.org}/close`,
        "copy-owner",
        { confirm: true },
      );
      expect(closed.statusCode, closed.body).toBe(200);
      expect(await count("project_members", "project_id", projectId)).toBe(0);
    });

    it("keeps organization slugs unique", async () => {
      const a = await onboard("slug-a"),
        b = await onboard("slug-b");
      const rename = (who: string, org: string, slug: string) =>
        request("PATCH", `/organizations/${org}`, who, { slug });
      expect((await rename("slug-a", a.org, "acme")).statusCode).toBe(200);
      expect((await rename("slug-b", b.org, "acme")).statusCode).toBe(409);
      expect((await rename("slug-a", a.org, "acme-labs")).statusCode).toBe(200);
      expect((await rename("slug-b", b.org, "acme")).statusCode).toBe(200);
    });
  },
);
