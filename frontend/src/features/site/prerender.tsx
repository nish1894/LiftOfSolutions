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
import { ADDRESS, BUSINESS, PAGES, SITE_URL, type SitePath } from "./business.ts";
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

// schema.org structured data for search engines; the homepage carries it in <head>.
export const ORGANIZATION = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: BUSINESS.name,
  url: SITE_URL,
  email: BUSINESS.email,
  telephone: BUSINESS.phone,
  logo: `${SITE_URL}/icon.png`,
  address: {
    "@type": "PostalAddress",
    streetAddress: ADDRESS.street,
    addressLocality: ADDRESS.city,
    addressRegion: ADDRESS.state,
    postalCode: ADDRESS.postalCode,
    addressCountry: "IN",
  },
};

export { PAGES, SITE_URL };
