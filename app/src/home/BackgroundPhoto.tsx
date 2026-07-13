import { SESSION_BG } from "./bgManifest";

export type BackgroundPhotoProps = {
  /** Override for tests. */
  urlOverride?: string | null;
};

export function BackgroundPhoto({ urlOverride }: BackgroundPhotoProps = {}) {
  const url = urlOverride ?? SESSION_BG?.url ?? null;
  if (!url) return null;

  return (
    <>
      <div
        data-testid="bg-photo"
        style={{
          position: "fixed",
          inset: 0,
          backgroundImage: `url(${url})`,
          backgroundSize: "cover",
          backgroundPosition: "center",
          zIndex: 0,
          pointerEvents: "none",
        }}
      />
      {/* Readability / mood vignette. Dark bottom keeps input text legible;
          soft top mutes any hot spots in the photo. */}
      <div
        data-testid="bg-photo-vignette"
        style={{
          position: "fixed",
          inset: 0,
          background:
            "linear-gradient(to bottom, rgba(0,0,0,0.15) 0%, rgba(0,0,0,0.08) 40%, rgba(0,0,0,0.50) 100%)",
          zIndex: 0,
          pointerEvents: "none",
        }}
      />
    </>
  );
}
