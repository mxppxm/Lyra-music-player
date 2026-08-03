import { useEffect, useRef } from "react";
import { padHSL, type HSL, type PAD } from "../lib/color";

export type GlowCanvasProps = {
  pad: PAD;
  /** Playback ongoing — glow fades in; fades out otherwise. */
  active?: boolean;
};

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

/**
 * Emotion-reactive glow palette: the PAD hue plus two neighbouring hues for
 * depth. Saturation/lightness sit well above the (deliberately pale) ambient
 * palette so the blobs read clearly over the background photo.
 */
export function glowPalette(pad: PAD): [HSL, HSL, HSL] {
  const { h } = padHSL(pad);
  // Punchier than ambient — sat/light tuned so fog reads over the photo.
  const s = clamp(62 + pad.a * 26, 48, 90);
  const l = clamp(54 + pad.d * 8, 46, 68);
  return [
    { h, s, l },
    { h: (h + 26) % 360, s, l: clamp(l + 5, 46, 72) },
    { h: (h + 334) % 360, s, l: clamp(l - 5, 42, 66) },
  ];
}

const FRAME_MS = 33; // ~30fps is plenty for drifting fog

type Blob = {
  anchorX: number;
  anchorY: number;
  driftX: number;
  driftY: number;
  radiusFrac: number;
  periodS: number;
  phase: number;
  alpha: number;
};

const BLOBS: Blob[] = [
  { anchorX: 0.30, anchorY: 0.34, driftX: 0.08, driftY: 0.07, radiusFrac: 0.50, periodS: 17, phase: 0.0, alpha: 0.78 },
  { anchorX: 0.72, anchorY: 0.30, driftX: 0.07, driftY: 0.08, radiusFrac: 0.44, periodS: 21, phase: 2.1, alpha: 0.68 },
  { anchorX: 0.50, anchorY: 0.76, driftX: 0.09, driftY: 0.06, radiusFrac: 0.48, periodS: 14, phase: 4.2, alpha: 0.72 },
];

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Hue interpolation along the shortest arc. */
function lerpHue(a: number, b: number, t: number): number {
  const d = ((b - a + 540) % 360) - 180;
  return (a + d * t + 360) % 360;
}

function lerpHsl(a: HSL, b: HSL, t: number): HSL {
  return { h: lerpHue(a.h, b.h, t), s: lerp(a.s, b.s, t), l: lerp(a.l, b.l, t) };
}

function hsla(c: HSL, alpha: number): string {
  return `hsla(${Math.round(c.h)}, ${Math.round(c.s)}%, ${Math.round(c.l)}%, ${alpha})`;
}

/**
 * Emotion colour fog for the desktop home — three soft colour blobs drifting
 * on sine paths over the background photo, hues lerping toward the current
 * PAD-derived palette. Sits at z-index 0: above the photo, below stage/dock.
 * jsdom-safe: degrades to a static element when 2d context is unavailable.
 */
export function GlowCanvas({ pad, active = false }: GlowCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number | null>(null);
  const paletteRef = useRef<HSL[]>(glowPalette(pad));
  const shownRef = useRef<HSL[]>(glowPalette(pad));

  useEffect(() => {
    paletteRef.current = glowPalette(pad);
  }, [pad]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let ctx: CanvasRenderingContext2D | null = null;
    try {
      ctx = canvas.getContext("2d");
    } catch {
      return;
    }
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      canvas.width = Math.max(1, Math.floor(rect.width * dpr));
      canvas.height = Math.max(1, Math.floor(rect.height * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);

    const start = performance.now();
    let last = 0;

    const draw = (now: number) => {
      rafRef.current = requestAnimationFrame(draw);
      if (now - last < FRAME_MS) return;
      last = now;

      const t = (now - start) / 1000;
      const rect = canvas.getBoundingClientRect();
      const W = rect.width;
      const H = rect.height;
      if (W < 2 || H < 2) return;

      // Colour low-pass — hue drifts gently to the new song's emotion.
      const k = 0.02;
      shownRef.current = shownRef.current.map((c, i) =>
        lerpHsl(c, paletteRef.current[i] ?? c, k),
      );

      ctx.clearRect(0, 0, W, H);
      const R = Math.max(W, H);
      for (let i = 0; i < BLOBS.length; i++) {
        const b = BLOBS[i];
        const w = (Math.PI * 2) / b.periodS;
        const x = (b.anchorX + Math.sin(t * w + b.phase) * b.driftX) * W;
        const y = (b.anchorY + Math.cos(t * w * 0.8 + b.phase) * b.driftY) * H;
        const r = b.radiusFrac * R;
        const c = shownRef.current[i % shownRef.current.length];
        const g = ctx.createRadialGradient(x, y, 0, x, y, r);
        g.addColorStop(0, hsla(c, b.alpha));
        g.addColorStop(1, hsla(c, 0));
        ctx.fillStyle = g;
        ctx.fillRect(x - r, y - r, r * 2, r * 2);
      }
    };

    rafRef.current = requestAnimationFrame(draw);
    return () => {
      window.removeEventListener("resize", resize);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      data-testid="glow-canvas"
      aria-hidden
      style={{
        position: "fixed",
        inset: 0,
        width: "100%",
        height: "100%",
        zIndex: 0,
        pointerEvents: "none",
        opacity: active ? 1 : 0,
        transition: "opacity 1.4s ease",
      }}
    />
  );
}
