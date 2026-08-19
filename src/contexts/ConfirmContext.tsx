import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
  type ReactNode,
} from 'react';

export interface ConfirmOptions {
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'default' | 'danger';
}

interface ConfirmState extends ConfirmOptions {
  open: boolean;
}

interface ConfirmContextValue {
  confirm: (options: ConfirmOptions) => Promise<boolean>;
}

const ConfirmContext = createContext<ConfirmContextValue | null>(null);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<ConfirmState | null>(null);
  const resolveRef = useRef<((value: boolean) => void) | null>(null);

  const confirm = useCallback((options: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      resolveRef.current = resolve;
      setState({ ...options, open: true });
    });
  }, []);

  const close = (result: boolean) => {
    setState(null);
    resolveRef.current?.(result);
    resolveRef.current = null;
  };

  return (
    <ConfirmContext.Provider value={{ confirm }}>
      {children}
      {state?.open && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-ink-950/40 p-4 backdrop-blur-[2px]"
          role="presentation"
          onClick={() => close(false)}
        >
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="confirm-title"
            aria-describedby="confirm-desc"
            className="card-brutal w-full max-w-md bg-white p-5 shadow-brutal-lg dark:bg-card"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="confirm-title" className="text-lg font-bold text-ink-950 dark:text-foreground">
              {state.title}
            </h2>
            <p
              id="confirm-desc"
              className="mt-2 text-sm leading-relaxed text-ink-600 dark:text-muted-foreground whitespace-pre-line"
            >
              {state.description}
            </p>
            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={() => close(false)}
                className="btn-brutal-outline min-h-[40px] px-4 text-sm"
              >
                {state.cancelLabel ?? 'Cancel'}
              </button>
              <button
                type="button"
                onClick={() => close(true)}
                className={
                  state.variant === 'danger'
                    ? 'btn-brutal-accent min-h-[40px] px-4 text-sm'
                    : 'btn-brutal-teal min-h-[40px] px-4 text-sm'
                }
              >
                {state.confirmLabel ?? 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error('useConfirm must be used within ConfirmProvider');
  return ctx.confirm;
}
