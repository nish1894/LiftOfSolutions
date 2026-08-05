import iconUrl from "../assets/icon.png";

/**
 * The Lift Off Solutions rocket mark.
 *
 * Imported rather than referenced from public/, so Vite fingerprints it into
 * /assets/ -- the only static path the API serves (see backend/app.py).
 *
 * alt is empty because the mark is decorative everywhere it appears: a wordmark
 * or heading carries the name alongside it, and announcing it twice is noise.
 */
export default function BrandMark({ size = 56, className = "" }) {
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
