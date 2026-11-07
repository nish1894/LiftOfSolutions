import { BUSINESS, OWNERSHIP } from "./business.ts";
import ContactDetails from "./ContactDetails.tsx";
import { SitePage, SiteSection } from "./SitePage.tsx";

export default function AboutPage() {
  return (
    <SitePage
      title="About LiftOffSol"
      intro="LiftOffSol builds AI-powered customer support for businesses on the WhatsApp Business Platform. We're based in Bengaluru, India."
    >
      <SiteSection title="Who we are">
        <p>
          {OWNERSHIP} We're based in Bengaluru, and we build software that helps small and medium
          businesses answer their customers on WhatsApp.
        </p>
      </SiteSection>
      <SiteSection title="What we do">
        <p>
          A business connects its WhatsApp Business number to {BUSINESS.name} and adds its own
          information: frequently asked questions, policies, product and service details, and
          opening hours. Our AI then replies to the business's customers about orders, bookings and
          support, using only that information, and hands the conversation to the business's team
          when a person is needed.
        </p>
        <p>
          It is not a general-purpose chatbot. Each AI assistant speaks for one business, about that
          business.
        </p>
      </SiteSection>
      <SiteSection title="Our mission">
        <p>
          To help every small and medium business answer its customers quickly and accurately, on
          the app those customers already use, without losing the personal touch.
        </p>
      </SiteSection>
      <SiteSection title="Contact us">
        <ContactDetails />
      </SiteSection>
    </SitePage>
  );
}
