import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import ApprovalsDashboard, { type ApprovalsDashboardProps } from "../ApprovalsDashboard.tsx";

import type { JoinRequest } from "../../../shared/types.ts";

const pending: JoinRequest = {
  id: "org1_user2",
  user_id: "user2",
  email: "sam@example.com",
  display_name: "Sam Rivera",
  status: "PENDING",
  requested_at: new Date().toISOString(),
  reviewed_at: null,
};

const renderDashboard = (props: Partial<ApprovalsDashboardProps> = {}) =>
  render(
    <ApprovalsDashboard
      membership={{ role: "PRIME" }}
      joinRequests={[pending]}
      canManage
      onReview={vi.fn()}
      {...props}
    />,
  );

describe("ApprovalsDashboard", () => {
  it("approves in one click, defaulting to the Agent role", async () => {
    const onReview = vi.fn().mockResolvedValue({});
    renderDashboard({ onReview });

    await userEvent.click(screen.getByRole("button", { name: "Approve" }));

    expect(onReview).toHaveBeenCalledWith("org1_user2", "APPROVED", "AGENT");
  });

  it("sends the role the manager picked instead of the default", async () => {
    const onReview = vi.fn().mockResolvedValue({});
    renderDashboard({ onReview });

    await userEvent.selectOptions(screen.getByLabelText("Role"), "ADMIN");
    await userEvent.click(screen.getByRole("button", { name: "Approve" }));

    expect(onReview).toHaveBeenCalledWith("org1_user2", "APPROVED", "ADMIN");
  });

  /* This is the regression that made approval look broken: the old row awaited
     onReview in a try/finally with no catch, so a failure vanished entirely. */
  it("shows the failure on the row when the decision cannot be saved", async () => {
    const onReview = vi.fn().mockRejectedValue(new Error("You do not have permission."));
    renderDashboard({ onReview });

    await userEvent.click(screen.getByRole("button", { name: "Approve" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("You do not have permission.");
    // ...and the button must return to a usable state rather than stay stuck.
    await waitFor(() => expect(screen.getByRole("button", { name: "Approve" })).toBeEnabled());
  });

  it("offers Owner only to Prime", () => {
    const { unmount } = renderDashboard({ membership: { role: "PRIME" } });
    expect(screen.getByRole("option", { name: "Owner" })).toBeInTheDocument();
    unmount();

    renderDashboard({ membership: { role: "ADMIN" } });
    expect(screen.queryByRole("option", { name: "Owner" })).not.toBeInTheDocument();
  });

  it("tells a member without permission that they cannot review", () => {
    renderDashboard({ canManage: false });
    expect(screen.getByText(/Only Prime and delegated managers/)).toBeInTheDocument();
  });

  it("shows an empty state rather than an empty panel", () => {
    renderDashboard({ joinRequests: [] });
    expect(screen.getByText(/No one is waiting for access/)).toBeInTheDocument();
  });
});
