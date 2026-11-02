import type { ComponentProps } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "radix-ui";

import { cn } from "@/lib/utils.ts";

/* Buttons from the Clean Modern design: 36px, 8px corners, a 2px offset focus ring.
   One solid indigo primary per area; everything else is outline or ghost. */
const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 rounded-md text-sm font-medium whitespace-nowrap transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground hover:bg-primary-hover active:bg-primary-pressed",
        outline:
          "border border-input bg-card text-foreground hover:border-(--muted-foreground) hover:bg-background",
        secondary: "bg-secondary text-secondary-foreground hover:bg-border",
        ghost: "text-subtle-foreground hover:bg-muted hover:text-foreground",
        /* Asking a person to step in: amber, never mistaken for the primary path. */
        escalation:
          "border border-warning-solid bg-warning-bg text-warning hover:bg-warning-border",
        destructive: "bg-destructive text-destructive-foreground hover:bg-destructive-hover",
        "destructive-outline": "border border-danger-border bg-card text-danger hover:bg-danger-bg",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-9 px-4 has-[>svg]:px-3",
        sm: "h-8 gap-2 px-3 text-xs has-[>svg]:px-3",
        lg: "h-10 px-5 has-[>svg]:px-4",
        icon: "size-9",
        "icon-sm": "size-8",
        none: "",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

type ButtonProps = ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & { asChild?: boolean };

export function Button({ className, variant, size, asChild = false, ...props }: ButtonProps) {
  const Comp = asChild ? Slot.Root : "button";
  // A link-style button should not inherit a button's height and padding.
  const finalSize = variant === "link" ? "none" : size;
  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size: finalSize }), className)}
      {...props}
    />
  );
}
