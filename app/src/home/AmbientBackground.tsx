import { useEffect, useMemo, useState } from "react";
import { ambientColor, type PAD } from "../lib/color";

export type AmbientBackgroundProps = {
  pad: PAD;
  now?: Date;
  children?: React.ReactNode;
  className?: string;
};

export function AmbientBackground({
  pad,
  now,
  children,
  className,
}: AmbientBackgroundProps) {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (now !== undefined) return; // don't tick when time is injected
    const id = setInterval(() => setTick((t) => t + 1), 60_000);
    return () => clearInterval(id);
  }, [now]);

  const bg = useMemo(
    () => ambientColor(pad, now ?? new Date()),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pad, now, tick],
  );

  return (
    <div
      data-testid="ambient-surface"
      className={["lyra-ambient", className].filter(Boolean).join(" ")}
      style={
        {
          backgroundColor: bg,
          // Expose the current ambient color as a CSS custom property so
          // descendants (e.g. the AlbumCover placeholder) can tint themselves
          // against it — spec §3.2 says the placeholder should be a deeper
          // version of the ambient, never a dead gray.
          "--lyra-ambient-color": bg,
          minHeight: "100vh",
          transition: "var(--lyra-transition-ambient)",
          display: "flex",
          flexDirection: "column",
        } as React.CSSProperties
      }
    >
      {children}
    </div>
  );
}
