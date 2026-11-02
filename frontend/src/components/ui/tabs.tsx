import type { ComponentProps } from "react";
import { Tabs as TabsPrimitive } from "radix-ui";

import { cn } from "@/lib/utils.ts";

/* Two tab looks from the design:
   - segmented (default): a slate track with a white raised selection, for filters such as All / Urgent / Mine;
   - underline: text tabs with an indigo bar, for page sections such as Settings or Analytics. */

type Variant = "segmented" | "underline";

export function Tabs({ className, ...props }: ComponentProps<typeof TabsPrimitive.Root>) {
  return <TabsPrimitive.Root className={cn("flex flex-col gap-4", className)} {...props} />;
}

const LIST: Record<Variant, string> = {
  segmented:
    "inline-flex h-9 w-fit max-w-full items-center gap-0.5 overflow-x-auto rounded-lg bg-muted p-1 text-subtle-foreground",
  underline:
    "flex h-11 w-full max-w-full items-stretch gap-6 overflow-x-auto overflow-y-hidden border-b text-subtle-foreground",
};

const TRIGGER: Record<Variant, string> = {
  segmented:
    "inline-flex h-full items-center justify-center gap-1.5 rounded-md px-3 text-sm font-medium whitespace-nowrap transition-colors outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 data-[state=active]:bg-card data-[state=active]:text-primary data-[state=active]:shadow-xs",
  underline:
    "-mb-px inline-flex items-center gap-2 rounded-t-sm border-b-2 border-transparent px-1.5 text-sm font-medium whitespace-nowrap transition-colors outline-none hover:text-foreground focus-visible:text-foreground focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 data-[state=active]:border-primary data-[state=active]:text-primary [&_svg]:size-4",
};

export function TabsList({
  className,
  variant = "segmented",
  ...props
}: ComponentProps<typeof TabsPrimitive.List> & { variant?: Variant }) {
  return (
    <TabsPrimitive.List
      data-variant={variant}
      className={cn(LIST[variant], className)}
      {...props}
    />
  );
}

export function TabsTrigger({
  className,
  variant = "segmented",
  ...props
}: ComponentProps<typeof TabsPrimitive.Trigger> & { variant?: Variant }) {
  return <TabsPrimitive.Trigger className={cn(TRIGGER[variant], className)} {...props} />;
}

export function TabsContent({ className, ...props }: ComponentProps<typeof TabsPrimitive.Content>) {
  return <TabsPrimitive.Content className={cn("flex-1 outline-none", className)} {...props} />;
}
