import { useEffect, useMemo, useState } from "react";
import { ambientColor, type PAD } from "../lib/color";

export type AmbientBackgroundProps = {
  pad: PAD;
  children?: React.ReactNode;
  className?: string;
};

/** Same PAD + time-of-day ambient surface as the Mac desktop home. */
export function AmbientBackground({
  pad,
  children,
  className,
}: AmbientBackgroundProps) {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 60_000);
    return () => clearInterval(id);
  }, []);

  const bg = useMemo(
    () => ambientColor(pad, new Date()),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pad, tick],
  );

  return (
    <div
      data-testid="ambient-surface"
      className={["lyra-mobile-ambient", className].filter(Boolean).join(" ")}
      style={
        {
          backgroundColor: bg,
          "--lyra-ambient-color": bg,
        } as React.CSSProperties
      }
    >
      {children}
    </div>
  );
}
