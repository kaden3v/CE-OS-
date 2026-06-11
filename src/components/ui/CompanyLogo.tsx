import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { resolveDomain, logoSources } from "@/lib/logo";

interface CompanyLogoProps {
  name: string;
  website?: string | null;
  /** Pixel size of the square tile. */
  size?: number;
  className?: string;
}

const PALETTE = [
  "bg-emerald-500/15 text-emerald-300",
  "bg-sky-500/15 text-sky-300",
  "bg-violet-500/15 text-violet-300",
  "bg-amber-500/15 text-amber-300",
  "bg-rose-500/15 text-rose-300",
  "bg-teal-500/15 text-teal-300",
];

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

/**
 * Renders a company logo resolved from `website`/`name` via keyless logo
 * services, walking a fallback chain on error and finally degrading to a
 * colored initials tile so it is never broken.
 */
export function CompanyLogo({ name, website, size = 32, className }: CompanyLogoProps) {
  const domain = resolveDomain(website, name);
  const sources = domain ? logoSources(domain) : [];
  const [idx, setIdx] = useState(0);

  // Restart the chain whenever the target domain changes (e.g. live in a form).
  useEffect(() => setIdx(0), [domain]);

  const dim = { width: size, height: size };

  if (domain && idx < sources.length) {
    return (
      <img
        src={sources[idx]}
        alt={`${name} logo`}
        style={dim}
        loading="lazy"
        onError={() => setIdx((i) => i + 1)}
        className={cn("rounded-md object-contain bg-white border border-border-subtle shrink-0", className)}
      />
    );
  }

  const tone = PALETTE[hashString(name || "?") % PALETTE.length];
  return (
    <div
      style={dim}
      aria-label={`${name} icon`}
      className={cn("rounded-md flex items-center justify-center font-semibold border border-border-subtle shrink-0", tone, className)}
    >
      <span style={{ fontSize: Math.max(10, Math.round(size * 0.4)) }}>{initials(name)}</span>
    </div>
  );
}
