import type { ReactNode } from "react";

import { cn, sentenceCase } from "@/lib/utils.ts";
import type { StatusMap, Tone } from "@/shared/statuses.ts";

interface PillProps {
  tone?: Tone;
  children: ReactNode;
  className?: string;
}

/* Badge look from the template. Each tone reads a fg/bg token pair from
   theme.css, so both themes work. */
export function Pill({ tone = "neutral", children, className }: PillProps) {
  return (
    <span
      className={cn(
        "inline-flex w-fit items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-medium whitespace-nowrap [&_svg]:size-3",
        className,
      )}
      style={{
        color: `var(--${tone})`,
        background: `var(--${tone}-bg)`,
        borderColor: `color-mix(in srgb, var(--${tone}) 25%, transparent)`,
      }}
    >
      {children}
    </span>
  );
}

interface StatusPillProps {
  map: StatusMap;
  value: string | null | undefined;
  className?: string;
}

export function StatusPill({ map, value, className }: StatusPillProps) {
  const meta = map[value ?? ""] ?? { label: sentenceCase(value) || "Unknown", tone: "neutral" };
  const Icon = meta.icon;
  return (
    <Pill tone={meta.tone} className={className}>
      {Icon ? (
        <Icon aria-hidden="true" />
      ) : (
        <span className="size-1.5 rounded-full bg-current" aria-hidden="true" />
      )}
      {meta.label}
    </Pill>
  );
}
