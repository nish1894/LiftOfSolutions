import { cloneElement, isValidElement, type ReactNode } from "react";
import { type LucideIcon, TrendingDownIcon, TrendingUpIcon } from "lucide-react";

import { Button } from "@/components/ui/button.tsx";
import { cn } from "@/lib/utils.ts";
import { ApiError } from "@/shared/api/client.ts";

/* Small layout pieces every screen uses, kept together so a page reads as
   header → notices → content. */

const WIDTHS = {
  narrow: "max-w-3xl",
  wide: "max-w-[1440px]",
};

/** Forms and settings use `narrow`; tables and dashboards use `wide` (1440px). */
export function PageContainer({
  size = "wide",
  children,
}: {
  size?: keyof typeof WIDTHS;
  children: ReactNode;
}) {
  return (
    <div className={cn("mx-auto w-full px-4 py-6 md:px-6 md:py-8 lg:px-8", WIDTHS[size])}>
      {children}
    </div>
  );
}

interface PageHeaderProps {
  title: string;
  /** Small contextual line above the title, e.g. "Workspace · Settings". */
  eyebrow?: string;
  description?: ReactNode;
  actions?: ReactNode;
}

export function PageHeader({ title, eyebrow, description, actions }: PageHeaderProps) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div className="grid gap-2">
        {eyebrow && <p className="label-caps">{eyebrow}</p>}
        <h1 className="text-2xl font-medium tracking-tight">{title}</h1>
        {description && (
          <div className="max-w-2xl text-sm text-muted-foreground">{description}</div>
        )}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}

export function EmptyState({ icon: Icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center gap-2 rounded-xl border border-dashed px-6 py-10 text-center",
        className,
      )}
    >
      {Icon && (
        <span className="mb-2 flex size-10 items-center justify-center rounded-lg bg-muted">
          <Icon className="size-5 text-muted-foreground" aria-hidden="true" />
        </span>
      )}
      <p className="font-medium">{title}</p>
      {description && <p className="max-w-md text-sm text-muted-foreground">{description}</p>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}

const NOTICE_TONES = {
  error: "border-danger-border bg-danger-bg text-danger",
  success: "border-success-border bg-success-bg text-success",
  warning: "border-warning-border bg-warning-bg text-warning",
  info: "border-info-border bg-info-bg text-info",
};

interface NoticeProps {
  tone?: keyof typeof NOTICE_TONES;
  children: ReactNode;
  className?: string;
}

export function Notice({ tone = "info", children, className }: NoticeProps) {
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={cn(
        "flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border px-4 py-3 text-sm",
        NOTICE_TONES[tone],
        className,
      )}
    >
      {children}
    </div>
  );
}

/** Shown instead of an empty state when a list fails to load, so a failure never looks like "nothing here". */
export function LoadError({
  what,
  query,
  className,
}: {
  what: string;
  query: { error: unknown; refetch: () => unknown };
  className?: string;
}) {
  // The API answers 404 for features it doesn't offer yet: that's information, not a failure.
  const missing = query.error instanceof ApiError && query.error.status === 404;
  return (
    <Notice tone={missing ? "info" : "error"} className={className}>
      <span>{missing ? `Not available yet: ${what}.` : `Couldn't load ${what}.`}</span>
      {!missing && (
        <Button variant="outline" size="sm" className="ml-auto" onClick={() => query.refetch()}>
          Try again
        </Button>
      )}
    </Notice>
  );
}

interface FieldProps {
  label: string;
  htmlFor: string;
  hint?: ReactNode;
  children: ReactNode;
  className?: string;
}

export function Field({ label, htmlFor, hint, children, className }: FieldProps) {
  // The hint is tied to the control (the direct child), so screen readers read it on focus.
  const hintId = `${htmlFor}-hint`;
  const control =
    hint && isValidElement<{ "aria-describedby"?: string }>(children)
      ? cloneElement(children, { "aria-describedby": hintId })
      : children;
  return (
    <div className={cn("grid content-start gap-2", className)}>
      <label htmlFor={htmlFor} className="text-sm font-medium">
        {label}
      </label>
      {control}
      {hint && (
        <p id={hintId} className="text-xs text-muted-foreground">
          {hint}
        </p>
      )}
    </div>
  );
}

/** "+12%" or "-8%" in success or danger colours. */
export function TrendBadge({ value }: { value: number }) {
  const up = value >= 0;
  const Icon = up ? TrendingUpIcon : TrendingDownIcon;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-medium tabular-nums",
        up
          ? "border-success-border bg-success-bg text-success"
          : "border-danger-border bg-danger-bg text-danger",
      )}
    >
      <Icon className="size-3" aria-hidden="true" />
      {up ? "+" : ""}
      {value}%
    </span>
  );
}

interface StatProps {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  icon?: LucideIcon;
  /** Percent change against the previous period. */
  trend?: number | null;
  /** A small chart shown next to the value, e.g. a sparkline. */
  chart?: ReactNode;
}

/** One metric card. Numbers use tabular digits so rows line up. */
export function Stat({ label, value, hint, icon: Icon, trend, chart }: StatProps) {
  return (
    <div className="grid content-start gap-2 rounded-xl border bg-card p-4">
      <div className="flex items-center justify-between gap-2">
        <dt className="label-caps">{label}</dt>
        {Icon && (
          <span className="flex size-5 items-center justify-center">
            <Icon className="size-4 text-muted-foreground" aria-hidden="true" />
          </span>
        )}
      </div>
      <dd className="flex items-end justify-between gap-3">
        <span className="text-3xl font-medium tracking-tight tabular-nums">{value}</span>
        {chart}
      </dd>
      {(trend != null || hint) && (
        <dd className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          {trend != null && <TrendBadge value={trend} />}
          {hint}
        </dd>
      )}
    </div>
  );
}

export function LoadingRows({ label = "Loading…" }: { label?: string }) {
  return (
    <p className="py-8 text-center text-sm text-muted-foreground" role="status">
      {label}
    </p>
  );
}
