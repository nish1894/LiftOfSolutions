import { Suspense, useState } from "react";
import { Outlet } from "react-router-dom";
import { toast } from "sonner";

import { LoadingRows } from "@/components/app/page.tsx";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar.tsx";
import { useAuth } from "@/features/auth/AuthContext.ts";
import { useWorkspace } from "@/features/workspace/workspace.ts";

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
    <div className="border-b bg-warning-bg px-4 py-2 text-sm text-warning lg:px-6" role="status">
      Verify your email address to keep your account secure.{" "}
      <button type="button" className="font-medium underline" onClick={resend} disabled={sending}>
        {sending ? "Sending…" : "Resend verification email"}
      </button>
    </div>
  );
}

/* Shell from the ShadcnStore template (MIT): inset sidebar that collapses to
   icons, a sticky header with ⌘K search, and a bottom tab bar on phones. */
export default function AppLayout() {
  const { user } = useWorkspace();

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <SiteHeader />
        {!user.email_verified && <VerifyEmailBanner />}
        <div className="flex min-h-0 flex-1 flex-col pb-16 md:pb-0">
          {/* Pages are lazy-loaded; keep the shell on screen while one downloads. */}
          <Suspense fallback={<LoadingRows />}>
            <Outlet />
          </Suspense>
        </div>
      </SidebarInset>
      <MobileTabBar />
    </SidebarProvider>
  );
}
