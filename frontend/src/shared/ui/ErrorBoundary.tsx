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
      <main className="error-screen" role="alert">
        <div className="error-screen-card">
          <h1>Something broke on this screen</h1>
          <p>
            The rest of the application is still running. Reloading usually clears it; if it keeps
            happening, the message below is what to report.
          </p>
          <pre>{error.message || String(error)}</pre>
          <div className="error-screen-actions">
            <button
              type="button"
              className="btn-primary"
              onClick={() => this.setState({ error: null })}
            >
              Try again
            </button>
            <button type="button" className="btn-quiet" onClick={() => window.location.reload()}>
              Reload page
            </button>
          </div>
        </div>
      </main>
    );
  }
}
