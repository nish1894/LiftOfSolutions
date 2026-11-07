import { Link } from "react-router-dom";

import { BUSINESS } from "./business.ts";
import { SitePage, SiteSection } from "./SitePage.tsx";

// How long message content and metadata are kept before they are deleted or anonymised.
const MESSAGE_RETENTION_DAYS = 90;

const mail = <a href={`mailto:${BUSINESS.email}`}>{BUSINESS.email}</a>;

export default function PrivacyPage() {
  return (
    <SitePage title="Privacy Policy" dated>
      <SiteSection title="Who we are">
        <p>
          {BUSINESS.name} (“we”, “us”) provides AI-powered customer support for businesses on the
          WhatsApp Business Platform. {BUSINESS.name} is a sole proprietorship registered in India
          (MSME/Udyam registered).
        </p>
        <p>
          Address: {BUSINESS.address}
          <br />
          Email: {mail}
        </p>
        <p>
          This policy explains what personal data we collect, how we use and share it, how long we
          keep it, and the rights you have under India's Digital Personal Data Protection Act, 2023
          (the “DPDP Act”).
        </p>
      </SiteSection>

      <SiteSection title="Our role">
        <p>
          For the account of a business that uses {BUSINESS.name}, we decide how that account's data
          is used. For the conversations between a business and its customers, the business decides
          why the data is processed, and we process it on the business's behalf to provide the
          service. If you messaged a business that uses {BUSINESS.name}, you can contact that
          business or us about your data.
        </p>
      </SiteSection>

      <SiteSection title="Data we collect">
        <ul>
          <li>
            <strong>Business account details:</strong> the name, email address and phone number of
            the people who sign up and of the team members they invite, and the business's name. If
            you sign in with Google, we receive your name, email address and profile photo from
            Google.
          </li>
          <li>
            <strong>WhatsApp Business account details:</strong> the WhatsApp Business account and
            phone number connected to {BUSINESS.name}, their display name, and the access details
            needed to send and receive messages through Meta.
          </li>
          <li>
            <strong>End-customer details:</strong> the phone numbers and WhatsApp profile names of
            the people who message a business, and any details they share in the conversation.
          </li>
          <li>
            <strong>Message content and metadata:</strong> the messages exchanged, and their times,
            delivery status and the conversation they belong to.
          </li>
          <li>
            <strong>Business content:</strong> the documents and information a business adds so the
            AI can answer its customers.
          </li>
          <li>
            <strong>Usage data:</strong> how the service is used, such as sign-ins, changes to
            settings and the amount of AI processing used.
          </li>
          <li>
            <strong>Cookies and similar storage:</strong> we use your browser's storage to keep you
            signed in and to remember preferences such as light or dark mode and the last project
            you opened. We do not use advertising or tracking cookies.
          </li>
        </ul>
      </SiteSection>

      <SiteSection title="How we use data">
        <ul>
          <li>
            <strong>To provide AI customer support:</strong> to write replies to customers'
            messages, send and receive WhatsApp messages, and pass conversations to the business's
            team.
          </li>
          <li>
            <strong>To operate the service:</strong> sign-in, security, preventing misuse, and
            support.
          </li>
          <li>
            <strong>To improve quality:</strong> to find and fix errors and see how well the service
            works.
          </li>
          <li>
            <strong>For billing:</strong> to measure usage and charge for the service.
          </li>
          <li>
            <strong>For legal compliance:</strong> to meet our legal obligations and respond to
            lawful requests.
          </li>
        </ul>
      </SiteSection>

      <SiteSection title="AI processing">
        <p>
          To write a reply, we send the customer's message, the recent conversation and the relevant
          parts of the business's information to a third-party AI provider: OpenAI or Google
          (Gemini), depending on the AI model the business chooses. They process this data only to
          generate the reply.
        </p>
        <p>
          We do not use your data, or your customers' data, to train AI models, including public
          models. AI replies can be wrong; businesses can read every conversation and take over from
          the AI at any time.
        </p>
      </SiteSection>

      <SiteSection title="Who we share data with">
        <ul>
          <li>
            <strong>Meta Platforms (WhatsApp Business Platform):</strong> messages are sent and
            received through Meta's platform, under Meta's terms.
          </li>
          <li>
            <strong>AI providers:</strong> OpenAI and Google (Gemini), as described above.
          </li>
          <li>
            <strong>Hosting and database providers:</strong> Vercel (website hosting), Google Cloud
            through Firebase (sign-in and database) and Pinecone (search index for business
            information).
          </li>
          <li>
            <strong>Authorities:</strong> when the law requires it.
          </li>
        </ul>
        <p>We do not sell personal data, and we do not share it for advertising.</p>
      </SiteSection>

      <SiteSection title="Storage, location and retention">
        <p>
          Data is stored with the providers listed above, on servers that may be in India or in
          other countries, including the United States. We transfer data outside India only as the
          DPDP Act allows.
        </p>
        <ul>
          <li>
            <strong>Message logs</strong> (message content and metadata) are kept for{" "}
            {MESSAGE_RETENTION_DAYS} days, then deleted or anonymised.
          </li>
          <li>
            <strong>Business account details and business content</strong> are kept while the
            account is open, and deleted within 30 days of a deletion request or of the account
            being closed.
          </li>
          <li>
            <strong>Uploaded documents</strong> are removed from temporary storage within 24 hours
            of being processed. The information taken from them is kept until the business deletes
            it.
          </li>
          <li>
            <strong>Records of account changes</strong>, kept for security, are deleted after one
            year.
          </li>
          <li>
            <strong>Billing and tax records</strong> are kept for as long as Indian law requires.
          </li>
        </ul>
      </SiteSection>

      <SiteSection title="Security">
        <ul>
          <li>All connections to {BUSINESS.name} use HTTPS.</li>
          <li>Stored data is encrypted by our hosting and database providers.</li>
          <li>
            Access inside a business account is limited by roles and per-project permissions, and
            changes to the account are recorded.
          </li>
          <li>Only the people who need it to run the service can access its data.</li>
        </ul>
        <p>
          No method of storing or sending data is completely secure. If a breach affects your
          personal data, we will tell you and the Data Protection Board of India, as the DPDP Act
          requires.
        </p>
      </SiteSection>

      <SiteSection title="Your rights">
        <p>Under the DPDP Act, you have the right to:</p>
        <ul>
          <li>get a summary of the personal data we hold about you and how we process it;</li>
          <li>have your personal data corrected, completed or updated;</li>
          <li>have your personal data deleted;</li>
          <li>withdraw your consent at any time, as easily as you gave it;</li>
          <li>have your grievances addressed;</li>
          <li>
            nominate someone to exercise these rights for you in the event of your death or
            incapacity.
          </li>
        </ul>
        <p>
          To use any of these rights, email {mail} from the email address linked to your account, or
          with enough detail for us to identify you. We reply within 30 days. If you messaged a
          business that uses {BUSINESS.name}, you can also ask that business. If you are not
          satisfied with our response, you can complain to the Data Protection Board of India.
        </p>
      </SiteSection>

      <SiteSection title="Data deletion">
        <p>
          To delete your account and data, follow the steps on our{" "}
          <Link to="/data-deletion">Data Deletion</Link> page.
        </p>
      </SiteSection>

      <SiteSection title="Grievance Officer">
        <p>
          {BUSINESS.grievanceOfficer}, Grievance Officer, {BUSINESS.name}
          <br />
          Email: {mail}
          <br />
          Address: {BUSINESS.address}
        </p>
      </SiteSection>

      <SiteSection title="Children">
        <p>
          {BUSINESS.name} is a service for businesses and is not intended for anyone under 18. We do
          not knowingly collect personal data from children. If you believe a child has given us
          personal data, contact us and we will delete it.
        </p>
      </SiteSection>

      <SiteSection title="Changes to this policy">
        <p>
          We may update this policy. We will post the new version on this page with a new effective
          date, and tell account holders by email about significant changes.
        </p>
      </SiteSection>
    </SitePage>
  );
}
