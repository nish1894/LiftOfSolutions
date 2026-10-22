import { Link, useNavigate } from "react-router-dom";

import { PageContainer } from "@/components/app/page.tsx";
import { Button } from "@/components/ui/button.tsx";

/* Error layout from the template's 404 / 403 pages (MIT): a large status
   code, a plain heading and a way out. */

interface ErrorPanelProps {
  code: string;
  title: string;
  description: string;
}

function ErrorPanel({ code, title, description }: ErrorPanelProps) {
  const navigate = useNavigate();
  return (
    <PageContainer size="narrow">
      <div className="flex flex-col items-center py-16 text-center md:py-24">
        <p className="text-display font-semibold tracking-tight text-muted-foreground/50 tabular-nums">
          {code}
        </p>
        <h1 className="mt-2 text-xl font-semibold tracking-tight">{title}</h1>
        <p className="mt-2 max-w-md text-muted-foreground">{description}</p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Button asChild>
            <Link to="/app/overview">Go to overview</Link>
          </Button>
          <Button variant="outline" onClick={() => navigate(-1)}>
            Go back
          </Button>
        </div>
      </div>
    </PageContainer>
  );
}

export default function NotFound() {
  return (
    <ErrorPanel
      code="404"
      title="Page not found"
      description="The link may be out of date, or the page has moved."
    />
  );
}

/** Shown instead of a page the member's role doesn't allow. */
export function NoAccess({ what }: { what: string }) {
  return (
    <ErrorPanel
      code="403"
      title={`You don't have access to ${what}`}
      description="Ask an admin in your organization to change your role or permissions."
    />
  );
}
