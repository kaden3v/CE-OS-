import { useMemo } from "react";
import { sanitizeHTML } from "@/lib/sanitize";

/** Closed allowlist only — never pass user-controlled tag names. */
export type SafeHTMLRootTag = "div" | "span" | "section" | "article" | "aside";

type SafeHTMLProps = {
  html: string;
  /** @see {@link sanitizeHTML} strict mode */
  strict?: boolean;
  className?: string;
  /** Root element for sanitized markup. */
  as?: SafeHTMLRootTag;
};

/**
 * Renders sanitized HTML from user or API input. Do not use raw `dangerouslySetInnerHTML` outside this component.
 */
export function SafeHTML({ html, strict = true, className, as = "div" }: SafeHTMLProps) {
  const { clean, wasModified } = useMemo(() => sanitizeHTML(html, { strict }), [html, strict]);

  if (import.meta.env.DEV && wasModified) {
    console.warn("[SafeHTML] Output differs after sanitization", {
      strict,
      previewIn: html.slice(0, 200),
      previewOut: clean.slice(0, 200),
    });
  }

  const Tag = as;

  return (
    <Tag className={className} dangerouslySetInnerHTML={{ __html: clean }} />
  );
}
