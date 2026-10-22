import { afterEach, describe, expect, it } from "vitest";

import { getTheme, setTheme } from "../theme.ts";

describe("theme", () => {
  afterEach(() => {
    localStorage.clear();
    document.documentElement.classList.remove("dark");
  });

  it("defaults to light when nothing was chosen", () => {
    expect(getTheme()).toBe("light");
  });

  it("ignores values it doesn't know", () => {
    localStorage.setItem("liftoff-theme", "sepia");
    expect(getTheme()).toBe("light");
  });

  it("remembers dark and applies it", () => {
    setTheme("dark");
    expect(getTheme()).toBe("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });

  it("remembers 'match my device' as its own choice", () => {
    setTheme("system");
    expect(getTheme()).toBe("system");
  });

  it("switching back to light removes dark", () => {
    setTheme("dark");
    setTheme("light");
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });
});
