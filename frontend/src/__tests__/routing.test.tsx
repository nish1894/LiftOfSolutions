import { describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";

import { renderWithProviders } from "../test/utils.jsx";

const mockAuth = vi.fn();
vi.mock("../features/auth/AuthContext.ts", () => ({ useAuth: () => mockAuth() }));
// The router is what is under test here, not the network.
vi.mock("../shared/api/client.ts", () => ({
  apiRequest: vi.fn().mockResolvedValue([]),
  apiRequestOptional: vi.fn().mockResolvedValue([]),
  ApiError: class ApiError extends Error {},
}));

const { default: App } = await import("../App.jsx");

import type { AuthValue } from "../features/auth/AuthContext.ts";
import type { User } from "../shared/types.ts";

const signedOut: AuthValue = {
  user: null,
  memberships: [],
  joinRequests: [],
  loading: false,
  signIn: vi.fn(),
  signUp: vi.fn(),
  signInWithOAuth: vi.fn(),
  resetPassword: vi.fn(),
  signOut: vi.fn(),
  refreshAuth: vi.fn(),
  resendVerification: vi.fn(),
  saveProfile: vi.fn(),
  signOutEverywhere: vi.fn(),
};

const fakeUser: User = {
  id: "user1",
  uid: "user1",
  email: "sam@example.com",
  display_name: "Sam",
  photo_url: null,
  phone: null,
  job_title: null,
  bio: null,
  timezone: "UTC",
  locale: "en",
  preferences: { email_notifications: true, product_updates: false },
  default_organization_id: null,
  email_verified: true,
  created_at: null,
};

const renderAt = (path: string, auth: AuthValue = signedOut) => {
  mockAuth.mockReturnValue(auth);
  return renderWithProviders(<App />, { route: path });
};

describe("routing", () => {
  it("lands on the homepage at /", () => {
    renderAt("/");
    expect(screen.getByRole("heading", { level: 1 })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Get started" })).toHaveAttribute("href", "/signin");
  });

  /* The reported bug: opening the site while signed in skipped the homepage.
     The homepage is now the landing screen for everyone. */
  it("still lands on the homepage when a session is restored", () => {
    renderAt("/", { ...signedOut, user: fakeUser });
    expect(screen.getByRole("link", { name: "Go to dashboard" })).toHaveAttribute("href", "/app");
  });

  it("sends a signed-out visitor from /app to sign-in", () => {
    renderAt("/app/overview");
    expect(screen.getByRole("heading", { name: /sign in|welcome/i })).toBeInTheDocument();
  });

  it("keeps a signed-in user away from the sign-in page", () => {
    renderAt("/signin", { ...signedOut, user: fakeUser });
    expect(screen.queryByLabelText(/password/i)).not.toBeInTheDocument();
  });

  it("falls back to the homepage for an unknown URL", () => {
    renderAt("/does-not-exist");
    expect(screen.getByRole("link", { name: "Get started" })).toBeInTheDocument();
  });
});
