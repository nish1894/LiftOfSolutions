import type { ReactNode } from "react";

import { POLICIES_UPDATED } from "./business.ts";
import SiteLayout from "./SiteLayout.tsx";

interface SitePageProps {
  title: string;
  intro?: ReactNode;
  /** Shows the policies' effective date under the title. */
  dated?: boolean;
  children: ReactNode;
}

/* A text page of the public site (About, Contact, the policies): a title and readable sections. */
export function SitePage({ title, intro, dated = false, children }: SitePageProps) {
  return (
    <SiteLayout>
      <article className="mx-auto max-w-3xl px-4 py-12 md:px-6 md:py-16">
        <h1 className="text-[2rem] leading-tight font-medium tracking-tight">{title}</h1>
        {dated && (
          <p className="mt-3 text-sm text-muted-foreground">Effective date: {POLICIES_UPDATED}</p>
        )}
        {intro && <p className="mt-5 text-md leading-relaxed text-subtle-foreground">{intro}</p>}
        <div className="mt-10 grid gap-10">{children}</div>
      </article>
    </SiteLayout>
  );
}

export function SiteSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="grid gap-3 leading-relaxed text-subtle-foreground [&_li_a]:text-primary [&_li_a]:underline [&_li_a]:underline-offset-2 [&_p_a]:text-primary [&_p_a]:underline [&_p_a]:underline-offset-2 [&_strong]:font-medium [&_strong]:text-foreground [&_ul]:grid [&_ul]:list-disc [&_ul]:gap-2 [&_ul]:pl-5">
      <h2 className="text-lg font-medium text-foreground">{title}</h2>
      {children}
    </section>
  );
}
