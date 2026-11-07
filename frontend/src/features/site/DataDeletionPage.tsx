import { MailIcon } from "lucide-react";

import { Button } from "@/components/ui/button.tsx";

import { BUSINESS } from "./business.ts";
import { SitePage, SiteSection } from "./SitePage.tsx";

const SUBJECT = "Data Deletion Request";
const requestHref = `mailto:${BUSINESS.email}?subject=${encodeURIComponent(SUBJECT)}`;

export default function DataDeletionPage() {
  return (
    <SitePage
      title="Data Deletion"
      dated
      intro={`You can ask ${BUSINESS.name} to delete your account and all the data we hold for it at any time.`}
    >
      <SiteSection title="How to request deletion">
        <p>
          Email <a href={requestHref}>{BUSINESS.email}</a> with the subject “{SUBJECT}” and include:
        </p>
        <ul>
          <li>your business name;</li>
          <li>the WhatsApp Business phone number connected to {BUSINESS.name}.</li>
        </ul>
        <p>
          Send it from the email address on your {BUSINESS.name} account, so we can confirm the
          request is yours.
        </p>
        <div>
          <Button asChild>
            <a href={requestHref}>
              <MailIcon />
              Email a deletion request
            </a>
          </Button>
        </div>
      </SiteSection>

      <SiteSection title={`If you messaged a business that uses ${BUSINESS.name}`}>
        <p>
          You can ask that business to delete your data, or email us with the subject “{SUBJECT}”,
          the business's name and your WhatsApp number. We will handle it together with the
          business.
        </p>
      </SiteSection>

      <SiteSection title="What gets deleted">
        <ul>
          <li>your business account and your team members' profiles;</li>
          <li>the connected WhatsApp Business account details and our access to it;</li>
          <li>your contacts, conversations and messages;</li>
          <li>your uploaded documents, business information and AI assistant settings;</li>
          <li>your usage records.</li>
        </ul>
        <p>
          We keep only what the law requires us to keep, such as billing and tax records, and delete
          it when that period ends.
        </p>
      </SiteSection>

      <SiteSection title="Timeline">
        <p>
          We confirm your request by email and complete the deletion within 30 days of receiving it.
        </p>
      </SiteSection>

      <SiteSection title={`Disconnecting WhatsApp from ${BUSINESS.name}`}>
        <p>
          To stop {BUSINESS.name} from sending and receiving messages for your number, remove{" "}
          {BUSINESS.name}'s access in your Meta business settings, where you manage the apps and
          partners connected to your WhatsApp Business account. You can also email us and we will
          disconnect it for you.
        </p>
        <p>
          Disconnecting stops the service for that number but does not delete the data already
          stored. To delete it, send a deletion request as described above.
        </p>
      </SiteSection>
    </SitePage>
  );
}
