import { cn, initials } from "@/lib/utils.ts";

interface AvatarProps {
  name: string | null | undefined;
  src?: string | null;
  /** Organizations are square, people are round. */
  shape?: "circle" | "square";
  className?: string;
}

export function Avatar({ name, src, shape = "circle", className }: AvatarProps) {
  const base = cn(
    "inline-flex size-8 shrink-0 items-center justify-center overflow-hidden text-xs font-semibold",
    shape === "circle" ? "rounded-full" : "rounded-md",
    className,
  );
  if (src) return <img className={base} src={src} alt="" referrerPolicy="no-referrer" />;
  return (
    <span
      className={cn(
        base,
        shape === "square"
          ? "bg-primary text-primary-foreground"
          : "bg-accent text-accent-foreground ring-1 ring-accent-border",
      )}
      aria-hidden="true"
    >
      {initials(name)}
    </span>
  );
}
