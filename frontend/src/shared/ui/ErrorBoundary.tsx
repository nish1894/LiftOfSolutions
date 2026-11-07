import { Component, type ErrorInfo, type ReactNode } from "react";

/* Without this, any render-time throw unmounts the whole tree and leaves a
   blank white page with the real error only in the console. Class syntax is
   required: React exposes no hook equivalent for error boundaries. */
interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Unhandled render error", error, info);
  }

  override render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <main className="grid min-h-dvh place-items-center bg-background px-4" role="alert">
        <div className="grid w-full max-w-lg gap-4 rounded-lg border bg-card p-6">
          <h1 className="text-lg font-semibold">Something broke on this screen</h1>
          {/* The error itself stays in the console: its text can name internals. */}
          <p className="text-sm text-muted-foreground">
            Something went wrong while showing this page. Reloading usually clears it. If it keeps
            happening, contact us and tell us what you were doing.
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="h-9 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground"
              onClick={() => this.setState({ error: null })}
            >
              Try again
            </button>
            <button
              type="button"
              className="h-9 rounded-md border px-3 text-sm font-medium"
              onClick={() => window.location.reload()}
            >
              Reload page
            </button>
          </div>
        </div>
      </main>
    );
  }
}
