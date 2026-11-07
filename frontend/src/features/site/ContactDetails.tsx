import { ClockIcon, type LucideIcon, MailIcon, MapPinIcon, PhoneIcon } from "lucide-react";

import { BUSINESS } from "./business.ts";

const ROWS: Array<{ icon: LucideIcon; label: string; value: string; href?: string }> = [
  { icon: MapPinIcon, label: "Address", value: BUSINESS.address },
  { icon: PhoneIcon, label: "Phone", value: BUSINESS.phone, href: BUSINESS.phoneHref },
  { icon: MailIcon, label: "Email", value: BUSINESS.email, href: `mailto:${BUSINESS.email}` },
  { icon: ClockIcon, label: "Business hours", value: BUSINESS.hours },
];

/* The business's contact details, as on the About and Contact pages. */
export default function ContactDetails() {
  return (
    <dl className="grid gap-4 rounded-xl border bg-card p-5 sm:p-6">
      {ROWS.map((row) => (
        <div key={row.label} className="flex gap-3">
          <row.icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <div className="grid gap-0.5">
            <dt className="text-sm text-muted-foreground">{row.label}</dt>
            <dd className="text-foreground">
              {row.href ? (
                <a className="hover:underline" href={row.href}>
                  {row.value}
                </a>
              ) : (
                row.value
              )}
            </dd>
          </div>
        </div>
      ))}
    </dl>
  );
}
