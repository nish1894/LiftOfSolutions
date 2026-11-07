import { afterEach, describe, expect, it, vi } from "vitest";

import { apiRequest } from "../client.ts";

vi.mock("../../firebase.ts", () => ({
  firebaseAuth: { authStateReady: async () => {}, currentUser: null },
}));

function answer(status: number, message: string) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => Response.json({ error: { message, code: "x" } }, { status })),
  );
}

describe("apiRequest error messages", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("keeps the API's own message for a 4xx", async () => {
    answer(409, "That URL name is already taken.");
    await expect(apiRequest("/v1/x")).rejects.toThrow("That URL name is already taken.");
  });

  it("hides a 5xx message, which can come from another service", async () => {
    answer(502, "upstream: connection refused at 10.0.0.4:8080");
    await expect(apiRequest("/v1/x")).rejects.toThrow(
      "Something went wrong on our side. Try again in a moment.",
    );
  });

  it("replaces the browser's network error text", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("Failed to fetch");
      }),
    );
    await expect(apiRequest("/v1/x")).rejects.toThrow("We couldn't reach the server.");
  });
});
