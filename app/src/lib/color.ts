export type PAD = { p: number; a: number; d: number };
export type HSL = { h: number; s: number; l: number };

const TIME_BASES: Array<{ startHour: number; endHour: number; hsl: HSL }> = [
  { startHour: 5, endHour: 8, hsl: { h: 30, s: 15, l: 92 } },
  { startHour: 8, endHour: 12, hsl: { h: 45, s: 10, l: 94 } },
  { startHour: 12, endHour: 15, hsl: { h: 100, s: 12, l: 91 } },
  { startHour: 15, endHour: 18, hsl: { h: 35, s: 20, l: 90 } },
  { startHour: 18, endHour: 22, hsl: { h: 28, s: 25, l: 88 } },
  { startHour: 22, endHour: 26, hsl: { h: 230, s: 25, l: 22 } }, // wraps to 02:00
  { startHour: 2, endHour: 5, hsl: { h: 235, s: 30, l: 18 } },
];

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function padHSL(pad: PAD): HSL {
  const h = lerp(240, 30, (pad.p + 1) / 2);
  const s = 20 + pad.a * 30;
  const l = 88 + pad.d * 8;
  return { h, s, l };
}

export function timeBase(now: Date): HSL {
  const hour = now.getHours() + now.getMinutes() / 60;
  const normalized = hour < 2 ? hour + 24 : hour; // 00:00-01:59 → 24:00-25:59
  for (const band of TIME_BASES) {
    const start = band.startHour < 2 ? band.startHour + 24 : band.startHour;
    const end = band.endHour < 2 ? band.endHour + 24 : band.endHour;
    if (normalized >= start && normalized < end) return band.hsl;
  }
  // Fallback (should never hit given full-day coverage)
  return { h: 0, s: 0, l: 90 };
}

export function mixHSL(a: HSL, b: HSL, weight: number): HSL {
  const w = Math.max(0, Math.min(1, weight));
  return {
    h: lerp(a.h, b.h, w),
    s: lerp(a.s, b.s, w),
    l: lerp(a.l, b.l, w),
  };
}

export function hslToString(hsl: HSL): string {
  return `hsl(${hsl.h}, ${hsl.s}%, ${hsl.l}%)`;
}

export function ambientColor(pad: PAD, now: Date): string {
  const base = timeBase(now);
  const emotional = padHSL(pad);
  return hslToString(mixHSL(base, emotional, 0.4));
}
