import type { ComponentProps } from "react";

import { cn } from "@/lib/utils.ts";

/* Form controls from the design: white, 1px slate-300 outline, 8px corners, 36px tall;
   focus uses the accent border and a visible ring. Native <select> and checkboxes are used
   on purpose: they are accessible by default and need no extra library. */

const control =
  "w-full min-w-0 rounded-md border border-input bg-card text-sm text-foreground transition-[color,box-shadow,border-color] outline-none placeholder:text-(--muted-foreground) focus-visible:border-primary focus-visible:shadow-(--focus-glow) disabled:cursor-not-allowed disabled:bg-muted disabled:opacity-60 aria-invalid:border-danger-solid";

export function Input({ className, ...props }: ComponentProps<"input">) {
  return <input data-slot="input" className={cn(control, "h-9 px-3", className)} {...props} />;
}

export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(control, "min-h-20 px-3 py-2", className)}
      {...props}
    />
  );
}

export function NativeSelect({ className, ...props }: ComponentProps<"select">) {
  return <select data-slot="select" className={cn(control, "h-9 px-3", className)} {...props} />;
}

export function Checkbox({ className, ...props }: Omit<ComponentProps<"input">, "type">) {
  return (
    <input
      type="checkbox"
      className={cn("size-4.5 shrink-0 rounded-sm accent-primary disabled:opacity-50", className)}
      {...props}
    />
  );
}

export function Label({ className, ...props }: ComponentProps<"label">) {
  return <label className={cn("text-sm font-medium text-foreground", className)} {...props} />;
}

/** A shortcut hint such as ⌘K inside a search field or button. */
export function Kbd({ className, ...props }: ComponentProps<"kbd">) {
  return (
    <kbd
      className={cn(
        "pointer-events-none inline-flex h-5 items-center rounded-sm border bg-card px-1.5 font-mono text-2xs text-muted-foreground",
        className,
      )}
      {...props}
    />
  );
}
