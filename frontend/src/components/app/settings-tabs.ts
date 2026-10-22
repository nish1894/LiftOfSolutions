/* Settings pages reuse the Tabs component, laid out like shadcn-admin's
   settings menu (MIT): a vertical list beside the content on wide screens and
   a scrollable row on phones. Pass these to Tabs, TabsList and TabsTrigger. */

export const SETTINGS_TABS =
  "gap-6 lg:flex-row lg:items-start lg:gap-10 [&>[role=tabpanel]]:min-w-0 [&>[role=tabpanel]]:max-w-3xl";

export const SETTINGS_NAV =
  "h-auto w-full shrink-0 justify-start gap-1 bg-transparent p-0 lg:sticky lg:top-20 lg:w-52 lg:flex-col lg:items-stretch";

export const SETTINGS_TRIGGER =
  "h-9 flex-none justify-start gap-2 px-3 text-muted-foreground [&_svg]:size-4 hover:bg-muted data-[state=active]:bg-muted data-[state=active]:text-foreground data-[state=active]:shadow-none dark:data-[state=active]:border-transparent dark:data-[state=active]:bg-muted";
