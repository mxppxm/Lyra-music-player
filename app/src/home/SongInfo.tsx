export type SongInfoProps = {
  title: string;
  artist: string;
};

export function SongInfo({ title, artist }: SongInfoProps) {
  return (
    <div
      data-testid="song-info"
      style={{
        color: "var(--lyra-color-song-info)",
        fontSize: "var(--lyra-song-font-size)",
        fontFamily: "var(--lyra-song-family)",
        textAlign: "center",
        whiteSpace: "nowrap",
        overflow: "hidden",
        textOverflow: "ellipsis",
        maxWidth: "var(--lyra-cover-size)",
      }}
    >{`《${title}》 · ${artist}`}</div>
  );
}
