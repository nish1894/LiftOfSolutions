import { useRef } from "react";

/* Radix returns focus to a DialogTrigger when a dialog closes. Dialogs opened
   another way (⌘K, the mobile menu and "More" buttons) have none, so focus fell
   to the page. Spread these onto the DialogContent: they remember what had
   focus when it opened and go back there, if it's still on the page. */
export function useReturnFocus() {
  const opener = useRef<HTMLElement | null>(null);
  return {
    onOpenAutoFocus: () => {
      opener.current =
        document.activeElement instanceof HTMLElement ? document.activeElement : null;
    },
    onCloseAutoFocus: (event: Event) => {
      const target = opener.current;
      if (!target || target === document.body || !document.contains(target)) return;
      event.preventDefault();
      target.focus();
    },
  };
}
