import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

/* The type scale adds text-md and text-display. Without telling tailwind-merge,
   it would treat them as colours and drop them next to a text colour class. */
const twMerge = extendTailwindMerge({
  extend: { classGroups: { "font-size": [{ text: ["md", "display"] }] } },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** "ORGANIZATION_MEMBERS" -> "Organization members" */
export function sentenceCase(value: string | null | undefined): string {
  const text = String(value || "")
    .toLowerCase()
    .replace(/[._-]+/g, " ")
    .trim();
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** Short relative time: "just now", "5m ago", "3h ago", "2d ago". */
export function timeAgo(value: unknown): string {
  const time = toDate(value)?.getTime();
  if (time === undefined) return "";
  const minutes = Math.round((Date.now() - time) / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

/** Firestore timestamps arrive as ISO strings or {_seconds} objects. */
export function toDate(value: unknown): Date | null {
  if (!value) return null;
  if (typeof value === "object" && "_seconds" in value) {
    return new Date(Number((value as { _seconds: number })._seconds) * 1000);
  }
  const date = new Date(value as string);
  return Number.isNaN(date.getTime()) ? null : date;
}

const numberFormat = new Intl.NumberFormat();

export function formatNumber(value: number | null | undefined): string {
  return numberFormat.format(Number(value ?? 0));
}

/** Costs per request are often fractions of a cent, so small values keep 4 decimals. */
export function formatUsd(value: number | null | undefined): string {
  const amount = Number(value ?? 0);
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: amount > 0 && amount < 1 ? 4 : 2,
  }).format(amount);
}

/** First non-empty text value among `keys`; API records vary in naming. */
export function pickText(record: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value;
    if (typeof value === "number") return String(value);
  }
  return "";
}

export function initials(name: string | null | undefined): string {
  const parts = String(name || "?")
    .trim()
    .split(/[\s@.]+/)
    .filter(Boolean);
  return ((parts[0]?.[0] ?? "?") + (parts[1]?.[0] ?? "")).toUpperCase();
}
