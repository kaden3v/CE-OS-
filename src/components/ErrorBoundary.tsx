import React, { Component, ErrorInfo, ReactNode } from "react";
import { AlertTriangle } from "lucide-react";

type Props = { children: ReactNode };
type State = { error: Error | null };

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[ErrorBoundary]", error, info.componentStack);
  }

  reset = () => {
    this.setState({ error: null });
  };

  render() {
    if (this.state.error) {
      return (
        <div className="min-h-dvh flex items-center justify-center p-8 bg-bg-base text-text-primary">
          <div className="max-w-md w-full bg-bg-elevated border border-border-subtle rounded-xl p-6">
            <div className="flex items-center gap-2 mb-4 text-status-alert">
              <AlertTriangle className="w-5 h-5" />
              <h1 className="text-lg font-semibold">Something went wrong</h1>
            </div>
            <p className="text-sm text-text-secondary mb-4">
              The app hit an unexpected error. Your data is safe in local storage.
            </p>
            <pre className="text-xs bg-bg-base border border-border-subtle rounded p-2 mb-4 overflow-auto max-h-40 text-status-alert">
              {this.state.error.message}
            </pre>
            <div className="flex gap-2">
              <button
                onClick={this.reset}
                className="flex-1 px-4 py-2 rounded-md bg-bg-active text-text-primary border border-border-subtle hover:bg-bg-hover transition-colors text-sm font-medium"
              >
                Try again
              </button>
              <button
                onClick={() => window.location.reload()}
                className="flex-1 px-4 py-2 rounded-md bg-accent-brand-dim text-accent-brand border border-accent-brand/20 hover:bg-accent-brand hover:text-bg-base transition-colors text-sm font-medium"
              >
                Reload app
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
