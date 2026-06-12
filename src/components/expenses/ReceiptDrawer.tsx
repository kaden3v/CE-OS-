import { useEffect, useState } from "react";
import { X, ExternalLink, FileText, Loader2 } from "lucide-react";
import { receiptSignedUrl, isPdfReceipt } from "@/lib/receipts";

/**
 * Right-side drawer that previews a receipt. Resolves a short-lived signed URL
 * for the private object on open; renders images inline and PDFs in an iframe.
 */
export function ReceiptDrawer({ path, onClose }: { path: string | null; onClose: () => void }) {
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!path) {
      setUrl(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    receiptSignedUrl(path, 3600).then((u) => {
      if (cancelled) return;
      setUrl(u);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [path]);

  useEffect(() => {
    if (!path) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [path, onClose]);

  if (!path) return null;
  const pdf = isPdfReceipt(path);

  return (
    <>
      <div className="fixed inset-0 bg-bg-base/70 backdrop-blur-sm z-50" onClick={onClose} />
      <div className="fixed right-0 top-0 bottom-0 w-[min(560px,100vw)] bg-bg-elevated border-l border-border-strong z-50 flex flex-col shadow-2xl">
        <div className="flex items-center justify-between p-4 border-b border-border-subtle shrink-0">
          <h2 className="text-base font-medium">Receipt</h2>
          <div className="flex items-center gap-1">
            {url && (
              <a
                href={url}
                target="_blank"
                rel="noreferrer"
                className="p-2 rounded-lg text-text-secondary hover:text-text-primary transition-colors"
                aria-label="Open in new tab"
              >
                <ExternalLink className="w-5 h-5" />
              </a>
            )}
            <button
              onClick={onClose}
              aria-label="Close"
              className="p-2 rounded-lg text-text-secondary hover:text-text-primary transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-auto p-4 flex items-center justify-center bg-bg-base">
          {loading && <Loader2 className="w-6 h-6 animate-spin text-text-tertiary" />}
          {!loading && !url && (
            <div className="text-sm text-text-secondary flex flex-col items-center gap-2">
              <FileText className="w-8 h-8 opacity-50" />
              Couldn't load receipt.
            </div>
          )}
          {!loading && url && (
            pdf ? (
              <iframe title="Receipt PDF" src={url} className="w-full h-full min-h-[70vh] rounded-lg border border-border-subtle bg-white" />
            ) : (
              <img src={url} alt="Receipt" className="max-w-full max-h-full object-contain rounded-lg" />
            )
          )}
        </div>
      </div>
    </>
  );
}
