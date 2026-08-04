import { useEffect, useRef, useState } from "react";

export type MountPhase = "idle" | "entering" | "open" | "leaving";

export type UseMountTransitionOptions = {
  enterMs?: number;
  exitMs?: number;
  disabled?: boolean;
};

function prefersReducedMotion(): boolean {
  try {
    return (
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    );
  } catch {
    return false;
  }
}

function motionDisabledByDefault(): boolean {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return true;
  return prefersReducedMotion();
}

export function useMountTransition(
  open: boolean,
  options: UseMountTransitionOptions = {},
): { render: boolean; phase: MountPhase } {
  const { enterMs = 420, exitMs = 300 } = options;
  const disabled = options.disabled ?? motionDisabledByDefault();

  const [phase, setPhase] = useState<MountPhase>(() =>
    disabled ? (open ? "open" : "idle") : open ? "entering" : "idle",
  );
  const phaseRef = useRef(phase);
  phaseRef.current = phase;
  const openRef = useRef(open);

  useEffect(() => {
    if (disabled) {
      setPhase(open ? "open" : "idle");
      return;
    }
    if (open === openRef.current) return;
    openRef.current = open;
    if (open) {
      setPhase("entering");
    } else if (phaseRef.current !== "idle" && phaseRef.current !== "leaving") {
      setPhase("leaving");
    }
  }, [open, disabled]);

  useEffect(() => {
    if (disabled) return;
    if (phase === "entering") {
      const t = window.setTimeout(() => setPhase("open"), enterMs);
      return () => window.clearTimeout(t);
    }
    if (phase === "leaving") {
      const t = window.setTimeout(() => setPhase("idle"), exitMs);
      return () => window.clearTimeout(t);
    }
  }, [phase, enterMs, exitMs, disabled]);

  return { render: phase !== "idle", phase };
}
