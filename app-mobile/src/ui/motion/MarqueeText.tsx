import { useLayoutEffect, useRef, useState } from "react";
import type { ReactNode } from "react";

/**
 * Horizontally scrolls overflowing single-line text so the full line stays
 * readable. Measures its own overflow and only activates the marquee when
 * the track is wider than the container; the scroll distance and a constant
 * scroll speed (px/s) are exposed to the keyframes via the
 * --lyra-marquee-dx / --lyra-marquee-duration custom properties, so every
 * title glides at the same pace regardless of length.
 */
export type MarqueeTextProps = {
  children: ReactNode;
};

const SCROLL_SPEED_PX_PER_S = 26;

export function MarqueeText({ children }: MarqueeTextProps) {
  const ref = useRef<HTMLSpanElement | null>(null);
  const [overflowing, setOverflowing] = useState(false);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => {
      const dx = Math.max(0, el.scrollWidth - el.clientWidth);
      el.style.setProperty("--lyra-marquee-dx", `${dx}px`);
      // Round-trip (out and back) at a constant speed.
      el.style.setProperty(
        "--lyra-marquee-duration",
        `${Math.max(4, (dx * 2) / SCROLL_SPEED_PX_PER_S)}s`,
      );
      setOverflowing(dx > 1);
    };
    update();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <span
      ref={ref}
      className={overflowing ? "lyra-marquee lyra-marquee--active" : "lyra-marquee"}
    >
      <span className="lyra-marquee__track">{children}</span>
    </span>
  );
}
