import type { ReactNode } from "react";

export type GlassBarProps = {
  children: ReactNode;
  /** Playback mode: dock collapses to a faint input until hover/focus. */
  immersive?: boolean;
  expanded?: boolean;
  /** Phase 2 of collapse — input fades after extras finish. */
  inputDimmed?: boolean;
  onExpandedChange?: (expanded: boolean) => void;
};

/**
 * Floating dock — collapses to a minimal input during playback;
 * hover or focus expands player controls + trace + full input.
 */
export function GlassBar({
  children,
  immersive = false,
  expanded = false,
  inputDimmed = false,
  onExpandedChange,
}: GlassBarProps) {
  const wrapClass = [
    "lyra-dock-wrap",
    immersive ? "lyra-dock-wrap--immersive" : "",
    expanded ? "lyra-dock-wrap--expanded" : "",
    inputDimmed ? "lyra-dock-wrap--input-dimmed" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      className={wrapClass}
      data-testid="glass-dock-wrap"
      onMouseEnter={() => onExpandedChange?.(true)}
      onMouseLeave={() => onExpandedChange?.(false)}
    >
      <div className="lyra-dock" data-testid="glass-dock">
        {children}
      </div>
    </div>
  );
}
