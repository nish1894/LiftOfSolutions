import type { ReactElement } from "react";
import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

interface RenderOptions {
  route?: string;
  client?: QueryClient;
}

/**
 * Renders inside the same providers main.jsx installs, so a component under
 * test behaves the way it does in the running app. Retries are off: a test
 * asserting on an error should fail fast, not wait out a backoff.
 */
export function renderWithProviders(ui: ReactElement, { route = "/", client }: RenderOptions = {}) {
  const queryClient =
    client ??
    new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });

  return {
    queryClient,
    ...render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={[route]}>{ui}</MemoryRouter>
      </QueryClientProvider>,
    ),
  };
}
