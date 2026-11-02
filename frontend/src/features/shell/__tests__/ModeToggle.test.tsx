import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { getTheme, setTheme } from "@/shared/theme.ts";

import ModeToggle from "../ModeToggle.tsx";

afterEach(() => {
  cleanup();
  localStorage.clear();
  document.documentElement.classList.remove("dark");
  vi.unstubAllGlobals();
});

describe("theme switch", () => {
  it("switches to dark and back using the saved theme choice", async () => {
    const user = userEvent.setup();
    render(<ModeToggle />);
    const control = screen.getByRole("switch", { name: "Dark mode" });

    expect(control).toHaveAttribute("aria-checked", "false");
    await user.click(control);
    await waitFor(() => expect(control).toHaveAttribute("aria-checked", "true"));
    expect(getTheme()).toBe("dark");

    await user.click(control);
    await waitFor(() => expect(control).toHaveAttribute("aria-checked", "false"));
    expect(getTheme()).toBe("light");
  });

  it("responds when another existing control changes the theme", async () => {
    render(<ModeToggle />);

    await act(async () => setTheme("dark"));
    expect(screen.getByRole("switch", { name: "Dark mode" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
  });

  it("can be toggled with the keyboard", async () => {
    const user = userEvent.setup();
    render(<ModeToggle />);
    await user.tab();
    expect(screen.getByRole("switch", { name: "Dark mode" })).toHaveFocus();

    await user.keyboard(" ");
    await waitFor(() => expect(getTheme()).toBe("dark"));
  });

  it("retains System mode and reflects its resolved dark appearance", async () => {
    vi.stubGlobal("matchMedia", vi.fn().mockReturnValue({ matches: true }));
    const user = userEvent.setup();
    render(<ModeToggle />);

    await user.click(screen.getByRole("button", { name: "Change theme" }));
    await user.click(screen.getByRole("menuitem", { name: "System" }));

    expect(getTheme()).toBe("system");
    await waitFor(() =>
      expect(screen.getByRole("switch", { name: "Dark mode" })).toHaveAttribute(
        "aria-checked",
        "true",
      ),
    );
  });
});
