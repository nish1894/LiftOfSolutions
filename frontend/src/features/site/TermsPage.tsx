import { Link } from "react-router-dom";

import { BUSINESS } from "./business.ts";
import { SitePage, SiteSection } from "./SitePage.tsx";

const mail = <a href={`mailto:${BUSINESS.email}`}>{BUSINESS.email}</a>;

export default function TermsPage() {
  return (
    <SitePage
      title="Terms of Service"
      dated
      intro={`These terms apply to your use of ${BUSINESS.name}. By creating an account or using the service, you agree to them on behalf of your business.`}
    >
      <SiteSection title="The service">
        <p>
          {BUSINESS.name} provides AI-powered customer support for businesses on the WhatsApp
          Business Platform. You connect your WhatsApp Business number and add your business's
          information; our AI replies to your customers' questions using that information, and your
          team can take over any conversation in a shared inbox. {BUSINESS.name} is not a
          general-purpose chatbot.
        </p>
        <p>WhatsApp is a trademark of Meta Platforms, Inc.</p>
      </SiteSection>

      <SiteSection title="Your account">
        <ul>
          <li>Give accurate information when you sign up, and keep it up to date.</li>
          <li>
            Keep your sign-in details safe. You are responsible for what happens in your account,
            including what your team members do.
          </li>
          <li>You must be at least 18 and able to act for your business.</li>
        </ul>
      </SiteSection>

      <SiteSection title="Acceptable use">
        <p>You agree not to use {BUSINESS.name} to:</p>
        <ul>
          <li>send spam, or messages to people who have not agreed to hear from you;</li>
          <li>
            break the WhatsApp Business Messaging Policy, the WhatsApp Commerce Policy or Meta's
            other terms;
          </li>
          <li>send unlawful, misleading, harmful or offensive content;</li>
          <li>sell or promote goods and services that WhatsApp or Indian law do not allow;</li>
          <li>
            interfere with the service, get around its limits, or access other businesses' data.
          </li>
        </ul>
      </SiteSection>

      <SiteSection title="Your responsibilities">
        <ul>
          <li>
            <strong>Opt-in:</strong> get your customers' agreement before you message them on
            WhatsApp, as Meta requires, and respect requests to stop.
          </li>
          <li>
            <strong>Your content:</strong> you own the information you add and are responsible for
            it being accurate and lawful. You allow us to use it only to provide the service to you.
          </li>
          <li>
            <strong>AI replies:</strong> AI replies can be wrong. Set up your information carefully,
            review conversations, and take over when needed.
          </li>
          <li>
            <strong>Your customers' data:</strong> comply with the laws that apply to your business,
            including India's Digital Personal Data Protection Act, 2023. Our{" "}
            <Link to="/privacy">Privacy Policy</Link> explains how we handle data.
          </li>
        </ul>
      </SiteSection>

      <SiteSection title="Fees and billing">
        <ul>
          <li>
            Our fees are the ones shown when you sign up or agreed with us in writing, plus
            applicable taxes.
          </li>
          <li>
            WhatsApp messaging charges are set by Meta and billed to you separately by Meta. They
            are not part of our fees.
          </li>
          <li>We may change our fees with 30 days' notice by email.</li>
        </ul>
      </SiteSection>

      <SiteSection title="Availability">
        <p>
          We work to keep {BUSINESS.name} running, but the service is provided “as is”, without a
          promise that it will always be available or free of errors. Meta may also restrict or
          suspend a WhatsApp Business account independently of us.
        </p>
      </SiteSection>

      <SiteSection title="Limitation of liability">
        <p>
          To the extent the law allows, {BUSINESS.name} is not liable for indirect or consequential
          losses, such as lost profits, lost data or lost business, and our total liability for any
          claim is limited to the fees you paid us in the 12 months before the claim. Nothing in
          these terms limits liability that cannot be limited by law.
        </p>
      </SiteSection>

      <SiteSection title="Suspension and termination">
        <ul>
          <li>You can stop using {BUSINESS.name} at any time and ask us to delete your data.</li>
          <li>
            We may suspend or close an account that breaks these terms or Meta's policies, or that
            is not paid for, and will tell you why.
          </li>
          <li>
            When an account closes, its data is deleted as described on our{" "}
            <Link to="/data-deletion">Data Deletion</Link> page.
          </li>
        </ul>
      </SiteSection>

      <SiteSection title="Changes to these terms">
        <p>
          We may update these terms. We will post the new version on this page with a new effective
          date, and tell account holders by email about significant changes. Using the service after
          a change means you accept the new terms.
        </p>
      </SiteSection>

      <SiteSection title="Governing law">
        <p>
          These terms are governed by the laws of India. The courts in Bengaluru, Karnataka, have
          exclusive jurisdiction over any dispute about them.
        </p>
      </SiteSection>

      <SiteSection title="Contact">
        <p>
          {BUSINESS.name}, {BUSINESS.address}
          <br />
          Email: {mail} · Phone: <a href={BUSINESS.phoneHref}>{BUSINESS.phone}</a>
        </p>
      </SiteSection>
    </SitePage>
  );
}
