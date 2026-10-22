import { useSyncExternalStore } from "react";

/* Matches Tailwind's md breakpoint: below it the sidebar becomes a sheet and
   the bottom tab bar appears. */
const QUERY = "(max-width: 767px)";

function subscribe(onChange: () => void) {
  const media = window.matchMedia?.(QUERY);
  media?.addEventListener("change", onChange);
  return () => media?.removeEventListener("change", onChange);
}

const getSnapshot = () => window.matchMedia?.(QUERY).matches ?? false;

export function useIsMobile(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}
