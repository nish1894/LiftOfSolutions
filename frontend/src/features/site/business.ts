/* The business details, written exactly as registered: Meta's business verification compares them with our
   registration, so every page takes them from here. */

// The registered address in parts, for the homepage's structured data; BUSINESS.address joins them.
export const ADDRESS = {
  street: "262/1, Corner Green Building, 12th Main Road, AECS Layout - A Block, Bommanahalli",
  city: "Bengaluru",
  state: "Karnataka",
  postalCode: "560068",
  country: "India",
} as const;

export const BUSINESS = {
  name: "LiftOffSol",
  // Also the Grievance Officer.
  proprietor: "Nishant Kumar",
  address: `${ADDRESS.street}, ${ADDRESS.city}, ${ADDRESS.state} ${ADDRESS.postalCode}, ${ADDRESS.country}`,
  phone: "+91 7976469859",
  phoneHref: "tel:+917976469859",
  email: "contact@liftoffsol.com",
  hours: "Mon–Sat, 10am–7pm IST",
} as const;

// Said word for word on the About and Privacy pages.
export const OWNERSHIP = `${BUSINESS.name} is a sole proprietorship owned by ${BUSINESS.proprietor}, registered in India (MSME/Udyam registered).`;

// The site's address; liftoffsol.com redirects here.
export const SITE_URL = "https://www.liftoffsol.com";

// When the Privacy Policy, Terms of Service and Data Deletion pages last changed.
export const POLICIES_UPDATED = "7 November 2026";

// The public pages. Each is also written as static HTML at build time (scripts/prerender.mjs), so it reads
// the same without JavaScript, and is listed in public/sitemap.xml.
export const PAGES = [
  {
    path: "/",
    file: "index.html",
    title: "LiftOffSol – AI Customer Support on WhatsApp",
    description:
      "LiftOffSol is AI-powered customer support for businesses on the WhatsApp Business Platform. It answers your customers from your own business information and hands over to your team when needed.",
  },
  {
    path: "/about",
    file: "about.html",
    title: "About – LiftOffSol",
    description:
      "LiftOffSol is a Bengaluru-based business building AI customer support for small and medium businesses on the WhatsApp Business Platform.",
  },
  {
    path: "/contact",
    file: "contact.html",
    title: "Contact – LiftOffSol",
    description: "Contact LiftOffSol: address, phone, email and business hours.",
  },
  {
    path: "/privacy",
    file: "privacy.html",
    title: "Privacy Policy – LiftOffSol",
    description:
      "How LiftOffSol collects, uses, shares and protects personal data, and your rights under India's Digital Personal Data Protection Act, 2023.",
  },
  {
    path: "/terms",
    file: "terms.html",
    title: "Terms of Service – LiftOffSol",
    description:
      "The terms for using LiftOffSol's AI customer support service on the WhatsApp Business Platform.",
  },
  {
    path: "/data-deletion",
    file: "data-deletion.html",
    title: "Data Deletion – LiftOffSol",
    description:
      "How to ask LiftOffSol to delete your account and data, and how to disconnect WhatsApp from LiftOffSol.",
  },
] as const;

export type SitePath = (typeof PAGES)[number]["path"];
