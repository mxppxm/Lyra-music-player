export type AlbumCoverProps = {
  coverUrl: string | null;
  alt?: string;
};

export function AlbumCover({ coverUrl, alt }: AlbumCoverProps) {
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
            background: "currentColor",
            opacity: 0.15,
          }}
        />
      )}
    </div>
  );
}
