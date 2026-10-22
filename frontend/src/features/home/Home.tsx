/**
 * Marketing landing page for signed-out visitors. Section structure follows
 * the ShadcnStore landing template (MIT), without its pricing, blog or team
 * sections — this product has no real content for them yet.
 *
 * PLACEHOLDER COPY: the customer names and the testimonial below are invented
 * for layout purposes. Replace them with real, attributable material before
 * this is publicly deployed -- shipping invented social proof as though it
 * were genuine is misleading to visitors.
 */

import { Link } from "react-router-dom";
import {
  ArrowRightIcon,
  BookOpenIcon,
  BotIcon,
  ChevronDownIcon,
  FileTextIcon,
  GaugeIcon,
  InboxIcon,
  LayoutDashboardIcon,
  type LucideIcon,
  MessageSquareQuoteIcon,
  ReceiptIcon,
  SparklesIcon,
} from "lucide-react";

import { Button } from "@/components/ui/button.tsx";
import { cn } from "@/lib/utils.ts";
import type { User } from "@/shared/types.ts";
import BrandMark from "@/shared/ui/BrandMark.tsx";

const FEATURES: Array<{ icon: LucideIcon; title: string; body: string }> = [
  {
    icon: MessageSquareQuoteIcon,
    title: "Answers with the source attached",
    body: "Every reply points back to the document it came from, so your team can verify before acting on it.",
  },
  {
    icon: FileTextIcon,
    title: "No data project required",
    body: "Upload the documents you already have — policies, contracts, specs, support history. No pipeline to build first.",
  },
  {
    icon: GaugeIcon,
    title: "Right model for the job",
    body: "Quick lookups go to a fast, inexpensive model; involved analysis goes to a stronger one.",
  },
  {
    icon: ReceiptIcon,
    title: "Spend you can account for",
    body: "Usage is recorded per request, so cost can be attributed to the team or workflow behind it.",
  },
];

const STEPS = [
  {
    title: "Bring your documents",
    body: "Point it at the material your team already relies on. Formats you use day to day are handled as-is.",
  },
  {
    title: "Ask in plain language",
    body: "No query syntax, no training. People ask the way they would ask a colleague who had read everything.",
  },
  {
    title: "Act on cited answers",
    body: "Responses arrive with the passages they were drawn from, so the answer can be checked in seconds.",
  },
];

const USE_CASES = [
  {
    title: "Customer support",
    body: "Resolve tickets against current policy instead of a stale macro.",
  },
  {
    title: "Sales enablement",
    body: "Answer product and pricing questions without waiting on an expert.",
  },
  { title: "People & HR", body: "Give staff a straight answer on leave, benefits, and process." },
  { title: "Operations", body: "Find the clause, the spec, or the runbook step without hunting." },
];

const FAQS = [
  {
    question: "Where do the assistant's answers come from?",
    answer:
      "Only from the documents and web pages you add to Knowledge. Each answer shows the sources it used, so your team can check it.",
  },
  {
    question: "Can a person take over a conversation?",
    answer:
      "Yes. Anyone on your team with the right role can take over from the AI, reply to the customer, and hand the conversation back when they're done.",
  },
  {
    question: "How do people sign in?",
    answer:
      "With Google, GitHub, or an email and password. Each organization approves who can join it.",
  },
];

// Placeholder customer names — fictional. Swap for real logos when available.
const CUSTOMERS = ["Northwind Retail", "Harbor Logistics", "Meridian Health", "Ashfield Legal"];

function SectionHeading({
  eyebrow,
  title,
  body,
}: {
  eyebrow: string;
  title: string;
  body: string;
}) {
  return (
    <div className="mx-auto mb-12 grid max-w-2xl justify-items-center gap-3 text-center">
      <span className="rounded-md border px-2 py-0.5 text-xs font-medium text-muted-foreground">
        {eyebrow}
      </span>
      <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
      <p className="text-muted-foreground">{body}</p>
    </div>
  );
}

/* A static picture of the product, drawn with the app's own tokens. */
function ProductShowcase({ className }: { className?: string }) {
  const nav: Array<{ icon: LucideIcon; label: string; active?: boolean }> = [
    { icon: LayoutDashboardIcon, label: "Overview" },
    { icon: InboxIcon, label: "Inbox", active: true },
    { icon: BotIcon, label: "Assistants" },
    { icon: BookOpenIcon, label: "Knowledge" },
  ];
  const queue = [
    { name: "Priya Nair", note: "Where is my refund?", state: "AI active", tone: "violet" },
    { name: "Jordan Lee", note: "I'd like to talk to a person", state: "Waiting", tone: "orange" },
    { name: "Sam Ortiz", note: "Thanks, that fixed it", state: "Resolved", tone: "success" },
  ];

  return (
    <figure
      className={cn("overflow-hidden rounded-xl border bg-card text-left shadow-lg", className)}
      aria-label="Illustration of the Lift Off inbox"
    >
      <div className="grid md:grid-cols-[11rem_16rem_1fr]">
        <div className="hidden border-r bg-sidebar p-3 md:grid md:content-start md:gap-1">
          <p className="mb-2 flex items-center gap-2 px-2 text-sm font-semibold">
            <span className="flex size-6 items-center justify-center rounded-md bg-primary text-xs text-primary-foreground">
              AS
            </span>
            Acme Support
          </p>
          {nav.map((item) => (
            <span
              key={item.label}
              className={cn(
                "flex items-center gap-2 rounded-md px-2 py-1.5 text-sm",
                item.active && "bg-sidebar-accent font-medium text-sidebar-accent-foreground",
              )}
            >
              <item.icon className="size-4" aria-hidden="true" />
              {item.label}
            </span>
          ))}
        </div>
        <div className="hidden border-r p-2 md:grid md:content-start md:gap-1">
          {queue.map((item, index) => (
            <div
              key={item.name}
              className={cn("grid gap-1 rounded-lg p-2.5", index === 0 && "bg-accent")}
            >
              <span className="text-sm font-medium">{item.name}</span>
              <span className="truncate text-xs text-muted-foreground">{item.note}</span>
              <span
                className="w-fit rounded-md border px-1.5 text-xs font-medium"
                style={{ color: `var(--${item.tone})`, background: `var(--${item.tone}-bg)` }}
              >
                {item.state}
              </span>
            </div>
          ))}
        </div>
        <div className="grid content-start gap-4 p-5 text-sm">
          <div className="flex gap-3">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-semibold text-accent-foreground">
              PN
            </span>
            <p className="rounded-lg bg-muted px-3 py-2">Where is my refund for order 4471?</p>
          </div>
          <div className="flex flex-row-reverse gap-3">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-full border bg-background">
              <BotIcon className="size-4 text-muted-foreground" aria-hidden="true" />
            </span>
            <div className="max-w-md rounded-lg border bg-card px-3 py-2">
              Refunds go back to the original payment method within 5–7 business days of approval.
              <span className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                Sources
                <span className="rounded-sm border border-citation-border bg-citation-bg px-1.5 font-medium text-citation">
                  1 Refund policy.pdf
                </span>
              </span>
            </div>
          </div>
        </div>
      </div>
      <figcaption className="border-t px-4 py-2 text-xs text-muted-foreground">
        Illustrative example.
      </figcaption>
    </figure>
  );
}

export default function Home({ user }: { user: User | null }) {
  // The homepage is the landing screen for everyone, so a signed-in visitor
  // needs a way into the application rather than another sign-in prompt.
  const signedIn = Boolean(user);
  const primaryTarget = signedIn ? "/app" : "/signin";

  return (
    <div className="min-h-dvh bg-background">
      <header className="sticky top-0 z-30 border-b bg-background">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-6 px-4 md:px-6">
          <a className="flex items-center gap-2 font-semibold" href="#top">
            <BrandMark size={28} />
            Lift Off Solutions
          </a>
          <nav
            className="hidden items-center gap-6 text-sm text-muted-foreground md:flex"
            aria-label="Sections"
          >
            <a className="hover:text-foreground" href="#features">
              Features
            </a>
            <a className="hover:text-foreground" href="#how">
              How it works
            </a>
            <a className="hover:text-foreground" href="#faq">
              FAQ
            </a>
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

      <main id="top">
        <section className="relative overflow-hidden border-b">
          {/* Dot grid, as in the template, faded toward the edges. */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(var(--border)_1px,transparent_1px)] bg-size-[20px_20px] mask-[radial-gradient(ellipse_at_top,black_30%,transparent_70%)]"
          />
          <div className="relative mx-auto max-w-6xl px-4 pt-16 pb-16 text-center md:px-6 md:pt-24">
            <span className="inline-flex items-center gap-2 rounded-full border bg-background px-3 py-1 text-sm text-muted-foreground shadow-xs">
              <SparklesIcon className="size-3.5 text-primary" aria-hidden="true" />
              AI customer service with cited answers
            </span>
            <h1 className="mx-auto mt-6 max-w-3xl text-xl font-semibold tracking-tight sm:text-display">
              Your company's knowledge, answered in seconds
            </h1>
            <p className="mx-auto mt-5 max-w-2xl text-md text-muted-foreground">
              Lift Off Solutions reads the documents your business already runs on and answers
              questions about them in plain language — with the source passage attached, so nobody
              has to take the answer on trust.
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <Button asChild size="lg">
                <Link to={primaryTarget}>
                  {signedIn ? "Open your dashboard" : "Get started free"}
                  <ArrowRightIcon />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <a href="#how">See how it works</a>
              </Button>
            </div>
            <p className="mt-4 text-sm text-muted-foreground">
              {signedIn
                ? `Signed in as ${user?.email ?? ""}`
                : "No credit card required · Sign in with Google, GitHub, or email"}
            </p>
            <ProductShowcase className="mx-auto mt-14 max-w-5xl" />
          </div>
        </section>

        <section className="border-b" aria-label="Customers">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-center gap-x-10 gap-y-3 px-4 py-8 md:px-6">
            <p className="text-sm text-muted-foreground">Built for teams like</p>
            <ul className="flex flex-wrap justify-center gap-x-10 gap-y-2 text-md font-semibold text-muted-foreground">
              {CUSTOMERS.map((name) => (
                <li key={name}>{name}</li>
              ))}
            </ul>
          </div>
        </section>

        <section id="features" className="scroll-mt-16 border-b bg-muted/30 py-20">
          <div className="mx-auto max-w-6xl px-4 md:px-6">
            <SectionHeading
              eyebrow="Features"
              title="Why teams choose it"
              body="Accuracy you can check, set up in an afternoon rather than a quarter."
            />
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {FEATURES.map((feature) => (
                <article
                  key={feature.title}
                  className="grid content-start gap-3 rounded-xl border bg-card p-6 shadow-xs"
                >
                  <span className="flex size-10 items-center justify-center rounded-lg border bg-background shadow-xs">
                    <feature.icon className="size-5 text-primary" aria-hidden="true" />
                  </span>
                  <h3 className="font-semibold">{feature.title}</h3>
                  <p className="text-sm text-muted-foreground">{feature.body}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="how" className="scroll-mt-16 border-b py-20">
          <div className="mx-auto max-w-6xl px-4 md:px-6">
            <SectionHeading
              eyebrow="How it works"
              title="Three steps, and none of them need an engineer"
              body="From your documents to cited answers your customers can trust."
            />
            <ol className="grid gap-4 md:grid-cols-3">
              {STEPS.map((step, index) => (
                <li
                  key={step.title}
                  className="grid content-start gap-3 rounded-xl border bg-card p-6 shadow-xs"
                >
                  <span className="flex size-8 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
                    {index + 1}
                  </span>
                  <h3 className="font-semibold">{step.title}</h3>
                  <p className="text-sm text-muted-foreground">{step.body}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="border-b bg-muted/30 py-20">
          <div className="mx-auto grid max-w-6xl gap-12 px-4 md:px-6 lg:grid-cols-2">
            <div className="grid content-start gap-6">
              <h2 className="text-xl font-semibold tracking-tight">Where it earns its keep</h2>
              <ul className="grid gap-5 sm:grid-cols-2">
                {USE_CASES.map((useCase) => (
                  <li key={useCase.title} className="grid gap-1 border-l-2 border-primary/30 pl-4">
                    <h3 className="font-semibold">{useCase.title}</h3>
                    <p className="text-sm text-muted-foreground">{useCase.body}</p>
                  </li>
                ))}
              </ul>
            </div>
            {/* PLACEHOLDER: invented quote and attribution. Replace or remove. */}
            <figure className="grid content-center gap-4 rounded-xl border bg-card p-8 shadow-xs">
              <blockquote className="text-md">
                "Our support team used to keep six policy documents open in tabs. Now they ask one
                question and get the clause back with it. Onboarding a new agent takes days instead
                of weeks."
              </blockquote>
              <figcaption className="text-sm text-muted-foreground">
                Operations Lead · Harbor Logistics — illustrative example
              </figcaption>
            </figure>
          </div>
        </section>

        <section id="faq" className="scroll-mt-16 border-b py-20">
          <div className="mx-auto max-w-3xl px-4 md:px-6">
            <SectionHeading
              eyebrow="FAQ"
              title="Questions people ask first"
              body="Short answers about how Lift Off works."
            />
            <div className="grid gap-3">
              {FAQS.map((faq) => (
                <details
                  key={faq.question}
                  className="group rounded-xl border bg-card px-5 py-4 open:shadow-xs"
                >
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-medium">
                    {faq.question}
                    <ChevronDownIcon
                      className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180"
                      aria-hidden="true"
                    />
                  </summary>
                  <p className="mt-3 text-sm text-muted-foreground">{faq.answer}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        <section className="py-20">
          <div className="mx-auto max-w-6xl px-4 md:px-6">
            <div className="grid justify-items-center gap-4 rounded-2xl border bg-muted/40 px-6 py-14 text-center">
              <h2 className="text-xl font-semibold tracking-tight">Put your documents to work</h2>
              <p className="max-w-xl text-muted-foreground">
                Create an account and ask your first question in a few minutes.
              </p>
              <Button asChild size="lg">
                <Link to={primaryTarget}>
                  {signedIn ? "Open your dashboard" : "Get started free"}
                </Link>
              </Button>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-8 gap-y-3 px-4 py-8 text-sm text-muted-foreground md:px-6">
          <span className="flex items-center gap-2 font-medium text-foreground">
            <BrandMark size={24} />
            Lift Off Solutions
          </span>
          <nav className="flex flex-wrap gap-5" aria-label="Footer">
            <a className="hover:text-foreground" href="#features">
              Features
            </a>
            <a className="hover:text-foreground" href="#how">
              How it works
            </a>
            <a className="hover:text-foreground" href="#faq">
              FAQ
            </a>
            <Link className="hover:text-foreground" to={primaryTarget}>
              {signedIn ? "Dashboard" : "Sign in"}
            </Link>
          </nav>
          <p className="ml-auto">
            © {new Date().getFullYear()} Lift Off Solutions. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
}
