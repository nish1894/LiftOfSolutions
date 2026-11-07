import { type ReactNode, useEffect } from "react";
import { Link, useLocation } from "react-router-dom";

import { Button } from "@/components/ui/button.tsx";
import { useAuth } from "@/features/auth/AuthContext.ts";
import BrandMark from "@/shared/ui/BrandMark.tsx";

import { BUSINESS, PAGES } from "./business.ts";
import SiteFooter from "./SiteFooter.tsx";

/* The public website's frame: header, page, footer. It names the tab after the page, and opens each page at
   the top, or at the section a link names (/#how). */
export default function SiteLayout({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { pathname, hash } = useLocation();

  useEffect(() => {
    const page = PAGES.find((item) => item.path === pathname);
    if (page) document.title = page.title;
  }, [pathname]);

  useEffect(() => {
    const section = hash ? document.getElementById(hash.slice(1)) : null;
    if (section) section.scrollIntoView();
    else window.scrollTo(0, 0);
  }, [pathname, hash]);

  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <header className="sticky top-0 z-30 border-b bg-background">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-6 px-4 md:px-6">
          <Link className="flex items-center gap-3 font-medium" to="/">
            <BrandMark size={28} />
            {BUSINESS.name}
          </Link>
          <nav
            className="hidden items-center gap-6 text-sm text-muted-foreground md:flex"
            aria-label="Main"
          >
            <Link className="hover:text-foreground" to="/#how">
              How it works
            </Link>
            <Link className="hover:text-foreground" to="/about">
              About
            </Link>
            <Link className="hover:text-foreground" to="/contact">
              Contact
            </Link>
          </nav>
          <div className="ml-auto flex items-center gap-2">
            {user ? (
              <>
                <span className="hidden text-sm text-muted-foreground sm:inline">
                  {user.display_name || user.email}
                </span>
                <Button asChild size="sm">
                  <Link to="/app">Go to dashboard</Link>
                </Button>
              </>
            ) : (
              <>
                <Button asChild variant="ghost" size="sm">
                  <Link to="/signin">Sign in</Link>
                </Button>
                <Button asChild size="sm">
                  <Link to="/signin">Get started</Link>
                </Button>
              </>
            )}
          </div>
        </div>
      </header>
      <main className="flex-1">{children}</main>
      <SiteFooter />
    </div>
  );
}
