import { Crossfade } from "../ui/motion/Crossfade";

export type SongInfoProps = {
  title: string;
  artist: string;
};

export function SongInfo({ title, artist }: SongInfoProps) {
  const t = title.trim();
  const a = artist.trim();
  const text = t
    ? a
      ? `《${t}》 · ${a}`
      : `《${t}》`
    : "";
  return (
    <div data-testid="song-info" className="lyra-song-info">
      <Crossfade text={text}>{text}</Crossfade>
    </div>
  );
}
