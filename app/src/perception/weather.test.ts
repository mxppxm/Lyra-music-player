import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  _resetWeatherCacheForTests,
  biasFromWeatherCode,
  ensureWeatherSnapshot,
} from "./weather";

beforeEach(() => {
  _resetWeatherCacheForTests();
});

describe("biasFromWeatherCode", () => {
  it("maps clear sky to slightly positive valence", () => {
    const b = biasFromWeatherCode(0);
    expect(b.pad_bias.p).toBeGreaterThan(0);
    expect(b.confidence).toBe(0.3);
    expect(b.reason).toMatch(/clear/i);
  });

  it("maps rain to negative valence", () => {
    const b = biasFromWeatherCode(61);
    expect(b.pad_bias.p).toBeLessThan(0);
    expect(b.reason).toMatch(/rain/i);
  });

  it("maps thunderstorm to higher arousal", () => {
    const b = biasFromWeatherCode(95);
    expect(b.pad_bias.a).toBeGreaterThan(0);
  });
});

describe("ensureWeatherSnapshot", () => {
  it("returns null when disabled", async () => {
    const snap = await ensureWeatherSnapshot({ enabled: false });
    expect(snap).toBeNull();
  });

  it("fetches Open-Meteo with manual coords and caches", async () => {
    const fetchFn = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        current: {
          weather_code: 0,
          temperature_2m: 22,
          apparent_temperature: 21,
          relative_humidity_2m: 55,
          precipitation: 0,
          cloud_cover: 10,
          wind_speed_10m: 8,
          is_day: 1,
        },
      }),
    })) as unknown as typeof fetch;

    const a = await ensureWeatherSnapshot({
      enabled: true,
      manualLat: 31.2,
      manualLon: 121.5,
      fetchFn,
      now: () => 1_000_000,
    });
    expect(a?.weatherCode).toBe(0);
    expect(a?.source).toBe("manual");
    expect(a?.apparentTemperatureC).toBe(21);
    expect(a?.humidityPct).toBe(55);
    expect(a?.windSpeedKmh).toBe(8);
    expect(a?.isDay).toBe(true);
    expect(fetchFn).toHaveBeenCalledOnce();
    const url = String((fetchFn as any).mock.calls[0][0]);
    expect(url).toContain("apparent_temperature");
    expect(url).toContain("relative_humidity_2m");
    expect(url).toContain("wind_speed_10m");

    const b = await ensureWeatherSnapshot({
      enabled: true,
      manualLat: 31.2,
      manualLon: 121.5,
      fetchFn,
      now: () => 1_000_000 + 60_000,
    });
    expect(b?.weatherCode).toBe(0);
    expect(fetchFn).toHaveBeenCalledOnce(); // cache hit
  });

  it("falls back to geolocate when manual coords missing", async () => {
    const fetchFn = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        current: { weather_code: 3, temperature_2m: 18 },
      }),
    })) as unknown as typeof fetch;

    const snap = await ensureWeatherSnapshot({
      enabled: true,
      fetchFn,
      geolocate: async () => ({ lat: 1, lon: 2 }),
      now: () => 2_000_000,
    });
    expect(snap?.weatherCode).toBe(3);
    expect(snap?.source).toBe("geo");
  });
});
