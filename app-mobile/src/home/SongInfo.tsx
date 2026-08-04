import { Crossfade } from "../ui/motion/Crossfade";
import { MarqueeText } from "../ui/motion/MarqueeText";

export type SongInfoProps = {
  title: string;
  artist: string;
};

export function SongInfo({ title, artist }: SongInfoProps) {
  const t = title.trim();
  const a = artist.trim();
  const text = t ? (a ? `《${t}》 · ${a}` : `《${t}》`) : "";
  return (
    <div data-testid="song-info" className="lyra-mobile-song-info">
      <Crossfade text={text}>
        <MarqueeText>{text}</MarqueeText>
      </Crossfade>
    </div>
  );
}
