// Keyless company-logo helpers. A domain is derived from a user-entered website
// or guessed from the subscription name, then the logo is pulled from public
// services (no API keys). Callers try the URLs in order and fall back to an
// initials tile when none resolve — see components/ui/CompanyLogo.tsx.

// Common names whose domain isn't simply "<name>.com".
const KNOWN_DOMAINS: Record<string, string> = {
  quickbooks: "quickbooks.intuit.com",
  intuit: "intuit.com",
  "google workspace": "workspace.google.com",
  gsuite: "workspace.google.com",
  aws: "aws.amazon.com",
  "amazon web services": "aws.amazon.com",
  notion: "notion.so",
  zoom: "zoom.us",
  "microsoft 365": "microsoft.com",
  office365: "microsoft.com",
  x: "x.com",
  twitter: "x.com",
};

/** Extract a bare domain from a website string, or guess one from the name. */
export function resolveDomain(
  website: string | null | undefined,
  name: string | null | undefined,
): string | null {
  const site = (website ?? "").trim();
  if (site) {
    try {
      const host = site.includes("://")
        ? new URL(site).hostname
        : new URL(`https://${site}`).hostname;
      const clean = host.replace(/^www\./, "").toLowerCase();
      if (clean.includes(".")) return clean;
    } catch {
      // fall through to name-based guess
    }
  }
  const key = (name ?? "").trim().toLowerCase();
  if (!key) return null;
  if (KNOWN_DOMAINS[key]) return KNOWN_DOMAINS[key];
  const slug = key.split(/\s+/)[0].replace(/[^a-z0-9]/g, "");
  return slug ? `${slug}.com` : null;
}

/** Ordered, keyless logo URLs to try for a domain (best quality first). */
export function logoSources(domain: string): string[] {
  return [
    `https://logo.clearbit.com/${domain}`,
    `https://icons.duckduckgo.com/ip3/${domain}.ico`,
    `https://www.google.com/s2/favicons?domain=${domain}&sz=128`,
  ];
}
