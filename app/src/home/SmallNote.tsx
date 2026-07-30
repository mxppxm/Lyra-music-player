export type SmallNoteProps = {
  text: string;
  color?: string;
};

/** Recommendation rationale — always shown in full, no click-to-expand. */
export function SmallNote({ text, color }: SmallNoteProps) {
  return (
    <div
      data-testid="small-note"
      className="lyra-small-note"
      style={color ? { color } : undefined}
    >
      {text}
    </div>
  );
}
