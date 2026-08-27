import type { ReactElement } from "react";

/**
 * The sidebar and stat tiles need icons. These are hand-drawn on a 24px grid
 * with a 1.75 stroke rather than pulled from an icon package: the set is small
 * and fixed, and a dependency for twelve glyphs is not worth the bundle or the
 * upgrade surface.
 *
 * Every icon inherits currentColor, so one glyph works on the sidebar, on a
 * tinted chip, and in both themes without a second copy.
 */

const paths: Record<string, ReactElement> = {
  overview: (
    <>
      <rect x="3" y="3" width="7" height="9" rx="2" />
      <rect x="14" y="3" width="7" height="5" rx="2" />
      <rect x="14" y="12" width="7" height="9" rx="2" />
      <rect x="3" y="16" width="7" height="5" rx="2" />
    </>
  ),
  chat: (
    <>
      <path d="M21 12a8 8 0 0 1-8 8H7l-4 3V12a8 8 0 0 1 8-8h2a8 8 0 0 1 8 8Z" />
      <path d="M9 11h6M9 15h3" />
    </>
  ),
  assistants: (
    <>
      <rect x="4" y="8" width="16" height="12" rx="3" />
      <path d="M12 4v4M9 14h.01M15 14h.01" />
    </>
  ),
  knowledge: (
    <>
      <path d="M4 5a2 2 0 0 1 2-2h9l5 5v13a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2Z" />
      <path d="M14 3v6h6M8 13h8M8 17h5" />
    </>
  ),
  customers: (
    <>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 20a6.5 6.5 0 0 1 13 0" />
      <path d="M16 5.5a3.5 3.5 0 0 1 0 7M17.5 20a6.5 6.5 0 0 0-2-4.7" />
    </>
  ),
  conversations: (
    <>
      <path d="M8 14H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
      <path d="M10 10h9a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2h-3l-4 3v-3h-2a2 2 0 0 1-2-2Z" />
    </>
  ),
  channels: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3a15 15 0 0 1 0 18a15 15 0 0 1 0-18Z" />
    </>
  ),
  approvals: (
    <>
      <circle cx="10" cy="8" r="3.5" />
      <path d="M3.5 20a6.5 6.5 0 0 1 11.2-4.5" />
      <path d="m15 18 2 2 4-4" />
    </>
  ),
  team: (
    <>
      <circle cx="12" cy="7" r="3.5" />
      <path d="M5 20a7 7 0 0 1 14 0" />
    </>
  ),
  organization: (
    <>
      <path d="M3 21V7l7-4v18M10 21h11V11l-11-4" />
      <path d="M14 12h.01M14 16h.01M18 12h.01M18 16h.01M6 11h.01M6 15h.01" />
    </>
  ),
  profile: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.9 1.2v.1a2 2 0 1 1-4 0v-.2a1.7 1.7 0 0 0-3-1.1l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0-1.2-2.9H3a2 2 0 1 1 0-4h.2A1.7 1.7 0 0 0 4.3 6l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 2.9-1.2V2a2 2 0 1 1 4 0v.2a1.7 1.7 0 0 0 2.9 1.1l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9Z" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </>
  ),
};

export default function NavIcon({ name, size = 18 }: { name: string; size?: number }) {
  const glyph = paths[name];
  if (!glyph) return null;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className="nav-icon"
    >
      {glyph}
    </svg>
  );
}
