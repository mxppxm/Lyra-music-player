import { useEffect, useLayoutEffect, useRef, useState } from "react";

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
  /** Carousel role: inactive neighbors are always parked at 0°. */
  active?: boolean;
};

const ANGLE_RESET_MS = 560;

/** Read the current visual rotation from a CSS transform matrix / matrix3d. */
export function angleFromCssTransform(transform: string): number {
  if (!transform || transform === "none") return 0;

  const read = (a: number, b: number): number => {
    let deg = (Math.atan2(b, a) * 180) / Math.PI;
    if (deg < 0) deg += 360;
    // Tiny float noise around 0 / 360.
    if (deg < 0.001 || deg > 359.999) return 0;
    return deg;
  };

  const m3 = /matrix3d\(([^)]+)\)/.exec(transform);
  if (m3) {
    const p = m3[1]!.split(",").map((v) => Number(v.trim()));
    return read(p[0] ?? 1, p[1] ?? 0);
  }
  const m2 = /matrix\(([^)]+)\)/.exec(transform);
  if (m2) {
    const p = m2[1]!.split(",").map((v) => Number(v.trim()));
    return read(p[0] ?? 1, p[1] ?? 0);
  }
  try {
    const matrix = new DOMMatrixReadOnly(transform);
    return read(matrix.a, matrix.b);
  } catch {
    return 0;
  }
}

/**
 * Cover for the playing view: a rounded-square card in the normal layout,
 * morphing into a spinning vinyl CD (grooves + spindle hole) in immersive
 * mode. Rotation is a CSS animation (compositor thread) so pause keeps the
 * angle and WKWebView stays smooth; leaving immersive eases back to 0°.
 * Hidden entirely when the track has no cover / the image fails.
 */
export function CoverArt({
  url,
  cd = false,
  spinning = false,
  active = true,
}: CoverArtProps) {
  const src = normalizeCoverUrl(url);
  const [status, setStatus] = useState<"loading" | "loaded" | "error">(
    "loading",
  );
  const discRef = useRef<HTMLDivElement>(null);
  const angleRef = useRef(0);
  const previousActiveRef = useRef(active);
  // Mount guard: no transitions of any kind during the first frame, so the
  // cover never "animates in" from a wrong radius on (re)mount.
  const [animated, setAnimated] = useState(false);
  // Keep --armed for one layout pass after cd→false so we can capture the
  // live CSS animation angle before it disappears (otherwise exit snaps to 0°).
  const [spinCss, setSpinCss] = useState(cd);

  useEffect(() => {
    setStatus(src ? "loading" : "error");
  }, [src]);

  // A prefetched neighbor may fail while off-screen. Promotion to current is
  // its retry boundary; remount the image without changing the stable song
  // key that prevents old-cover flashes.
  useLayoutEffect(() => {
    const becameActive = active && !previousActiveRef.current;
    previousActiveRef.current = active;
    if (becameActive && status === "error" && src) {
      setStatus("loading");
    }
    // Fresh page under the center starts at 0° — restart the CSS timeline
    // without remounting the <img> (that would flash the cover).
    if (becameActive && cd) {
      const el = discRef.current;
      if (el) {
        el.style.animation = "none";
        void el.offsetWidth;
        el.style.animation = "";
        el.style.transform = "";
      }
      angleRef.current = 0;
    }
  }, [active, cd, src, status]);

  useEffect(() => {
    const raf = requestAnimationFrame(() => setAnimated(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  // Enter CD: arm the CSS spin. Leave CD: capture the live angle while the
  // animation class is still on (spinCss lags one commit behind cd), freeze it
  // as an inline rotate, then ease to 0° alongside the circle→square morph.
  useLayoutEffect(() => {
    if (cd) {
      setSpinCss(true);
      const el = discRef.current;
      if (el && !el.className.includes("disc--spinning")) {
        // Re-entering: drop any leftover unwind inline transform.
        el.style.transform = "";
        el.style.animation = "";
      }
      return;
    }

    const el = discRef.current;
    if (!el) {
      setSpinCss(false);
      return;
    }

    const start = angleFromCssTransform(getComputedStyle(el).transform);
    angleRef.current = start;
    el.style.animation = "none";
    if (start === 0) {
      el.style.transform = "";
      setSpinCss(false);
      return;
    }
    el.style.transform = `rotate(${start}deg)`;
    setSpinCss(false);

    const t0 = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const p = Math.min(1, (now - t0) / ANGLE_RESET_MS);
      const eased = 1 - Math.pow(1 - p, 3);
      const angle = start * (1 - eased);
      angleRef.current = angle;
      el.style.transform = `rotate(${angle}deg)`;
      if (p < 1) {
        raf = requestAnimationFrame(tick);
      } else {
        el.style.transform = "";
        el.style.animation = "";
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [cd]);

  if (!src || status === "error") return null;

  // spinCss lags cd on exit so the first exit layout still has --armed and
  // the live animation matrix can be read. Neighbors stay armed+paused too.
  const discClass = [
    "lyra-mobile-cover-art__disc",
    spinCss ? "lyra-mobile-cover-art__disc--armed" : "",
    spinCss && active && spinning
      ? "lyra-mobile-cover-art__disc--spinning"
      : "",
  ]
    .filter(Boolean)
    .join(" ");

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
      <div className={discClass} ref={discRef}>
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
