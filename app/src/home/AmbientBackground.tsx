import { useEffect, useMemo, useState } from "react";
import { ambientColor, type PAD } from "../lib/color";

export type AmbientBackgroundProps = {
  pad: PAD;
  now?: Date;
  children?: React.ReactNode;
};

export function AmbientBackground({
  pad,
  now,
  children,
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
      className="lyra-ambient"
      style={{
        backgroundColor: bg,
        minHeight: "100vh",
        transition: "var(--lyra-transition-ambient)",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {children}
    </div>
  );
}
