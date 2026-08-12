import { Component, type ErrorInfo, type ReactNode } from 'react';
import { captureError } from '../lib/errorReporting';

/**
 * Last line of defence. Without this, a render-time throw unmounts the whole
 * tree and React leaves a blank white page — indistinguishable, to a visitor,
 * from a site that is simply down.
 *
 * Deliberately plain: no hooks, no router, no Supabase. Anything this component
 * depends on is something that can break it, and a broken error boundary is
 * worse than none.
 */

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    captureError(error, {
      where: 'ErrorBoundary',
      detail: { componentStack: info.componentStack?.slice(0, 1000) },
    });
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="min-h-screen flex items-center justify-center bg-surface px-6">
        <div className="card-brutal max-w-lg w-full p-6 sm:p-8">
          <h1 className="text-xl font-black uppercase tracking-tight mb-3">
            Something broke on this page
          </h1>
          <p className="text-sm text-ink-600 dark:text-muted-foreground mb-5">
            This is our fault, not yours. The error has been recorded. Reloading
            usually clears it — if it does not, please get in touch and tell us
            what you were doing.
          </p>

          {/* The message is shown deliberately. A support email saying "it says
              relation does not exist" is worth an hour of guessing. */}
          <p className="font-mono text-2xs break-words border-2 border-ink-200 dark:border-border bg-paper dark:bg-muted/20 p-3 mb-5">
            {error.message}
          </p>

          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="btn-brutal text-sm min-h-[44px]"
            >
              Reload the page
            </button>
            <a href="/public/contact" className="btn-brutal-outline text-sm min-h-[44px] inline-flex items-center">
              Contact us
            </a>
          </div>
        </div>
      </div>
    );
  }
}
