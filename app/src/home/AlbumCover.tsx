export type AlbumCoverProps = {
  coverUrl: string | null;
  alt?: string;
  /** Text shown inside the placeholder as a soft "seal" identity (usually the song title). Optional. */
  titleHint?: string;
};

export function AlbumCover({ coverUrl, alt, titleHint }: AlbumCoverProps) {
  return (
    <div
      data-testid="album-cover-frame"
      style={{
        width: "var(--lyra-cover-size)",
        height: "var(--lyra-cover-size)",
        borderRadius: "var(--lyra-cover-radius)",
        boxShadow: "var(--lyra-cover-shadow)",
        overflow: "hidden",
        transition: "var(--lyra-transition-fade)",
      }}
    >
      {coverUrl ? (
        <img
          src={coverUrl}
          alt={alt ?? ""}
          style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
        />
      ) : (
        <div
          data-testid="album-cover-placeholder"
          style={{
            width: "100%",
            height: "100%",
            // Ambient-derived base (spec §3.2: "current ambient color's deeper version").
            // Radial gradient adds a soft glow center so a 400x400 placeholder reads as
            // a "presence" rather than a dead rectangle.
            background:
              "radial-gradient(120% 90% at 50% 40%, " +
              "color-mix(in oklab, var(--lyra-ambient-color, #cccccc) 88%, white) 0%, " +
              "color-mix(in oklab, var(--lyra-ambient-color, #cccccc) 62%, black) 100%)",
            transition: "var(--lyra-transition-ambient)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "16%",
            boxSizing: "border-box",
          }}
        >
          {titleHint && (
            <span
              data-testid="album-cover-title-seal"
              style={{
                fontFamily: "var(--lyra-note-family)",
                fontStyle: "italic",
                fontSize: "1.35rem",
                lineHeight: 1.35,
                color: "rgba(0,0,0,0.35)",
                textAlign: "center",
                overflow: "hidden",
                display: "-webkit-box",
                WebkitLineClamp: 3,
                WebkitBoxOrient: "vertical",
                userSelect: "none",
              }}
            >
              {titleHint}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
