/**
 * Live-plant shipping weather checks — fully keyless:
 *   ZIP → lat/lon via zippopotam.us, then a 3-day forecast via Open-Meteo.
 * A destination is shippable when the window stays inside [35°F, 95°F].
 */

const HOLD_MIN_F = 35;
const HOLD_MAX_F = 95;
const FORECAST_DAYS = 3;

export interface WeatherCheck {
  /** Safe to ship — the whole window stays inside the temperature band. */
  ok: boolean;
  minF: number;
  maxF: number;
  /** Human summary, e.g. "Phoenix, AZ: high of 103°F in next 3 days — heat hold". */
  note: string;
}

export async function checkShippingWeather(zip: string): Promise<WeatherCheck | null> {
  try {
    const geoRes = await fetch(`https://api.zippopotam.us/us/${encodeURIComponent(zip.trim())}`);
    if (!geoRes.ok) return null;
    const geo = await geoRes.json();
    const place = geo?.places?.[0];
    if (!place?.latitude || !place?.longitude) return null;

    const wxRes = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${place.latitude}&longitude=${place.longitude}` +
        `&daily=temperature_2m_min,temperature_2m_max&temperature_unit=fahrenheit` +
        `&forecast_days=${FORECAST_DAYS}&timezone=auto`,
    );
    if (!wxRes.ok) return null;
    const wx = await wxRes.json();
    const mins: number[] = wx?.daily?.temperature_2m_min ?? [];
    const maxs: number[] = wx?.daily?.temperature_2m_max ?? [];
    if (mins.length === 0 || maxs.length === 0) return null;

    const minF = Math.min(...mins);
    const maxF = Math.max(...maxs);
    const ok = minF >= HOLD_MIN_F && maxF <= HOLD_MAX_F;
    const where = `${place["place name"]}, ${place["state abbreviation"]}`;
    const detail = ok
      ? `${Math.round(minF)}–${Math.round(maxF)}°F over ${FORECAST_DAYS} days — clear to ship`
      : minF < HOLD_MIN_F
        ? `low of ${Math.round(minF)}°F in next ${FORECAST_DAYS} days — cold hold (heat pack or wait)`
        : `high of ${Math.round(maxF)}°F in next ${FORECAST_DAYS} days — heat hold`;
    return { ok, minF, maxF, note: `${where}: ${detail}` };
  } catch {
    return null; // network/CORS failure — caller treats as "couldn't check"
  }
}
