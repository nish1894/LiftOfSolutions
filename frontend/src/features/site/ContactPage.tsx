import { Link } from "react-router-dom";
import { MailIcon, PhoneIcon } from "lucide-react";

import { Button } from "@/components/ui/button.tsx";

import { BUSINESS } from "./business.ts";
import ContactDetails from "./ContactDetails.tsx";
import { SitePage, SiteSection } from "./SitePage.tsx";

export default function ContactPage() {
  return (
    <SitePage
      title="Contact us"
      intro={`Questions about ${BUSINESS.name}, getting started, or your account? Write to us or call during business hours.`}
    >
      <div className="grid gap-4">
        <ContactDetails />
        <div className="flex flex-wrap gap-3">
          <Button asChild>
            <a href={`mailto:${BUSINESS.email}`}>
              <MailIcon />
              Email us
            </a>
          </Button>
          <Button asChild variant="outline">
            <a href={BUSINESS.phoneHref}>
              <PhoneIcon />
              Call us
            </a>
          </Button>
        </div>
      </div>
      <SiteSection title="Deleting your data">
        <p>
          To ask us to delete your account or your data, follow the steps on our{" "}
          <Link to="/data-deletion">Data Deletion</Link> page.
        </p>
      </SiteSection>
    </SitePage>
  );
}
