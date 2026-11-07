import iconUrl from "../../assets/icon.png";

/**
 * The LiftOffSol rocket mark.
 *
 * Imported rather than referenced from public/, so Vite fingerprints it into
 * /assets/ is served by the frontend Nginx container in production.
 *
 * alt is empty because the mark is decorative everywhere it appears: a wordmark
 * or heading carries the name alongside it, and announcing it twice is noise.
 */
export default function BrandMark({
  size = 56,
  className = "",
}: {
  size?: number;
  className?: string;
}) {
  return (
    <img
      className={["brand-mark", className].filter(Boolean).join(" ")}
      src={iconUrl}
      alt=""
      width={size}
      height={size}
    />
  );
}
