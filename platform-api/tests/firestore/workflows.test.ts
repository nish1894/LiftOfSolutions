import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createHarness, emulator } from "./harness.js";

describe.skipIf(!emulator)(
  "Firestore workflows (emulator)",
  { timeout: 20_000 },
  () => {
    let h: ReturnType<typeof createHarness>;

    beforeAll(async () => {
      h = createHarness();
      await h.start();
    }, 30000);
    afterAll(async () => {
      await h.stop();
    });

    // The "AI agent first" template's trigger and steps, as the frontend sends them.
    const template = {
      name: "AI agent first",
      trigger: "conversation_opened",
      steps: [
        { id: "s1", type: "hand_to_agent" },
        {
          id: "s2",
          type: "branch",
          condition: "business_hours",
          yes: [{ id: "s3", type: "assign", to: "round_robin" }],
          no: [{ id: "s4", type: "send_message", text: "We're closed." }],
        },
      ],
      template_id: "ai-first",
    };

    it("creates from a template, saves, turns on only when complete, and deletes", async () => {
      const owner = await h.onboard("flow-owner");
      const projectId = await h.newProject("flow-owner", owner.org);
      const root = `/projects/${projectId}/workflows`;
      const staffId = await h.join("flow-owner", owner.org, "flow-staff");
      await h.request("PUT", `/projects/${projectId}/access`, "flow-owner", {
        member: { user_id: staffId, grants: [], denies: [] },
      });

      const created = await h.request("POST", root, "flow-owner", template);
      expect(created.statusCode, created.body).toBe(201);
      const workflow = created.json();
      expect(workflow).toMatchObject({
        status: "off",
        version: 1,
        template_id: "ai-first",
        incomplete: "Pick the agent for each “Hand to an AI agent” step.",
      });
      const early = await h.request(
        "POST",
        `${root}/${workflow.id}/turn-on`,
        "flow-owner",
      );
      expect(early.json().error.code).toBe("workflow_incomplete");

      const unknownAgent = await h.request(
        "PATCH",
        `${root}/${workflow.id}`,
        "flow-owner",
        {
          ...template,
          steps: [
            {
              id: "s1",
              type: "hand_to_agent",
              assistant_id: crypto.randomUUID(),
            },
          ],
          expected_version: 1,
        },
      );
      expect(unknownAgent.statusCode).toBe(404);

      const agent = (
        await h.request(
          "POST",
          `/projects/${projectId}/assistants`,
          "flow-owner",
          {
            name: "Front desk",
          },
        )
      ).json();
      const steps = [
        { id: "s1", type: "hand_to_agent", assistant_id: agent.id },
        { id: "s2", type: "assign", to: "member", member_id: staffId },
      ];
      const saved = await h.request(
        "PATCH",
        `${root}/${workflow.id}`,
        "flow-owner",
        { ...template, steps, expected_version: 1 },
      );
      expect(saved.statusCode, saved.body).toBe(200);
      expect(saved.json()).toMatchObject({ version: 2, incomplete: null });
      const stale = await h.request(
        "PATCH",
        `${root}/${workflow.id}`,
        "flow-owner",
        { ...template, steps, expected_version: 1 },
      );
      expect(stale.json().error.code).toBe("version_conflict");

      const on = await h.request(
        "POST",
        `${root}/${workflow.id}/turn-on`,
        "flow-owner",
      );
      expect(on.json()).toMatchObject({ status: "on" });
      const unfinished = await h.request(
        "PATCH",
        `${root}/${workflow.id}`,
        "flow-owner",
        {
          ...template,
          steps: [{ id: "s1", type: "assign", to: "member" }],
          expected_version: 2,
        },
      );
      expect(unfinished.json().error.code).toBe("workflow_incomplete");

      // Members see workflows but can't change them.
      expect((await h.request("GET", root, "flow-staff")).json()).toHaveLength(
        1,
      );
      expect(
        (
          await h.request(
            "POST",
            `${root}/${workflow.id}/turn-off`,
            "flow-staff",
          )
        ).statusCode,
      ).toBe(403);

      await h.request("POST", `${root}/${workflow.id}/turn-off`, "flow-owner");
      const deleted = await h.request(
        "DELETE",
        `${root}/${workflow.id}`,
        "flow-owner",
      );
      expect(deleted.json()).toEqual({ deleted: true });
      expect(
        (await h.request("GET", `${root}/${workflow.id}`, "flow-owner"))
          .statusCode,
      ).toBe(404);
      expect(await h.count("audit_events", "resource_id", workflow.id)).toBe(5);
    });

    it("refuses a branch inside a branch, too many steps, and someone who can't reply", async () => {
      const owner = await h.onboard("flow-rules");
      const projectId = await h.newProject("flow-rules", owner.org);
      const root = `/projects/${projectId}/workflows`;
      const outsiderId = await h.join("flow-rules", owner.org, "flow-outsider");

      const nested = await h.request("POST", root, "flow-rules", {
        ...template,
        steps: [{ ...template.steps[1], yes: [template.steps[1]] }],
      });
      expect(nested.statusCode).toBe(422);

      const many = Array.from({ length: 31 }, (_, index) => ({
        id: `w${index}`,
        type: "wait",
        minutes: 5,
      }));
      const tooMany = await h.request("POST", root, "flow-rules", {
        ...template,
        steps: many,
      });
      expect(tooMany.json().error.code).toBe("too_many_steps");

      // A member not added to the project can't reply in it.
      const outsider = await h.request("POST", root, "flow-rules", {
        ...template,
        steps: [
          { id: "s1", type: "assign", to: "member", member_id: outsiderId },
        ],
      });
      expect(outsider.statusCode).toBe(404);
    });
  },
);
