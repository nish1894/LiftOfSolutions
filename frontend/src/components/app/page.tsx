import type { ReactNode } from "react";
import { type LucideIcon, TrendingDownIcon, TrendingUpIcon } from "lucide-react";

import { cn } from "@/lib/utils.ts";

/* Small layout pieces every screen uses, kept together so a page reads as
   header → notices → content. */

const WIDTHS = {
  narrow: "max-w-3xl",
  wide: "max-w-7xl",
};

/** Forms and settings use `narrow`; tables and dashboards use `wide` (1280px). */
export function PageContainer({
  size = "wide",
  children,
}: {
  size?: keyof typeof WIDTHS;
  children: ReactNode;
}) {
  return (
    <div className={cn("mx-auto w-full px-4 py-4 md:py-6 lg:px-6", WIDTHS[size])}>{children}</div>
  );
}

interface PageHeaderProps {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
}

export function PageHeader({ title, description, actions }: PageHeaderProps) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="grid gap-1">
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
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
        "flex flex-col items-center gap-1.5 rounded-xl border border-dashed px-6 py-12 text-center",
        className,
      )}
    >
      {Icon && (
        <span className="mb-2 flex size-10 items-center justify-center rounded-lg border bg-background shadow-xs">
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
  error: "border-danger/30 bg-danger-bg text-danger",
  success: "border-success/30 bg-success-bg text-success",
  warning: "border-warning/30 bg-warning-bg text-warning",
  info: "border-info/30 bg-info-bg text-info",
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

interface FieldProps {
  label: string;
  htmlFor: string;
  hint?: ReactNode;
  children: ReactNode;
  className?: string;
}

export function Field({ label, htmlFor, hint, children, className }: FieldProps) {
  return (
    <div className={cn("grid gap-1.5", className)}>
      <label htmlFor={htmlFor} className="text-sm font-medium">
        {label}
      </label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
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
        "inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-xs font-medium tabular-nums",
        up
          ? "border-success/30 bg-success-bg text-success"
          : "border-danger/30 bg-danger-bg text-danger",
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
    <div className="grid content-start gap-3 rounded-xl border bg-card p-5 shadow-xs">
      <div className="flex items-center justify-between gap-2">
        <dt className="text-sm font-medium text-muted-foreground">{label}</dt>
        {Icon && <Icon className="size-4 text-muted-foreground" aria-hidden="true" />}
      </div>
      <dd className="flex items-end justify-between gap-3">
        <span className="text-2xl font-semibold tracking-tight tabular-nums">{value}</span>
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
