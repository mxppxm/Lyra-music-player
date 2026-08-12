/** Thinking note: "稍等" + animated ellipsis. */
export function ThinkingNote() {
  return (
    <div
      className="lyra-mobile-thinking"
      data-testid="thinking-indicator"
      aria-label="稍等"
      role="status"
    >
      <span className="lyra-mobile-thinking__text">
        稍等
        <span className="lyra-mobile-thinking__dots" aria-hidden>
          <span>.</span>
          <span>.</span>
          <span>.</span>
        </span>
      </span>
    </div>
  );
}
