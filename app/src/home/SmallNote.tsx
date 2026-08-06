import { Crossfade } from "../ui/motion/Crossfade";
import { IconRipple } from "./icons";

export type SmallNoteProps = {
  text: string;
  color?: string;
};

/** Recommendation rationale — always shown in full, no click-to-expand. */
export function SmallNote({ text, color }: SmallNoteProps) {
  const isError = !!color;
  return (
    <div
      data-testid="small-note"
      className="lyra-small-note"
      style={color ? { color } : undefined}
    >
      {isError && (
        <span className="lyra-small-note__glyph" aria-hidden>
          <IconRipple />
        </span>
      )}
      <Crossfade text={text}>{text}</Crossfade>
    </div>
  );
}