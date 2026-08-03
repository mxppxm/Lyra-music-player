import { useEffect, useState } from "react";

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

/**
 * Crisp cover card for the playing view — the visible album art, above the
 * blurred backdrop. Hidden entirely when the track has no cover / the image
 * fails (the blurred backdrop already carries the mood).
 */
export function CoverArt({ url }: CoverBackgroundProps) {
  const src = normalizeCoverUrl(url);
  const [status, setStatus] = useState<"loading" | "loaded" | "error">(
    "loading",
  );

  useEffect(() => {
    setStatus(src ? "loading" : "error");
  }, [src]);

  if (!src || status === "error") return null;

  return (
    <div className="lyra-mobile-cover-art" data-testid="cover-art">
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
    </div>
  );
}

/**
 * Blurred album-cover backdrop, Apple-Music style: the cover fills the
 * screen under heavy blur, a warm mist keeps ink text readable, and the
 * ambient color underneath remains the fallback while loading / on error.
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
