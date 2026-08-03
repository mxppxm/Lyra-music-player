/** Thinking note: "Lyra 正在想" + animated ellipsis. */
export function ThinkingNote() {
  return (
    <div
      className="lyra-mobile-thinking"
      data-testid="thinking-indicator"
      aria-label="思考中"
      role="status"
    >
      <span className="lyra-mobile-thinking__text">
        Lyra 正在想
        <span className="lyra-mobile-thinking__dots" aria-hidden>
          <span>.</span>
          <span>.</span>
          <span>.</span>
        </span>
      </span>
    </div>
  );
}
