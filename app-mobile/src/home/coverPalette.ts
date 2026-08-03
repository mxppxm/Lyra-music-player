import { useEffect, useState } from "react";
import { padHSL, type HSL, type PAD } from "../lib/color";

export type Palette = { primary: HSL; secondary: HSL };

export function hslToCss(hsl: HSL): string {
  const clamp = (v: number, lo: number, hi: number) =>
    Math.min(hi, Math.max(lo, v));
  return `hsl(${Math.round(((hsl.h % 360) + 360) % 360)}, ${Math.round(clamp(hsl.s, 0, 100))}%, ${Math.round(clamp(hsl.l, 0, 100))}%)`;
}

function hsl(h: number, s: number, l: number): HSL {
  const clamp = (v: number, lo: number, hi: number) =>
    Math.min(hi, Math.max(lo, v));
  return { h: ((h % 360) + 360) % 360, s: clamp(s, 0, 100), l: clamp(l, 0, 100) };
}

function rgbToHsl(r: number, g: number, b: number): HSL {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  const l = (max + min) / 2;
  if (d === 0) return { h: 0, s: 0, l: l * 100 };
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === r) h = ((g - b) / d) % 6;
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return { h: (h * 60 + 360) % 360, s: s * 100, l: l * 100 };
}

/** Palette derived from PAD + time of day — the no-cover fallback. */
export function padPalette(pad: PAD): Palette {
  const base = padHSL(pad);
  return {
    primary: hsl(base.h, base.s + 28, base.l - 14),
    secondary: hsl(base.h + 42, base.s + 18, base.l - 24),
  };
}

/**
 * Dominant-color pair from the cover image: 24×24 downsample, hue-bucketed,
 * greys and near-black/white pixels discarded. hdslb serves
 * Access-Control-Allow-Origin: * so the canvas is not tainted.
 */
function extract(img: HTMLImageElement): Palette | null {
  try {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 24;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0, 24, 24);
    const { data } = ctx.getImageData(0, 0, 24, 24);

    const buckets = Array.from({ length: 12 }, () => ({
      n: 0,
      r: 0,
      g: 0,
      b: 0,
    }));
    let avgR = 0;
    let avgG = 0;
    let avgB = 0;
    let avgN = 0;

    for (let i = 0; i < data.length; i += 4) {
      const r = data[i] / 255;
      const g = data[i + 1] / 255;
      const b = data[i + 2] / 255;
      avgN += 1;
      avgR += r;
      avgG += g;
      avgB += b;
      const c = rgbToHsl(r, g, b);
      if (c.s < 14 || c.l < 10 || c.l > 92) continue;
      const bucket = buckets[Math.floor(c.h / 30) % 12];
      bucket.n += 1;
      bucket.r += r;
      bucket.g += g;
      bucket.b += b;
    }

    const sorted = buckets.filter((b) => b.n >= 6).sort((a, b) => b.n - a.n);
    if (sorted.length === 0) {
      // Near-monochrome cover — tint the average instead.
      const avg = rgbToHsl(avgR / avgN, avgG / avgN, avgB / avgN);
      return {
        primary: hsl(avg.h, avg.s + 30, Math.max(avg.l - 18, 26)),
        secondary: hsl(avg.h + 36, avg.s + 22, Math.max(avg.l - 30, 18)),
      };
    }

    const toHsl = (b: (typeof sorted)[number]): HSL =>
      rgbToHsl(b.r / b.n, b.g / b.n, b.b / b.n);

    const p = toHsl(sorted[0]);
    const primary = hsl(p.h, p.s + 15, Math.min(Math.max(p.l, 26), 62));

    let secondary = hsl(p.h + 35, p.s + 8, Math.max(p.l - 18, 16));
    for (const candidate of sorted.slice(1)) {
      const c = toHsl(candidate);
      const hueDist = Math.min(Math.abs(c.h - p.h), 360 - Math.abs(c.h - p.h));
      if (hueDist > 50) {
        secondary = hsl(c.h, c.s + 12, Math.min(Math.max(c.l, 18), 55));
        break;
      }
    }
    return { primary, secondary };
  } catch {
    return null;
  }
}

/** Cover-driven palette, falling back to PAD colors while loading / on error. */
export function useCoverPalette(url: string | null, pad: PAD): Palette {
  const [palette, setPalette] = useState<Palette>(() => padPalette(pad));

  useEffect(() => {
    if (!url) {
      setPalette(padPalette(pad));
      return;
    }
    let cancelled = false;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.referrerPolicy = "no-referrer";
    img.onload = () => {
      if (cancelled) return;
      const extracted = extract(img);
      setPalette(extracted ?? padPalette(pad));
    };
    img.onerror = () => {
      if (!cancelled) setPalette(padPalette(pad));
    };
    img.src = url;
    return () => {
      cancelled = true;
    };
  }, [url, pad]);

  return palette;
}
