import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { hashToken, safeEqual } from "../src/common/security.js";

describe("public widget token security", () => {
  it("uses deterministic HMAC-SHA256 hashes", () => {
    const expected = createHmac("sha256", "secret")
      .update("token")
      .digest("hex");
    expect(hashToken("token", "secret")).toBe(expected);
  });
  it("compares equal values safely", () => {
    expect(safeEqual("widget", "widget")).toBe(true);
    expect(safeEqual("widget", "other")).toBe(false);
  });
});
