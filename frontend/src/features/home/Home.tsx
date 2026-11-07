/**
 * The public homepage: what LiftOffSol does, how it works and who it's for. Section structure follows the
 * ShadcnStore landing template (MIT). Every claim here describes the real product; the inbox picture is
 * labelled as an illustration.
 */

import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRightIcon,
  BotIcon,
  CalendarCheckIcon,
  CheckIcon,
  ChevronDownIcon,
  ContactIcon,
  HeadsetIcon,
  InboxIcon,
  LayoutDashboardIcon,
  type LucideIcon,
  MessageCircleQuestionIcon,
  PackageIcon,
} from "lucide-react";

import { Button } from "@/components/ui/button.tsx";
import { useAuth } from "@/features/auth/AuthContext.ts";
import { BUSINESS } from "@/features/site/business.ts";
import SiteLayout from "@/features/site/SiteLayout.tsx";
import { cn } from "@/lib/utils.ts";

const ANSWERS: Array<{ icon: LucideIcon; title: string; body: string }> = [
  {
    icon: MessageCircleQuestionIcon,
    title: "Frequently asked questions",
    body: "Prices, opening hours, location and policies: the questions you answer every day.",
  },
  {
    icon: PackageIcon,
    title: "Orders",
    body: "Delivery times, returns, refunds and payment options, from your own policies.",
  },
  {
    icon: CalendarCheckIcon,
    title: "Bookings",
    body: "How to book, what's available, and how to reschedule or cancel.",
  },
  {
    icon: HeadsetIcon,
    title: "Support",
    body: "Troubleshooting steps and product help, with a handover to your team when needed.",
  },
];

const STEPS = [
  {
    title: "Connect WhatsApp",
    body: "Link your WhatsApp Business number to LiftOffSol through Meta's WhatsApp Business Platform.",
  },
  {
    title: "Train the AI on your business",
    body: "Add your FAQs, policies, product details and opening hours. The AI answers only from this information.",
  },
  {
    title: "The AI replies to your customers",
    body: "Customers get an accurate answer in seconds, in their language, at any hour.",
  },
  {
    title: "Your team takes over when needed",
    body: "When a customer asks for a person, or the AI can't help, the conversation moves to your team's shared inbox.",
  },
];

const AUDIENCES = [
  { title: "Shops and online stores", body: "Product, delivery and return questions." },
  { title: "Clinics, salons and studios", body: "Appointments, timings and services." },
  { title: "Restaurants and cafés", body: "Menus, opening hours and reservations." },
  { title: "Service businesses", body: "Availability, pricing and follow-ups." },
];

const CONTROL = [
  "Every conversation in one shared inbox",
  "Take over from the AI at any time, and hand back when you're done",
  "The AI answers only from the information you add",
];

const FAQS: Array<{ question: string; answer: ReactNode }> = [
  {
    question: "Is this a general-purpose chatbot?",
    answer:
      "No. LiftOffSol answers your customers' questions about your business, using only the information you add. If it can't help, it hands the conversation to your team.",
  },
  {
    question: "Do I need a WhatsApp Business number?",
    answer:
      "Yes. You connect your business's number through Meta's WhatsApp Business Platform. Meta's messaging charges are billed to you separately by Meta.",
  },
  {
    question: "Can a person take over a conversation?",
    answer:
      "Yes. Anyone on your team with the right role can take over from the AI, reply to the customer, and hand the conversation back.",
  },
  {
    question: "Is our customers' data used to train AI models?",
    answer: (
      <>
        No. Messages are sent to our AI providers only to write replies. Our{" "}
        <Link className="text-primary underline underline-offset-2" to="/privacy">
          Privacy Policy
        </Link>{" "}
        has the details.
      </>
    ),
  },
];

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
    <div className="mb-10 grid max-w-2xl gap-3">
      <span className="text-sm font-medium text-primary">{eyebrow}</span>
      <h2 className="text-2xl font-medium tracking-tight">{title}</h2>
      <p className="text-muted-foreground">{body}</p>
    </div>
  );
}

/* A static picture of the product, drawn with the app's own tokens. */
function ProductShowcase({ className }: { className?: string }) {
  const nav: Array<{ icon: LucideIcon; label: string; active?: boolean }> = [
    { icon: LayoutDashboardIcon, label: "Overview" },
    { icon: InboxIcon, label: "Inbox", active: true },
    { icon: BotIcon, label: "Agents" },
    { icon: ContactIcon, label: "Contacts" },
  ];
  const queue = [
    {
      name: "Priya Nair",
      note: "Where is my refund?",
      state: "AI active",
      tone: "violet",
    },
    {
      name: "Jordan Lee",
      note: "I'd like to talk to a person",
      state: "Waiting",
      tone: "orange",
    },
    {
      name: "Sam Ortiz",
      note: "Thanks, that fixed it",
      state: "Resolved",
      tone: "success",
    },
  ];

  return (
    <figure
      className={cn("overflow-hidden rounded-2xl border bg-card text-left shadow-lg", className)}
      aria-label="Illustration of the LiftOffSol inbox"
    >
      <div className="grid xl:grid-cols-[9rem_1fr] 2xl:grid-cols-[9rem_12rem_1fr]">
        <div className="hidden border-r bg-sidebar p-3 xl:grid xl:content-start xl:gap-1">
          <p className="mb-3 flex items-center gap-2 px-2 text-sm font-medium">
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
        <div className="hidden border-r p-2 2xl:grid 2xl:content-start 2xl:gap-1">
          {queue.map((item, index) => (
            <div
              key={item.name}
              className={cn("grid gap-1 rounded-lg p-2.5", index === 0 && "bg-accent")}
            >
              <span className="text-sm font-medium">{item.name}</span>
              <span className="truncate text-xs text-muted-foreground">{item.note}</span>
              <span
                className="w-fit rounded-md border px-1.5 text-xs font-medium"
                style={{
                  color: `var(--${item.tone})`,
                  background: `var(--${item.tone}-bg)`,
                }}
              >
                {item.state}
              </span>
            </div>
          ))}
        </div>
        <div className="grid min-h-80 content-center gap-6 p-5 text-sm sm:p-6">
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
            <p className="max-w-md rounded-lg border bg-card px-3 py-2">
              Refunds go back to the original payment method within 5–7 business days of approval.
            </p>
          </div>
        </div>
      </div>
      <figcaption className="border-t bg-background px-4 py-3 text-xs text-muted-foreground">
        Illustrative example.
      </figcaption>
    </figure>
  );
}

export default function Home() {
  // The homepage is the landing screen for everyone, so a signed-in visitor
  // needs a way into the application rather than another sign-in prompt.
  const { user } = useAuth();
  const signedIn = Boolean(user);
  const primary = (
    <Button asChild size="lg">
      <Link to={signedIn ? "/app" : "/signin"}>
        {signedIn ? "Open your dashboard" : "Create an account"}
        <ArrowRightIcon />
      </Link>
    </Button>
  );
  const contact = (
    <Button asChild size="lg" variant="outline">
      <Link to="/contact">Contact us</Link>
    </Button>
  );

  return (
    <SiteLayout>
      <section className="border-b">
        <div className="mx-auto grid max-w-7xl items-center gap-12 px-4 py-16 md:px-6 md:py-24 lg:grid-cols-[1fr_1.15fr] lg:gap-12">
          <div>
            <span className="text-sm font-medium text-primary">
              AI customer support for the WhatsApp Business Platform
            </span>
            <h1 className="mt-6 max-w-xl text-[2.25rem] leading-[1.1] font-medium tracking-tight sm:text-display">
              Answer every customer on WhatsApp, day or night
            </h1>
            <p className="mt-6 max-w-xl text-md leading-relaxed text-subtle-foreground">
              {BUSINESS.name} gives your business an AI assistant that replies to your customers on
              WhatsApp. It answers questions about your products, orders, bookings and support from
              the information you give it, and hands the conversation to your team when a person is
              needed.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              {primary}
              {contact}
            </div>
            <p className="mt-4 text-sm text-muted-foreground">
              {signedIn
                ? `Signed in as ${user?.email ?? ""}`
                : "Not a general-purpose chatbot: it answers only for your business, from your information."}
            </p>
          </div>
          <ProductShowcase />
        </div>
      </section>

      <section id="answers" className="scroll-mt-16 border-b bg-card py-16 md:py-24">
        <div className="mx-auto max-w-6xl px-4 md:px-6">
          <SectionHeading
            eyebrow="What it answers"
            title="The questions your customers ask most"
            body="Customers get a reply in seconds, while your team focuses on the conversations that need a person."
          />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {ANSWERS.map((item) => (
              <article key={item.title} className="grid content-start gap-4 border-t p-5 pt-6">
                <span className="flex size-8 items-center">
                  <item.icon className="size-5 text-muted-foreground" aria-hidden="true" />
                </span>
                <h3 className="font-medium">{item.title}</h3>
                <p className="text-sm text-muted-foreground">{item.body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="how" className="scroll-mt-16 border-b py-16 md:py-24">
        <div className="mx-auto max-w-6xl px-4 md:px-6">
          <SectionHeading
            eyebrow="How it works"
            title="From your WhatsApp number to answered customers"
            body="Four steps, and none of them need an engineer."
          />
          <ol className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map((step, index) => (
              <li key={step.title} className="grid content-start gap-4 border-t p-5 pt-6">
                <span className="flex size-8 items-center justify-center rounded-md border bg-card font-mono text-sm text-primary">
                  {index + 1}
                </span>
                <h3 className="font-medium">{step.title}</h3>
                <p className="text-sm text-muted-foreground">{step.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section id="who" className="scroll-mt-16 border-b py-16 md:py-24">
        <div className="mx-auto grid max-w-6xl gap-12 px-4 md:px-6 lg:grid-cols-2">
          <div className="grid content-start gap-6">
            <div className="grid gap-3">
              <span className="text-sm font-medium text-primary">Who it's for</span>
              <h2 className="text-2xl font-medium tracking-tight">
                Made for small and medium businesses
              </h2>
              <p className="text-muted-foreground">
                For businesses that get the same questions on WhatsApp every day and want to answer
                them faster, without hiring a bigger team.
              </p>
            </div>
            <ul className="grid gap-5 sm:grid-cols-2">
              {AUDIENCES.map((audience) => (
                <li key={audience.title} className="grid gap-1 border-l-2 border-primary/30 pl-4">
                  <h3 className="font-medium">{audience.title}</h3>
                  <p className="text-sm text-muted-foreground">{audience.body}</p>
                </li>
              ))}
            </ul>
          </div>
          <div className="grid content-center gap-5 rounded-xl border bg-card p-6 sm:p-8">
            <h3 className="text-lg font-medium">Your team stays in control</h3>
            <ul className="grid gap-3">
              {CONTROL.map((point) => (
                <li key={point} className="flex gap-3 text-subtle-foreground">
                  <CheckIcon className="mt-0.5 size-4 shrink-0 text-success" aria-hidden="true" />
                  {point}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <section id="faq" className="scroll-mt-16 border-b py-16 md:py-24">
        <div className="mx-auto max-w-3xl px-4 md:px-6">
          <SectionHeading
            eyebrow="FAQ"
            title="Questions people ask first"
            body={`Short answers about how ${BUSINESS.name} works.`}
          />
          <div className="grid gap-3">
            {FAQS.map((faq) => (
              <details key={faq.question} className="group rounded-lg border bg-card px-5 py-5">
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

      <section className="py-16 md:py-24">
        <div className="mx-auto max-w-6xl px-4 md:px-6">
          <div className="grid justify-items-start gap-5 rounded-xl border bg-card px-6 py-10 text-left sm:px-10">
            <h2 className="text-2xl font-medium tracking-tight">
              Start answering customers faster
            </h2>
            <p className="max-w-xl text-muted-foreground">
              Create an account, or tell us about your business and we'll help you get set up.
            </p>
            <div className="flex flex-wrap gap-3">
              {primary}
              {contact}
            </div>
          </div>
        </div>
      </section>
    </SiteLayout>
  );
}
