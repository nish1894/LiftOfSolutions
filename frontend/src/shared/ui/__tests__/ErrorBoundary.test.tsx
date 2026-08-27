import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import ErrorBoundary from "../ErrorBoundary.jsx";

function Boom({ shouldThrow }: { shouldThrow: boolean }) {
  if (shouldThrow) throw new Error("render exploded");
  return <p>recovered content</p>;
}

describe("ErrorBoundary", () => {
  // React logs caught render errors to console.error; silence it so a passing
  // run stays readable.
  beforeEach(() => vi.spyOn(console, "error").mockImplementation(() => {}));
  afterEach(() => vi.restoreAllMocks());

  it("shows the error instead of a blank page", () => {
    render(
      <ErrorBoundary>
        <Boom shouldThrow />
      </ErrorBoundary>,
    );
    expect(screen.getByRole("alert")).toHaveTextContent("Something broke on this screen");
    expect(screen.getByText("render exploded")).toBeInTheDocument();
  });

  it("renders children untouched when nothing throws", () => {
    render(
      <ErrorBoundary>
        <Boom shouldThrow={false} />
      </ErrorBoundary>,
    );
    expect(screen.getByText("recovered content")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("retries without a full page reload", async () => {
    let fixed = false;
    function Flaky() {
      if (!fixed) throw new Error("still broken");
      return <p>recovered content</p>;
    }

    render(
      <ErrorBoundary>
        <Flaky />
      </ErrorBoundary>,
    );
    expect(screen.getByRole("alert")).toBeInTheDocument();

    fixed = true;
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));

    expect(screen.getByText("recovered content")).toBeInTheDocument();
  });
});
