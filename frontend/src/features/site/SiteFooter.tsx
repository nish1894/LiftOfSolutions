import { Link } from "react-router-dom";

import BrandMark from "@/shared/ui/BrandMark.tsx";

import { BUSINESS } from "./business.ts";

const LINKS = [
  { to: "/about", label: "About" },
  { to: "/contact", label: "Contact" },
  { to: "/privacy", label: "Privacy Policy" },
  { to: "/terms", label: "Terms of Service" },
  { to: "/data-deletion", label: "Data Deletion" },
];

/* On every public page and the sign-in page: who we are, where to find us, and the policy pages. */
export default function SiteFooter() {
  return (
    <footer className="border-t bg-card text-sm text-muted-foreground">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 md:grid-cols-[2fr_1fr] md:px-6">
        <address className="grid content-start gap-3 not-italic">
          <span className="flex items-center gap-2 font-medium text-foreground">
            <BrandMark size={24} />
            {BUSINESS.name}
          </span>
          <span className="max-w-sm">{BUSINESS.address}</span>
          <span className="flex flex-wrap gap-x-5 gap-y-1">
            <a className="hover:text-foreground" href={BUSINESS.phoneHref}>
              {BUSINESS.phone}
            </a>
            <a className="hover:text-foreground" href={`mailto:${BUSINESS.email}`}>
              {BUSINESS.email}
            </a>
          </span>
        </address>
        <nav aria-label="Footer">
          <ul className="grid gap-2">
            {LINKS.map((link) => (
              <li key={link.to}>
                <Link className="hover:text-foreground" to={link.to}>
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
      <div className="border-t">
        <p className="mx-auto max-w-6xl px-4 py-4 text-xs md:px-6">
          © {new Date().getFullYear()} {BUSINESS.name}
        </p>
      </div>
    </footer>
  );
}
