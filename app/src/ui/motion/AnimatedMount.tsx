import type { ReactNode } from "react";
import { useMountTransition } from "./useMountTransition";

export type AnimatedMountProps = {
  open: boolean;
  children: ReactNode;
  zIndex?: number;
  variant?: "center" | "fullscreen";
  backdrop?: ReactNode;
  enterMs?: number;
  exitMs?: number;
  disabled?: boolean;
};

export function AnimatedMount({
  open,
  children,
  zIndex = 9990,
  variant = "center",
  backdrop,
  enterMs,
  exitMs,
  disabled,
}: AnimatedMountProps) {
  const { render, phase } = useMountTransition(open, { enterMs, exitMs, disabled });
  if (!render) return null;
  return (
    <div
      className={`lyra-motion-root lyra-motion--${phase}`}
      style={{ position: "fixed", inset: 0, zIndex, pointerEvents: "none" }}
    >
      {backdrop != null && <div className="lyra-modal-backdrop">{backdrop}</div>}
      <div className={`lyra-motion-panel lyra-motion-panel--${variant}`}>
        {children}
      </div>
    </div>
  );
}
