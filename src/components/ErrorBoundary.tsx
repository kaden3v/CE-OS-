import { Component, type ErrorInfo, type ReactNode } from "react";
import { useLocation } from "react-router";

type ErrorBoundaryProps = {
  children: ReactNode;
};

type ErrorBoundaryState = {
  error: Error | null;
};

/**
 * Catches render errors in descendants. Use {@link RouteSyncedErrorBoundary}
 * so navigation remounts and clears the error state.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  declare readonly props: Readonly<ErrorBoundaryProps>;
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    if (import.meta.env.DEV) {
      console.error("[ErrorBoundary]", error, errorInfo.componentStack);
    }
    // Prod: reserved for Sentry / other reporting
  }

  render(): ReactNode {
    if (this.state.error) {
      return (
        <div className="min-h-screen flex flex-col items-center justify-center px-6 py-12 bg-[#F5F0E8] text-[#1A2E28]">
          <h1
            className="text-3xl font-semibold tracking-tight mb-3 text-center"
            style={{ fontFamily: '"Playfair Display", Georgia, serif' }}
          >
            Something went wrong
          </h1>
          <p className="text-sm text-[#1A2E28]/80 mb-6 max-w-md text-center font-sans">
            This page hit an unexpected error. Try reloading the app.
          </p>
          {import.meta.env.DEV ? (
            <pre className="text-xs text-left max-w-lg w-full overflow-auto p-3 rounded-lg bg-[#1A2E28]/5 border border-[#1A2E28]/10 mb-6 font-mono text-[#1A2E28]/90 whitespace-pre-wrap">
              {this.state.error.message}
            </pre>
          ) : null}
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="px-6 py-2 rounded-full text-sm font-medium bg-[#1A2E28] text-[#F5F0E8] hover:opacity-90 transition-opacity"
          >
            Reload
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

export function RouteSyncedErrorBoundary({ children }: { children: ReactNode }) {
  const location = useLocation();
  return <ErrorBoundary key={location.pathname}>{children}</ErrorBoundary>;
}
