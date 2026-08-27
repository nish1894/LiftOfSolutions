import { describe, expect, it } from "vitest";
import { ALL_PERMISSIONS, permissionsFor } from "../src/permissions/catalog.js";

describe("role permission bundles", () => {
  it("gives Prime every permission", () =>
    expect([...permissionsFor("PRIME")].sort()).toEqual(
      [...ALL_PERMISSIONS].sort(),
    ));
  it("keeps billing management away from administrators", () =>
    expect(permissionsFor("ADMIN").has("billing.manage")).toBe(false));
  it("lets agents reply without managing agents", () => {
    expect(permissionsFor("AGENT").has("conversations.reply")).toBe(true);
    expect(permissionsFor("AGENT").has("agents.publish")).toBe(false);
  });
  it("defaults unknown roles to no access", () =>
    expect(permissionsFor("UNKNOWN").size).toBe(0));
});
