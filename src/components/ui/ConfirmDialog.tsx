import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";
import { Modal } from "./Modal";
import { Button } from "./Button";

export interface ConfirmOptions {
  title: string;
  /** Body copy. Say what will happen, especially anything irreversible. */
  message?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** "danger" for destructive actions — deletes, cancellations, revocations. */
  tone?: "default" | "danger";
}

type ConfirmFn = (options: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn | null>(null);

/**
 * Promise-based replacement for the native `window.confirm`.
 *
 * Destructive actions used to go through `confirm()` at 19 call sites: an
 * unstyleable OS dialog, visually unrelated to the app, especially jarring on a
 * phone, and invisible to the Playwright suite without a dialog handler. Keeping
 * the API promise-shaped means those call sites stay one-liners — `if (!(await
 * confirm({...}))) return;` — rather than each page growing its own
 * pending-confirmation state.
 */
export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [options, setOptions] = useState<ConfirmOptions | null>(null);
  const resolver = useRef<((value: boolean) => void) | null>(null);

  const confirm = useCallback<ConfirmFn>((opts) => {
    setOptions(opts);
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  const settle = useCallback((value: boolean) => {
    setOptions(null);
    resolver.current?.(value);
    resolver.current = null;
  }, []);

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <Modal
        open={options !== null}
        onClose={() => settle(false)}
        title={options?.title ?? ""}
        size="sm"
      >
        <div className="p-4 space-y-4">
          {options?.message && (
            <div className="text-sm text-text-secondary leading-relaxed">{options.message}</div>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={() => settle(false)}>
              {options?.cancelLabel ?? "Cancel"}
            </Button>
            <Button
              variant={options?.tone === "danger" ? "default" : "brand"}
              className={
                options?.tone === "danger"
                  ? "border-status-alert/40 text-status-alert hover:bg-status-alert hover:text-bg-base"
                  : undefined
              }
              onClick={() => settle(true)}
            >
              {options?.confirmLabel ?? "Confirm"}
            </Button>
          </div>
        </div>
      </Modal>
    </ConfirmContext.Provider>
  );
}

export function useConfirm(): ConfirmFn {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error("useConfirm must be used within a ConfirmProvider");
  return ctx;
}
