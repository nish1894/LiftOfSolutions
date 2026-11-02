import { Suspense, useState } from "react";
import { Outlet } from "react-router-dom";
import { toast } from "sonner";

import { LoadingRows } from "@/components/app/page.tsx";
import { Dialog, DialogTitle, SheetContent } from "@/components/ui/dialog.tsx";
import { useAuth } from "@/features/auth/AuthContext.ts";
import JoinInvitationDialog from "@/features/workspace/JoinInvitationDialog.tsx";
import { useWorkspace } from "@/features/workspace/workspace.ts";
import { useReturnFocus } from "@/hooks/use-return-focus.ts";

import AppSidebar from "./AppSidebar.tsx";
import MobileTabBar from "./MobileTabBar.tsx";
import SiteHeader from "./SiteHeader.tsx";

function VerifyEmailBanner() {
  const { resendVerification } = useAuth();
  const [sending, setSending] = useState(false);

  async function resend() {
    setSending(true);
    try {
      await resendVerification();
      toast.success("Verification email sent. Check your inbox.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "The email couldn't be sent.");
    } finally {
      setSending(false);
    }
  }

  return (
    <div
      className="border-b border-warning-border bg-warning-bg px-4 py-2 text-sm text-warning lg:px-6"
      role="status"
    >
      Verify your email address to keep your account secure.{" "}
      <button type="button" className="font-medium underline" onClick={resend} disabled={sending}>
        {sending ? "Sending…" : "Resend verification email"}
      </button>
    </div>
  );
}

/* Shell from the Clean Modern design: a full-width top bar (brand, tenant pill,
   search, escalations, account) over a fixed 240px sidebar. On phones the
   sidebar becomes a drawer and a bottom tab bar holds the busiest sections. */
export default function AppLayout() {
  const { user } = useWorkspace();
  const [menuOpen, setMenuOpen] = useState(false);
  const returnFocus = useReturnFocus();

  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <SiteHeader onOpenMenu={() => setMenuOpen(true)} />
      {!user.email_verified && <VerifyEmailBanner />}
      <div className="flex flex-1">
        <aside className="sticky top-14 hidden h-[calc(100dvh-3.5rem)] w-60 shrink-0 border-r bg-sidebar md:flex">
          <AppSidebar />
        </aside>
        <main className="flex min-w-0 flex-1 flex-col pb-16 md:pb-0">
          {/* Pages are lazy-loaded; keep the shell on screen while one downloads. */}
          <Suspense fallback={<LoadingRows />}>
            <Outlet />
          </Suspense>
        </main>
      </div>
      <Dialog open={menuOpen} onOpenChange={setMenuOpen}>
        <SheetContent side="left" className="w-64" aria-describedby={undefined} {...returnFocus}>
          <DialogTitle className="sr-only">Menu</DialogTitle>
          <AppSidebar onNavigate={() => setMenuOpen(false)} />
        </SheetContent>
      </Dialog>
      <MobileTabBar onOpenMenu={() => setMenuOpen(true)} />
      <JoinInvitationDialog />
    </div>
  );
}
