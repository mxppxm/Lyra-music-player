import { useEffect, useRef, useState } from "react";

export type CoverBackgroundProps = {
  /** Raw bilibili cover URL from track metadata (may be protocol-relative). */
  url: string | null;
};

/** Bilibili pic fields come as "//i0.hdslb.com/…" or plain http — both fine
 *  as https, which also keeps WKWebView happy. */
export function normalizeCoverUrl(url: string | null): string | null {
  if (!url) return null;
  if (url.startsWith("//")) return `https:${url}`;
  return url.replace(/^http:\/\//i, "https://");
}

export type CoverArtProps = CoverBackgroundProps & {
  /** Immersive mode: morph the square card into a vinyl CD. */
  cd?: boolean;
  /** True while the disc should rotate (immersive + actually playing). */
  spinning?: boolean;
};

const SPIN_SECONDS_PER_REV = 22;
const ANGLE_RESET_MS = 560;

/**
 * Cover for the playing view: a rounded-square card in the normal layout,
 * morphing into a spinning vinyl CD (grooves + spindle hole) in immersive
 * mode. Rotation is rAF-driven so the angle is continuous — pausing keeps
 * it, and leaving immersive eases it back to 0° in sync with the morph.
 * Hidden entirely when the track has no cover / the image fails.
 */
export function CoverArt({ url, cd = false, spinning = false }: CoverArtProps) {
  const src = normalizeCoverUrl(url);
  const [status, setStatus] = useState<"loading" | "loaded" | "error">(
    "loading",
  );
  const discRef = useRef<HTMLDivElement>(null);
  const angleRef = useRef(0);
  // Mount guard: no transitions of any kind during the first frame, so the
  // cover never "animates in" from a wrong radius on (re)mount.
  const [animated, setAnimated] = useState(false);

  useEffect(() => {
    setStatus(src ? "loading" : "error");
  }, [src]);

  useEffect(() => {
    const raf = requestAnimationFrame(() => setAnimated(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  // rAF-driven rotation — angle persists across spin start/stop.
  useEffect(() => {
    if (!spinning) return;
    let last = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.1);
      last = now;
      angleRef.current =
        (angleRef.current + (dt * 360) / SPIN_SECONDS_PER_REV) % 360;
      discRef.current?.style.setProperty(
        "transform",
        `rotate(${angleRef.current}deg)`,
      );
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [spinning]);

  // Leaving CD mode: ease the current angle back to 0° alongside the
  // circle→square morph, instead of snapping.
  useEffect(() => {
    if (cd) return;
    const start = angleRef.current;
    if (start === 0) return;
    const t0 = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const p = Math.min(1, (now - t0) / ANGLE_RESET_MS);
      const eased = 1 - Math.pow(1 - p, 3);
      const angle = start * (1 - eased);
      discRef.current?.style.setProperty("transform", `rotate(${angle}deg)`);
      if (p < 1) {
        raf = requestAnimationFrame(tick);
      } else {
        angleRef.current = 0;
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [cd]);

  if (!src || status === "error") return null;

  return (
    <div
      className={[
        "lyra-mobile-cover-art",
        cd ? "lyra-mobile-cover-art--cd" : "",
        animated ? "" : "lyra-mobile-cover-art--no-anim",
      ]
        .filter(Boolean)
        .join(" ")}
      data-testid="cover-art"
    >
      <div className="lyra-mobile-cover-art__disc" ref={discRef}>
        {/* hdslb.com 403s non-bilibili Referers — send none (200). */}
        <img
          src={src}
          alt=""
          referrerPolicy="no-referrer"
          onLoad={() => setStatus("loaded")}
          onError={() => setStatus("error")}
          className={
            status === "loaded"
              ? "lyra-mobile-cover-art__img lyra-mobile-cover-art__img--loaded"
              : "lyra-mobile-cover-art__img"
          }
        />
        <div className="lyra-mobile-cover-art__groove" />
        <div className="lyra-mobile-cover-art__hole" />
      </div>
    </div>
  );
}

/**
 * Blurred album-cover backdrop, Apple-Music style: the cover fills the
 * screen under heavy blur, a warm mist keeps ink text readable, and the
 * ambient color underneath remains the fallback while loading / on error.
 * Superseded by FlowingGlow + cover palette; kept for reference/fallback.
 */
export function CoverBackground({ url }: CoverBackgroundProps) {
  const src = normalizeCoverUrl(url);
  const [loadedSrc, setLoadedSrc] = useState<string | null>(null);

  useEffect(() => {
    setLoadedSrc(null);
  }, [src]);

  if (!src) return null;

  return (
    <div className="lyra-mobile-cover" aria-hidden data-testid="cover-bg">
      {/* hdslb.com 403s requests carrying a non-bilibili Referer — and
          WKWebView would happily send "capacitor://localhost" — so drop the
          Referer header entirely (no-Referer responses are 200). */}
      <img
        src={src}
        alt=""
        referrerPolicy="no-referrer"
        onLoad={() => setLoadedSrc(src)}
        onError={() => setLoadedSrc(null)}
        className={
          loadedSrc === src
            ? "lyra-mobile-cover__img lyra-mobile-cover__img--loaded"
            : "lyra-mobile-cover__img"
        }
      />
      <div className="lyra-mobile-cover__mist" />
    </div>
  );
}