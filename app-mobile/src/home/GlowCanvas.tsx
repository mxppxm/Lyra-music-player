import { useEffect, useRef } from "react";
import type { Palette } from "./coverPalette";
import type { HSL } from "../lib/color";

export type GlowCanvasProps = {
  palette: Palette;
};

const FRAME_MS = 33; // ~30fps is plenty for drifting fog
const COLOR_CATCHUP_PER_SEC = 1.6; // full color swap in ~0.6s of lerp

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Hue interpolation along the shortest arc. */
function lerpHue(a: number, b: number, t: number): number {
  const d = ((b - a + 540) % 360) - 180;
  return (a + d * t + 360) % 360;
}

function lerpHsl(a: HSL, b: HSL, t: number): HSL {
  return {
    h: lerpHue(a.h, b.h, t),
    s: lerp(a.s, b.s, t),
    l: lerp(a.l, b.l, t),
  };
}

function hsla(c: HSL, alpha: number): string {
  return `hsla(${Math.round(c.h)}, ${Math.round(c.s)}%, ${Math.round(c.l)}%, ${alpha})`;
}

function drawBlob(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  color: HSL,
  alpha: number,
) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, hsla(color, alpha));
  g.addColorStop(1, hsla(color, 0));
  ctx.fillStyle = g;
  ctx.fillRect(x - r, y - r, r * 2, r * 2);
}

/**
 * Immersive backdrop drawn imperatively on <canvas> — three colour fogs
 * drifting on sine paths, colours lerping toward the current palette.
 * Zero CSS-feature risk: canvas 2d works on every iOS version.
 * Pauses when the page is hidden; ~30fps cap.
 */
export function GlowCanvas({ palette }: GlowCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const targetRef = useRef<Palette>(palette);
  const shownRef = useRef<Palette>(palette);

  useEffect(() => {
    targetRef.current = palette;
  }, [palette]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let raf = 0;
    let running = true;
    let last = 0;
    let w = 0;
    let h = 0;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = canvas.clientWidth;
      h = canvas.clientHeight;
      canvas.width = Math.max(1, Math.round(w * dpr));
      canvas.height = Math.max(1, Math.round(h * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);

    const frame = (now: number) => {
      if (!running) return;
      raf = requestAnimationFrame(frame);
      if (now - last < FRAME_MS) return;
      const dt = Math.min((now - last) / 1000 || 0.033, 0.1);
      last = now;
      const t = now / 1000;

      const k = Math.min(1, COLOR_CATCHUP_PER_SEC * dt);
      const shown = shownRef.current;
      const target = targetRef.current;
      shown.primary = lerpHsl(shown.primary, target.primary, k);
      shown.secondary = lerpHsl(shown.secondary, target.secondary, k);

      const maxDim = Math.max(w, h);
      ctx.clearRect(0, 0, w, h);
      // Blobs cluster around the screen's middle band (where the cover art
      // sits) instead of spilling into the corners.
      drawBlob(
        ctx,
        w * 0.35 + Math.sin(t * 0.1) * w * 0.07,
        h * 0.34 + Math.cos(t * 0.083) * h * 0.06,
        maxDim * 0.5 * (1 + 0.07 * Math.sin(t * 0.14)),
        shown.primary,
        0.5,
      );
      drawBlob(
        ctx,
        w * 0.66 + Math.sin(t * 0.075 + 2.1) * w * 0.06,
        h * 0.62 + Math.cos(t * 0.095 + 1.3) * h * 0.06,
        maxDim * 0.46 * (1 + 0.08 * Math.cos(t * 0.11)),
        shown.secondary,
        0.42,
      );
      drawBlob(
        ctx,
        w * 0.5 + Math.cos(t * 0.12 + 4.2) * w * 0.05,
        h * 0.48 + Math.sin(t * 0.09 + 3.1) * h * 0.06,
        maxDim * 0.3 * (1 + 0.1 * Math.sin(t * 0.17)),
        shown.primary,
        0.25,
      );
    };
    raf = requestAnimationFrame(frame);

    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        if (!running) {
          running = true;
          last = 0;
          raf = requestAnimationFrame(frame);
        }
      } else {
        running = false;
        cancelAnimationFrame(raf);
      }
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      running = false;
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  return (
    <div className="lyra-mobile-glow" aria-hidden data-testid="glow-canvas">
      <canvas ref={canvasRef} className="lyra-mobile-glow__canvas" />
      <div className="lyra-mobile-glow__mist" />
    </div>
  );
}
