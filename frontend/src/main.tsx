import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "sonner";

// Self-hosted variable font: one file, no third-party request.
import "@fontsource-variable/inter";
import "@fontsource-variable/jetbrains-mono";
import "./styles/index.css";

import App from "./App.tsx";
import ErrorBoundary from "./shared/ui/ErrorBoundary.tsx";
import { AuthProvider } from "./features/auth/AuthProvider.tsx";
import { watchSystemTheme } from "./shared/theme.ts";

watchSystemTheme();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Workspace data is not so volatile that every remount needs a refetch,
      // but it must not go stale while someone is working in a tab.
      staleTime: 30_000,
      refetchOnWindowFocus: true,
      // A 401 is retried once by apiClient with a refreshed token; retrying a
      // 403 or 404 in the query layer just delays the error the user needs.
      retry: (failureCount: number, error: unknown) =>
        failureCount < 2 &&
        ![400, 401, 403, 404, 409, 422].includes((error as { status?: number })?.status ?? 0),
      // Otherwise every page that shares a failed list (e.g. knowledge in the sidebar badge and
      // on Overview) asks again on arrival. Window focus and "Try again" still refetch.
      retryOnMount: false,
    },
  },
});

createRoot(document.querySelector("#root")!).render(
  <StrictMode>
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <AuthProvider>
            <App />
          </AuthProvider>
        </BrowserRouter>
        <Toaster
          position="bottom-right"
          toastOptions={{
            style: {
              background: "var(--popover)",
              color: "var(--popover-foreground)",
              border: "1px solid var(--border)",
            },
          }}
        />
      </QueryClientProvider>
    </ErrorBoundary>
  </StrictMode>,
);
