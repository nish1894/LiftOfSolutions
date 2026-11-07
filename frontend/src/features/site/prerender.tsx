/* Build time only (scripts/prerender.mjs): each public page as HTML. The pages are drawn signed out; in the
   browser the app takes over and shows the visitor's own state. Never loaded by the dev server, so Fast
   Refresh doesn't apply. */
/* eslint-disable react-refresh/only-export-components */
import type { ComponentType } from "react";
import { renderToString } from "react-dom/server";
import { StaticRouter } from "react-router-dom";

import { AuthContext, type AuthValue } from "@/features/auth/AuthContext.ts";
import Home from "@/features/home/Home.tsx";

import AboutPage from "./AboutPage.tsx";
import { PAGES, SITE_URL, type SitePath } from "./business.ts";
import ContactPage from "./ContactPage.tsx";
import DataDeletionPage from "./DataDeletionPage.tsx";
import PrivacyPage from "./PrivacyPage.tsx";
import TermsPage from "./TermsPage.tsx";

const COMPONENTS: Record<SitePath, ComponentType> = {
  "/": Home,
  "/about": AboutPage,
  "/contact": ContactPage,
  "/privacy": PrivacyPage,
  "/terms": TermsPage,
  "/data-deletion": DataDeletionPage,
};

// The pages only read user from the session.
const signedOut = { user: null, loading: false } as AuthValue;

export function render(path: SitePath) {
  const Page = COMPONENTS[path];
  return renderToString(
    <AuthContext.Provider value={signedOut}>
      <StaticRouter location={path}>
        <Page />
      </StaticRouter>
    </AuthContext.Provider>,
  );
}

export { PAGES, SITE_URL };
