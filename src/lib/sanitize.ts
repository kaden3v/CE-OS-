import DOMPurify from "dompurify";
import type { Config } from "dompurify";

export type SanitizeHTMLOptions = {
  /** Minimal tags (care notes, comments). Default false = heading/blockquote/code + img (sanitized). */
  strict?: boolean;
};

export type SanitizeHTMLResult = {
  clean: string;
  /** True if DOMPurify removed a tag/attribute or altered unsafe URL protocols. */
  wasModified: boolean;
};

const STRICT_TAGS = ["p", "strong", "em", "ul", "ol", "li", "br", "a"] as const;
const EXTENDED_TAGS = [
  ...STRICT_TAGS,
  "h2",
  "h3",
  "h4",
  "blockquote",
  "code",
  "pre",
  "img",
] as const;

const FORBID_TAGS = [
  "script",
  "style",
  "iframe",
  "object",
  "embed",
  "form",
  "input",
  "textarea",
  "button",
  "select",
  "link",
  "meta",
  "base",
];

/** Attributes allowed on remaining tags (no event handlers; DOMPurify blocks on* by default). */
const ALLOWED_ATTR = ["href", "title", "class", "src", "alt", "loading"] as const;

function baseConfig(strict: boolean): Config {
  return {
    ALLOWED_TAGS: [...(strict ? STRICT_TAGS : EXTENDED_TAGS)],
    ALLOWED_ATTR: [...ALLOWED_ATTR],
    FORBID_TAGS,
    ALLOW_DATA_ATTR: false,
    ALLOW_ARIA_ATTR: false,
    ALLOW_UNKNOWN_PROTOCOLS: false,
    KEEP_CONTENT: true,
  };
}

let linkHookInstalled = false;

function ensureLinkHook(): void {
  if (linkHookInstalled || typeof DOMPurify.addHook !== "function") return;
  DOMPurify.addHook("afterSanitizeAttributes", (node) => {
    if (node.tagName === "A" && node instanceof window.Element) {
      node.setAttribute("rel", "noopener noreferrer");
      node.setAttribute("target", "_blank");
    }
  });
  linkHookInstalled = true;
}

/**
 * Sanitize untrusted or semi-trusted HTML for display via {@link SafeHTML}.
 * Strict mode: p, strong, em, lists, br, links only.
 * Non-strict: adds headings, blockquote, code, pre, img (src/alt only).
 */
export function sanitizeHTML(dirty: string, options?: SanitizeHTMLOptions): SanitizeHTMLResult {
  ensureLinkHook();
  const strict = options?.strict ?? false;
  const cfg = baseConfig(strict);
  const clean = DOMPurify.sanitize(dirty, cfg);
  const wasModified = hasSignificantRemovals(DOMPurify.removed);

  if (import.meta.env.DEV && wasModified) {
    console.warn("[sanitizeHTML] DOMPurify modified input", {
      strict,
      removed: DOMPurify.removed,
      previewIn: dirty.slice(0, 200),
      previewOut: clean.slice(0, 200),
    });
  }

  return { clean, wasModified };
}

/** Ignore structural noise (implicit html/body wrappers) so Gemini toasts only fire on real strip events. */
function hasSignificantRemovals(
  removed: Array<{ element?: Node; attribute?: Attr | null; from?: Node }>
): boolean {
  for (const item of removed) {
    if ("attribute" in item && item.attribute != null) return true;
    const node = "element" in item ? item.element : undefined;
    if (node instanceof Element) {
      const tag = node.tagName;
      if (tag === "BODY" || tag === "HTML") continue;
      return true;
    }
  }
  return false;
}
