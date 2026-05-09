import {
  useEffect,
  useId,
  useRef,
  type CSSProperties,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export type AddItemField<T extends Record<string, unknown>> = {
  name: keyof T & string;
  label: string;
  type: "text" | "number" | "select" | "date" | "textarea";
  options?: readonly { value: string; label: string }[];
  required?: boolean;
  placeholder?: string;
  /** Default full width; use `third` for compact numeric grids (e.g. juv / mat / flw). */
  width?: "full" | "third";
  labelClassName?: string;
};

export type AddItemModalProps<T extends Record<string, unknown>> = {
  open: boolean;
  onClose: () => void;
  /** Called after optional `validate` succeeds. */
  onSubmit: (values: T) => void;
  /** Return false to block submit (e.g. run useForm.validate()). */
  validate?: () => boolean;
  title: string;
  submitLabel: string;
  fields: AddItemField<T>[];
  values: T;
  setField: <K extends keyof T>(key: K, value: T[K]) => void;
  errors?: Partial<Record<keyof T, string>>;
  /**
   * Baseline row for add vs edit — drives a stable `key` on the form so switching edit targets remounts fields.
   * Parent should call `useForm.reset(initialValues)` when `open` becomes true.
   */
  initialValues: T;
  formId?: string;
};

export function AddItemModal<T extends Record<string, unknown>>({
  open,
  onClose,
  onSubmit,
  validate,
  title,
  submitLabel,
  fields,
  values,
  setField,
  errors = {},
  formId: formIdProp,
  initialValues,
}: AddItemModalProps<T>) {
  const autoFormId = useId();
  const formId = formIdProp ?? autoFormId;
  const panelRef = useRef<HTMLDivElement>(null);
  const lastFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    lastFocusRef.current = document.activeElement as HTMLElement | null;
    const frame = requestAnimationFrame(() => {
      const root = panelRef.current;
      if (!root) return;
      const first = root.querySelector<HTMLElement>(FOCUSABLE);
      first?.focus();
    });
    return () => {
      cancelAnimationFrame(frame);
      queueMicrotask(() => lastFocusRef.current?.focus?.());
    };
  }, [open]);

  if (!open) return null;

  const getFocusables = (): HTMLElement[] => {
    const root = panelRef.current;
    if (!root) return [];
    const nodes = Array.from(root.querySelectorAll(FOCUSABLE)) as HTMLElement[];
    return nodes.filter((el) => el.offsetParent !== null || el === document.activeElement);
  };

  const handlePanelKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      onClose();
      return;
    }
    if (e.key !== "Tab") return;
    const list = getFocusables();
    if (list.length === 0) return;
    const first = list[0]!;
    const last = list[list.length - 1]!;
    const active = document.activeElement;
    if (e.shiftKey) {
      if (active === first || (active instanceof Node && !panelRef.current?.contains(active))) {
        e.preventDefault();
        last.focus();
      }
    } else {
      if (active === last) {
        e.preventDefault();
        first.focus();
      }
    }
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (validate && !validate()) return;
    onSubmit(values);
  };

  const fieldClass =
    "w-full rounded-sm border border-[#1A2E28]/20 bg-white px-3 py-2 text-sm text-[#1A2E28] placeholder:text-[#1A2E28]/45 focus:outline-none focus:ring-2 focus:ring-[#1A2E28]/25";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#0E0F11]/55 backdrop-blur-sm"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${formId}-title`}
        tabIndex={-1}
        onKeyDown={handlePanelKeyDown}
        className={cn(
          "flex w-full max-w-md flex-col overflow-hidden rounded-sm border border-[#1A2E28]/15 bg-[#F5F0E8] shadow-2xl",
          "font-[family-name:var(--font-dm-sans)]"
        )}
        style={
          {
            ["--font-dm-sans" as string]: '"DM Sans", ui-sans-serif, system-ui, sans-serif',
          } as CSSProperties
        }
      >
        <div className="flex shrink-0 items-center justify-between border-b border-[#1A2E28]/10 p-4">
          <h2 id={`${formId}-title`} className="text-lg font-semibold text-[#1A2E28]">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-sm p-2 text-[#1A2E28]/70 transition-colors hover:bg-[#1A2E28]/5 hover:text-[#1A2E28]"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form
          key={JSON.stringify(initialValues)}
          id={formId}
          onSubmit={handleSubmit}
          className="flex max-h-[min(80vh,640px)] flex-col"
        >
          <div className="flex-1 overflow-auto p-4">
            <div className="grid grid-cols-3 gap-2 gap-y-4">
              {fields.map((f) => {
                const err = errors[f.name];
                const colClass = f.width === "third" ? "col-span-1" : "col-span-3";
                const val = values[f.name];

                return (
                  <div key={f.name} className={cn("space-y-2", colClass)}>
                    <label
                      className={cn("block font-medium text-[#1A2E28]", f.labelClassName ?? "text-sm")}
                    >
                      {f.label}
                      {f.required ? <span className="text-status-alert"> *</span> : null}
                    </label>
                    {f.type === "textarea" ? (
                      <textarea
                        required={f.required}
                        placeholder={f.placeholder}
                        className={cn(fieldClass, "min-h-[100px] resize-y")}
                        value={String(val ?? "")}
                        onChange={(e) => setField(f.name, e.target.value as T[keyof T])}
                      />
                    ) : f.type === "select" ? (
                      <select
                        required={f.required}
                        className={fieldClass}
                        value={String(val ?? "")}
                        onChange={(e) => setField(f.name, e.target.value as T[keyof T])}
                      >
                        {f.options?.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        type={f.type === "number" ? "number" : f.type === "date" ? "date" : "text"}
                        required={f.required}
                        placeholder={f.placeholder}
                        min={f.type === "number" ? 0 : undefined}
                        className={fieldClass}
                        value={f.type === "number" ? (typeof val === "number" ? val : Number(val) || 0) : String(val ?? "")}
                        onChange={(e) => {
                          if (f.type === "number") {
                            const n = parseInt(e.target.value, 10);
                            setField(f.name, (Number.isFinite(n) ? n : 0) as T[keyof T]);
                          } else {
                            setField(f.name, e.target.value as T[keyof T]);
                          }
                        }}
                      />
                    )}
                    {err ? <p className="text-xs text-[#D97366]">{err}</p> : null}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="flex shrink-0 justify-end gap-2 border-t border-[#1A2E28]/10 bg-[#F5F0E8]/90 p-4">
            <button
              type="button"
              onClick={onClose}
              className="rounded-full border border-[#1A2E28]/25 px-4 py-2 text-sm font-medium text-[#1A2E28] transition-colors hover:bg-[#1A2E28]/5"
            >
              Cancel
            </button>
            <button
              type="submit"
              form={formId}
              className="rounded-full bg-[#1A2E28] px-6 py-2 text-sm font-medium text-[#F5F0E8] transition-opacity hover:opacity-90"
            >
              {submitLabel}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
