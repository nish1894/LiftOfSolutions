import { useSearchParams } from "react-router-dom";

/* Sub-sections inside a settings page (e.g. Account → Profile, Security): a
   segmented row under the Settings tabs, content capped at a readable width.
   Pass these to Tabs, TabsList and TabsTrigger. */

export const SETTINGS_TABS = "gap-6 [&>[role=tabpanel]]:max-w-3xl";

export const SETTINGS_NAV = "";

export const SETTINGS_TRIGGER = "[&_svg]:size-4";

/* The Settings page links (General, Team, Billing, Account) look like the
   underline tabs in ui/tabs.tsx, but are links between routes. */
export const SETTINGS_LINKS =
  "mb-6 flex h-11 w-full max-w-full items-stretch gap-6 overflow-x-auto overflow-y-hidden border-b text-subtle-foreground";

export const SETTINGS_LINK =
  "-mb-px inline-flex items-center gap-2 rounded-t-sm border-b-2 border-transparent px-1.5 text-sm font-medium whitespace-nowrap transition-colors outline-none hover:text-foreground focus-visible:text-foreground focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring aria-[current=page]:border-primary aria-[current=page]:text-primary";

/* The open sub-section is kept in the URL (?tab=preferences), so a reload or a
   shared link opens the same one. Anything not in `tabs` opens the first. */
export function useTabParam<T extends string>(tabs: readonly T[]) {
  const [params, setParams] = useSearchParams();
  const requested = params.get("tab");
  const tab = tabs.find((item) => item === requested) ?? tabs[0]!;
  const setTab = (value: string) =>
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        next.set("tab", value);
        return next;
      },
      { replace: true },
    );
  return [tab, setTab] as const;
}
