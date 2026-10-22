export type ThemeChoice = "light" | "dark" | "system";

/* index.html reads the same key before first paint, so keep them in sync. */
const STORAGE_KEY = "liftoff-theme";

/** Light is the default; dark or "match my device" only when someone picks it. */
export function getTheme(): ThemeChoice {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved === "dark" || saved === "system" ? saved : "light";
  } catch {
    return "light";
  }
}

export function applyTheme(choice: ThemeChoice = getTheme()) {
  const systemDark = window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false;
  const dark = choice === "dark" || (choice === "system" && systemDark);
  document.documentElement.classList.toggle("dark", dark);
}

export function setTheme(choice: ThemeChoice) {
  try {
    localStorage.setItem(STORAGE_KEY, choice);
  } catch {
    // Storage can be blocked; the choice still applies for this visit.
  }
  applyTheme(choice);
}

/** Keeps "match my device" in step when the operating system switches. */
export function watchSystemTheme() {
  window
    .matchMedia?.("(prefers-color-scheme: dark)")
    .addEventListener("change", () => applyTheme());
}
