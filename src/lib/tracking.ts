/**
 * Carrier tracking deep-links. Given a carrier name (as synced from Etsy/Shopify
 * or hand-entered) and a tracking number, return the carrier's public tracking
 * page for that package. Falls back to guessing the carrier from the tracking
 * number's format, then to a USPS lookup (our default carrier).
 */

const CARRIER_URLS: Record<string, (t: string) => string> = {
  usps: (t) => `https://tools.usps.com/go/TrackConfirmAction?tLabels=${encodeURIComponent(t)}`,
  ups: (t) => `https://www.ups.com/track?tracknum=${encodeURIComponent(t)}`,
  fedex: (t) => `https://www.fedex.com/fedextrack/?trknbr=${encodeURIComponent(t)}`,
  dhl: (t) => `https://www.dhl.com/us-en/home/tracking.html?tracking-id=${encodeURIComponent(t)}`,
  ontrac: (t) => `https://www.ontrac.com/tracking/?number=${encodeURIComponent(t)}`,
};

/** Guess the carrier from the tracking number's structure. */
function guessCarrier(trackingNumber: string): string {
  const t = trackingNumber.replace(/\s+/g, "").toUpperCase();
  if (/^1Z[0-9A-Z]{16}$/.test(t)) return "ups";
  if (/^(94|93|92|95)\d{20,24}$/.test(t)) return "usps"; // USPS IMpb barcodes
  if (/^[A-Z]{2}\d{9}US$/.test(t)) return "usps"; // international
  if (/^\d{12}$|^\d{15}$|^\d{20}$/.test(t)) return "fedex";
  return "usps";
}

export function trackingUrl(carrier: string | null, trackingNumber: string | null): string | null {
  if (!trackingNumber?.trim()) return null;
  const key = (carrier ?? "").trim().toLowerCase();
  const build = CARRIER_URLS[key] ?? CARRIER_URLS[guessCarrier(trackingNumber)];
  return build(trackingNumber.trim());
}

/** Display label for a carrier value that may be messy/empty. */
export function carrierLabel(carrier: string | null, trackingNumber: string | null): string {
  const c = (carrier ?? "").trim();
  if (c) return c.length <= 5 ? c.toUpperCase() : c;
  if (trackingNumber) return guessCarrier(trackingNumber).toUpperCase();
  return "—";
}
