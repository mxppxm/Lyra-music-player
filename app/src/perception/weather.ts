/**
 * perception/weather.ts — Open-Meteo current weather → soft PAD bias + rich facts.
 *
 * In-memory cache only (TTL 45 min). Coordinates are never written to SQLite;
 * optional manual lat/lon may live in keychain via Settings.
 *
 * Callers: App.tsx / app-mobile perception tick (ensureWeatherSnapshot);
 * RulePerceptionAgent.infer (biasFromWeatherCode).
 */

import type { PAD } from "../types";
import type { PerceptionBias } from "./PerceptionAgent";

export type WeatherSnapshot = {
  weatherCode: number;
  temperatureC: number;
  /** 体感温度 °C（Open-Meteo apparent_temperature）。 */
  apparentTemperatureC?: number;
  /** 相对湿度 0–100。 */
  humidityPct?: number;
  /** 当前降水量 mm。 */
  precipMm?: number;
  /** 云量 0–100。 */
  cloudCoverPct?: number;
  /** 10m 风速 km/h。 */
  windSpeedKmh?: number;
  /** Open-Meteo is_day：1=白天 0=夜晚。 */
  isDay?: boolean;
  fetchedAt: number;
  source: "geo" | "manual";
};

export type WeatherFetchDeps = {
  enabled: boolean;
  manualLat?: number | null;
  manualLon?: number | null;
  fetchFn?: typeof fetch;
  geolocate?: () => Promise<{ lat: number; lon: number } | null>;
  now?: () => number;
};

const CACHE_TTL_MS = 45 * 60 * 1000;
/** Bump when request fields change so stale thin cache is discarded. */
const CACHE_VERSION = "v2";

const CURRENT_FIELDS = [
  "weather_code",
  "temperature_2m",
  "apparent_temperature",
  "relative_humidity_2m",
  "precipitation",
  "cloud_cover",
  "wind_speed_10m",
  "is_day",
].join(",");

type CacheEntry = WeatherSnapshot & { cacheKey: string };
let cache: CacheEntry | null = null;

/** Test helper — clear module cache between tests. */
export function _resetWeatherCacheForTests(): void {
  cache = null;
}

export function getCachedWeather(): WeatherSnapshot | null {
  return cache;
}

async function defaultGeolocate(): Promise<{ lat: number; lon: number } | null> {
  if (typeof navigator === "undefined" || !navigator.geolocation) return null;
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), 8_000);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        clearTimeout(timer);
        resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude });
      },
      () => {
        clearTimeout(timer);
        resolve(null);
      },
      { enableHighAccuracy: false, timeout: 7_000, maximumAge: 30 * 60_000 },
    );
  });
}

function optNum(v: unknown): number | undefined {
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}

/**
 * Return a fresh or cached Open-Meteo snapshot. Failures are silent (null).
 */
export async function ensureWeatherSnapshot(
  deps: WeatherFetchDeps,
): Promise<WeatherSnapshot | null> {
  if (!deps.enabled) return null;
  const now = deps.now ?? Date.now;
  const ts = now();

  const geolocate = deps.geolocate ?? defaultGeolocate;
  const fetchFn = deps.fetchFn ?? fetch;

  let lat = deps.manualLat ?? null;
  let lon = deps.manualLon ?? null;
  let source: "geo" | "manual" = "manual";

  if (
    lat == null ||
    lon == null ||
    !Number.isFinite(lat) ||
    !Number.isFinite(lon)
  ) {
    const geo = await geolocate();
    if (!geo) return cache; // stale ok if any
    lat = geo.lat;
    lon = geo.lon;
    source = "geo";
  }

  const cacheKey = `${CACHE_VERSION}:${source}:${lat},${lon}`;
  if (cache && cache.cacheKey === cacheKey && ts - cache.fetchedAt < CACHE_TTL_MS) {
    return cache;
  }

  try {
    const url =
      `https://api.open-meteo.com/v1/forecast` +
      `?latitude=${encodeURIComponent(String(lat))}` +
      `&longitude=${encodeURIComponent(String(lon))}` +
      `&current=${CURRENT_FIELDS}` +
      `&wind_speed_unit=kmh`;
    const res = await fetchFn(url);
    if (!res.ok) {
      console.warn(`[lyra] weather fetch failed: ${res.status}`);
      return cache;
    }
    const body = (await res.json()) as {
      current?: {
        weather_code?: number;
        temperature_2m?: number;
        apparent_temperature?: number;
        relative_humidity_2m?: number;
        precipitation?: number;
        cloud_cover?: number;
        wind_speed_10m?: number;
        is_day?: number;
      };
    };
    const cur = body.current ?? {};
    const code = cur.weather_code;
    const temp = cur.temperature_2m;
    if (typeof code !== "number" || !Number.isFinite(code)) return cache;
    const isDayRaw = cur.is_day;
    cache = {
      weatherCode: code,
      temperatureC: typeof temp === "number" ? temp : 0,
      apparentTemperatureC: optNum(cur.apparent_temperature),
      humidityPct: optNum(cur.relative_humidity_2m),
      precipMm: optNum(cur.precipitation),
      cloudCoverPct: optNum(cur.cloud_cover),
      windSpeedKmh: optNum(cur.wind_speed_10m),
      isDay:
        typeof isDayRaw === "number" && Number.isFinite(isDayRaw)
          ? isDayRaw === 1
          : undefined,
      fetchedAt: ts,
      source,
      cacheKey,
    };
    return cache;
  } catch (err) {
    console.warn(`[lyra] weather fetch error:`, err);
    return cache;
  }
}

/** Map WMO weather interpretation codes to a soft PerceptionBias. */
export function biasFromWeatherCode(code: number): PerceptionBias {
  let pad_bias: PAD = { p: 0, a: 0, d: 0 };
  let reason = "weather neutral";

  if (code === 0) {
    pad_bias = { p: 0.12, a: 0.05, d: 0 };
    reason = "clear sky — slightly brighter mood";
  } else if (code >= 1 && code <= 3) {
    pad_bias = { p: 0.02, a: -0.06, d: 0 };
    reason = "partly cloudy / overcast — softer arousal";
  } else if (code === 45 || code === 48) {
    pad_bias = { p: -0.06, a: -0.12, d: -0.05 };
    reason = "fog — muted, inward";
  } else if (code >= 51 && code <= 67) {
    pad_bias = { p: -0.15, a: -0.1, d: -0.05 };
    reason = "rain / drizzle — lower valence";
  } else if (code >= 71 && code <= 77) {
    pad_bias = { p: -0.08, a: -0.15, d: -0.05 };
    reason = "snow — quiet, low arousal";
  } else if (code >= 80 && code <= 82) {
    pad_bias = { p: -0.12, a: -0.05, d: 0 };
    reason = "rain showers — slightly heavier mood";
  } else if (code >= 95 && code <= 99) {
    pad_bias = { p: -0.08, a: 0.15, d: -0.05 };
    reason = "thunderstorm — tense arousal";
  }

  return {
    pad_bias,
    confidence: 0.3,
    reason,
  };
}
