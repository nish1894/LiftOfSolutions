/**
 * Marketing landing page for signed-out visitors.
 *
 * PLACEHOLDER COPY: the customer names, the testimonial, and the metrics below
 * are invented for layout purposes. Replace them with real, attributable
 * material before this is publicly deployed -- shipping invented social proof
 * as though it were genuine is misleading to visitors.
 */

import BrandMark from "./BrandMark.jsx";

const FEATURES = [
  {
    title: "Answers with the source attached",
    body: "Every reply points back to the document it came from, so your team can verify before acting on it. No guessing whether the assistant made something up.",
  },
  {
    title: "No data project required",
    body: "Upload the documents you already have — policies, contracts, specs, support history. There is no pipeline to build and no schema to design first.",
  },
  {
    title: "Right model for the job",
    body: "Quick lookups go to a fast, inexpensive model; involved analysis goes to a stronger one. Your team sees one chat box either way.",
  },
  {
    title: "Spend you can account for",
    body: "Usage is recorded per request, so cost can be attributed to the team or workflow that generated it instead of arriving as one opaque invoice.",
  },
];

const STEPS = [
  {
    number: "01",
    title: "Bring your documents",
    body: "Point it at the material your team already relies on. Formats you use day to day are handled as-is.",
  },
  {
    number: "02",
    title: "Ask in plain language",
    body: "No query syntax, no training. People ask the way they would ask a colleague who had read everything.",
  },
  {
    number: "03",
    title: "Act on cited answers",
    body: "Responses arrive with the passages they were drawn from, so the answer can be checked in seconds.",
  },
];

const USE_CASES = [
  { title: "Customer support", body: "Resolve tickets against current policy instead of a stale macro." },
  { title: "Sales enablement", body: "Answer product and pricing questions without waiting on an expert." },
  { title: "People & HR", body: "Give staff a straight answer on leave, benefits, and process." },
  { title: "Operations", body: "Find the clause, the spec, or the runbook step without hunting." },
];

// Placeholder customer names — fictional. Swap for real logos when available.
const CUSTOMERS = ["Northwind Retail", "Harbor Logistics", "Meridian Health", "Ashfield Legal"];

export default function Home({ onGetStarted }) {
  return (
    <main className="home">
      <header className="nav">
        <div className="container nav-inner">
          <a className="nav-brand" href="#top">
            <BrandMark size={32} className="small" />
            <span className="wordmark">Lift Off Solutions</span>
          </a>

          <nav className="nav-links" aria-label="Sections">
            <a href="#features">Features</a>
            <a href="#how">How it works</a>
            <a href="#use-cases">Use cases</a>
          </nav>

          <div className="nav-actions">
            <button type="button" className="link" onClick={onGetStarted}>
              Sign in
            </button>
            <button type="button" className="btn-primary" onClick={onGetStarted}>
              Get started
            </button>
          </div>
        </div>
      </header>

      <section className="hero" id="top">
        <div className="container hero-inner">
          <p className="eyebrow">For teams that answer questions all day</p>
          <h1>Your company's knowledge, answered in seconds</h1>
          <p className="lede">
            Lift Off Solutions reads the documents your business already runs on and answers
            questions about them in plain language — with the source passage attached, so nobody
            has to take the answer on trust.
          </p>

          <div className="hero-actions">
            <button type="button" className="btn-primary btn-lg" onClick={onGetStarted}>
              Get started free
            </button>
            <a className="btn-ghost btn-lg" href="#how">
              See how it works
            </a>
          </div>

          <p className="cta-note">No credit card required · Sign in with Google, GitHub, or email</p>
        </div>
      </section>

      <section className="proof" aria-label="Customers">
        <div className="container">
          <p className="proof-label">Built for teams like</p>
          <ul className="proof-list">
            {CUSTOMERS.map((name) => (
              <li key={name}>{name}</li>
            ))}
          </ul>
        </div>
      </section>

      <section className="band" id="features">
        <div className="container">
          <div className="band-head">
            <h2>Why teams choose it</h2>
            <p>Accuracy you can check, set up in an afternoon rather than a quarter.</p>
          </div>

          <div className="grid-4">
            {FEATURES.map((feature) => (
              <article key={feature.title} className="card">
                <h3>{feature.title}</h3>
                <p>{feature.body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="band alt" id="how">
        <div className="container">
          <div className="band-head">
            <h2>How it works</h2>
            <p>Three steps, and none of them need an engineer.</p>
          </div>

          <ol className="grid-3 steps">
            {STEPS.map((step) => (
              <li key={step.number} className="card step">
                <span className="step-number">{step.number}</span>
                <h3>{step.title}</h3>
                <p>{step.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="band" id="use-cases">
        <div className="container">
          <div className="band-head">
            <h2>Where it earns its keep</h2>
            <p>Anywhere the answer already exists but nobody can find it quickly.</p>
          </div>

          <div className="grid-4">
            {USE_CASES.map((useCase) => (
              <article key={useCase.title} className="card compact">
                <h3>{useCase.title}</h3>
                <p>{useCase.body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="band alt">
        <div className="container">
          {/* PLACEHOLDER: invented quote and attribution. Replace or remove. */}
          <figure className="quote">
            <blockquote>
              "Our support team used to keep six policy documents open in tabs. Now they ask one
              question and get the clause back with it. Onboarding a new agent takes days instead
              of weeks."
            </blockquote>
            <figcaption>
              <span className="quote-name">Operations Lead</span>
              <span className="quote-org">Harbor Logistics — illustrative example</span>
            </figcaption>
          </figure>
        </div>
      </section>

      <section className="final-cta">
        <div className="container final-inner">
          <h2>Put your documents to work</h2>
          <p>Create an account and ask your first question in a few minutes.</p>
          <button type="button" className="btn-primary btn-lg" onClick={onGetStarted}>
            Get started free
          </button>
        </div>
      </section>

      <footer className="site-footer">
        <div className="container footer-inner">
          <div className="footer-brand">
            <BrandMark size={32} className="small" />
            <span className="wordmark">Lift Off Solutions</span>
          </div>

          <nav className="footer-links" aria-label="Footer">
            <a href="#features">Features</a>
            <a href="#how">How it works</a>
            <a href="#use-cases">Use cases</a>
            <button type="button" className="link" onClick={onGetStarted}>
              Sign in
            </button>
          </nav>

          <p className="footer-note">
            © {new Date().getFullYear()} Lift Off Solutions. All rights reserved.
          </p>
        </div>
      </footer>
    </main>
  );
}
