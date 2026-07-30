import type { ReactNode } from "react";

export type GlassBarProps = {
  children: ReactNode;
};

/**
 * Floating glass dock — houses player controls, trace, and input.
 * Centered above the bottom edge so the shanshui background breathes.
 */
export function GlassBar({ children }: GlassBarProps) {
  return (
    <div className="lyra-dock-wrap">
      <div className="lyra-dock" data-testid="glass-dock">
        {children}
      </div>
    </div>
  );
}
