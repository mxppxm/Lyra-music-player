export type BreathingGlowProps = {
  /** Boot screen uses a larger soft bloom; the play button uses a compact one. */
  size?: "lg" | "sm";
  /** Light bloom on dark primary button; warm bloom on ambient boot. */
  tone?: "warm" | "light";
  className?: string;
};

/** Soft elliptical bloom that breathes — shared boot / buffer loading language. */
export function BreathingGlow({
  size = "lg",
  tone = "warm",
  className,
}: BreathingGlowProps) {
  return (
    <span
      className={[
        "lyra-mobile-breath-glow",
        `lyra-mobile-breath-glow--${size}`,
        `lyra-mobile-breath-glow--${tone}`,
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      aria-hidden
    />
  );
}
