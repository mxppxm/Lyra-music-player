// DailyDigestSheet — lyrics-style morph sheet for reading + sharing a daily.
// Open: grow the shell first, then reveal paper bg + content.
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type TransitionEvent,
} from "react";
import { createPortal } from "react-dom";
import { trackActivity } from "@lyra/core/daily/trackActivity";
import { IconShare } from "./icons";
import { lightTap } from "./immersiveStatusBar";
import { shareDailyImage } from "./shareDailyImage";
import { splitDailyHtml } from "./splitDailyHtml";
import { useSheetScrollLock } from "./useSheetScrollLock";

export type DailyDigestSheetProps = {
  open: boolean;
  dayKey: string;
  html: string;
  /** List-item rect to morph from; falls back to a centered card. */
  origin?: { top: number; left: number; width: number; height: number } | null;
  onClose: () => void;
};

type RectBox = { top: number; left: number; width: number; height: number };

const SIZE_PROPS = new Set(["top", "left", "width", "height"]);

/** Read `env(safe-area-inset-*)` via a probe element (WKWebView-safe). */
function readCssEnvPx(
  inset: "safe-area-inset-top" | "safe-area-inset-bottom",
): number {
  if (typeof document === "undefined") return 0;
  const probe = document.createElement("div");
  probe.style.position = "fixed";
  probe.style.visibility = "hidden";
  probe.style.pointerEvents = "none";
  if (inset === "safe-area-inset-top") {
    probe.style.paddingTop = `env(${inset})`;
  } else {
    probe.style.paddingBottom = `env(${inset})`;
  }
  document.body.appendChild(probe);
  const styles = getComputedStyle(probe);
  const raw =
    inset === "safe-area-inset-top" ? styles.paddingTop : styles.paddingBottom;
  probe.remove();
  const n = parseFloat(raw);
  return Number.isFinite(n) ? n : 0;
}

function expandedTarget(_origin: RectBox): RectBox {
  const marginX = 16;
  const safeTop = readCssEnvPx("safe-area-inset-top");
  const safeBottom = readCssEnvPx("safe-area-inset-bottom");
  // Keep clear of the always-on Lyra brand header.
  const top = safeTop + 56;
  const bottomGap = Math.max(18, safeBottom + 12);
  const width = Math.max(280, window.innerWidth - marginX * 2);
  const height = Math.max(280, window.innerHeight - top - bottomGap);
  return { top, left: marginX, width, height };
}

function fallbackOrigin(): RectBox {
  const width = Math.min(320, window.innerWidth - 48);
  const height = 56;
  return {
    top: window.innerHeight * 0.45,
    left: (window.innerWidth - width) / 2,
    width,
    height,
  };
}

function boxStyle(box: RectBox): CSSProperties {
  return {
    top: box.top,
    left: box.left,
    width: box.width,
    height: box.height,
  };
}

export function DailyDigestSheet({
  open,
  dayKey,
  html,
  origin,
  onClose,
}: DailyDigestSheetProps) {
  const [mounted, setMounted] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [sharing, setSharing] = useState(false);
  const originRef = useRef<RectBox | null>(null);
  const [originBox, setOriginBox] = useState<RectBox | null>(null);
  const [targetBox, setTargetBox] = useState<RectBox | null>(null);
  const morphGenRef = useRef(0);
  const expandedRef = useRef(false);
  const revealedRef = useRef(false);
  const closingRef = useRef(false);
  const captureRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  expandedRef.current = expanded;
  revealedRef.current = revealed;
  const { styles, body, bodyClass } = splitDailyHtml(html);

  // Block scroll chaining into History / home while the sheet is mounted.
  useSheetScrollLock(mounted, scrollRef);

  useEffect(() => {
    if (!open) {
      morphGenRef.current += 1;
      closingRef.current = false;
      setExpanded(false);
      setRevealed(false);
      setMounted(false);
      setOriginBox(null);
      setTargetBox(null);
      originRef.current = null;
      return;
    }
    const start = origin ?? fallbackOrigin();
    originRef.current = start;
    const target = expandedTarget(start);
    morphGenRef.current += 1;
    closingRef.current = false;
    setOriginBox(start);
    setTargetBox(target);
    setExpanded(false);
    setRevealed(false);
    setMounted(true);
    void trackActivity({
      name: "daily_open",
      props: { day_key: dayKey },
    });
  }, [open, dayKey, origin]);

  useLayoutEffect(() => {
    if (!mounted || expandedRef.current || !originBox || !targetBox) return;
    const gen = morphGenRef.current;
    let raf2 = 0;
    let revealFallback = 0;
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => {
        if (gen !== morphGenRef.current) return;
        setExpanded(true);
        // If size transitionend is skipped (reduced motion / interrupted), still reveal.
        revealFallback = window.setTimeout(() => {
          if (gen !== morphGenRef.current || closingRef.current) return;
          if (!revealedRef.current) setRevealed(true);
        }, 520);
      });
    });
    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
      window.clearTimeout(revealFallback);
    };
  }, [mounted, originBox, targetBox]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeSheet();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps -- close uses latest onClose via ref below

  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  function beginShrink() {
    const start = originRef.current ?? fallbackOrigin();
    setOriginBox(start);
    setExpanded(false);
  }

  function closeSheet() {
    if (closingRef.current) return;
    closingRef.current = true;
    morphGenRef.current += 1;
    if (revealedRef.current) {
      // Phase A: hide paper + copy, then shrink.
      setRevealed(false);
      return;
    }
    beginShrink();
  }

  function onMorphTransitionEnd(e: TransitionEvent<HTMLDivElement>) {
    if (e.target !== e.currentTarget) return;
    if (!SIZE_PROPS.has(e.propertyName)) return;
    // Size transitions fire 4x; only react once per phase.
    if (expandedRef.current) {
      if (!revealedRef.current && !closingRef.current) {
        setRevealed(true);
      }
      return;
    }
    setMounted(false);
    setOriginBox(null);
    setTargetBox(null);
    setRevealed(false);
    originRef.current = null;
    closingRef.current = false;
    onCloseRef.current();
  }

  function onSurfaceTransitionEnd(e: TransitionEvent<HTMLDivElement>) {
    if (e.target !== e.currentTarget) return;
    if (e.propertyName !== "opacity") return;
    if (revealedRef.current) return;
    if (!closingRef.current) return;
    beginShrink();
  }

  async function handleShare() {
    const el = captureRef.current;
    if (!el || sharing || !revealed) return;
    lightTap();
    setSharing(true);
    void trackActivity({
      name: "daily_share",
      props: { day_key: dayKey },
    });
    try {
      const result = await shareDailyImage(el, dayKey);
      if (!result.ok && result.reason !== "cancelled") {
        window.alert(
          "分享没成功。若刚更新过 App，请完全关掉后重开再试一次。",
        );
      }
    } finally {
      setSharing(false);
    }
  }

  if (!mounted || !originBox) return null;

  const liveBox = expanded && targetBox ? targetBox : originBox;

  return createPortal(
    <div
      className={[
        "lyra-mobile-daily-sheet",
        expanded ? "lyra-mobile-daily-sheet--open" : "",
        revealed ? "lyra-mobile-daily-sheet--revealed" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      data-testid="daily-sheet"
      role="dialog"
      aria-modal="true"
      aria-label={`日报 ${dayKey}`}
    >
      <div
        className="lyra-mobile-daily-sheet__backdrop"
        data-testid="daily-sheet-backdrop"
        onClick={(e) => {
          e.stopPropagation();
          closeSheet();
        }}
      />
      <div
        className="lyra-mobile-daily-sheet__card"
        style={boxStyle(liveBox)}
        onClick={(e) => e.stopPropagation()}
        onTransitionEnd={onMorphTransitionEnd}
      >
        <div
          className="lyra-mobile-daily-sheet__surface"
          onTransitionEnd={onSurfaceTransitionEnd}
        >
          <div className="lyra-mobile-daily-sheet__toolbar">
            <button
              type="button"
              className="lyra-mobile-daily-sheet__icon-btn"
              data-testid="daily-share"
              aria-label="分享日报图片"
              disabled={sharing || !revealed}
              onClick={(e) => {
                e.stopPropagation();
                void handleShare();
              }}
            >
              <IconShare size={18} />
            </button>
            <button
              type="button"
              className="lyra-mobile-daily-sheet__icon-btn lyra-mobile-daily-sheet__icon-btn--close"
              data-testid="daily-sheet-close"
              aria-label="关闭日报"
              onClick={(e) => {
                e.stopPropagation();
                closeSheet();
              }}
            >
              ✕
            </button>
          </div>
          <div
            ref={scrollRef}
            className="lyra-mobile-daily-sheet__scroll"
            data-testid="daily-sheet-scroll"
            onTouchMove={(e) => {
              // Belt-and-suspenders: keep gesture inside this pane on iOS.
              e.stopPropagation();
            }}
          >
            <div
              ref={captureRef}
              className="lyra-mobile-daily-sheet__capture"
              data-testid="daily-capture"
            >
              {styles ? <style>{styles}</style> : null}
              <div
                className={["lyra-mobile-daily-sheet__body", bodyClass]
                  .filter(Boolean)
                  .join(" ")}
                dangerouslySetInnerHTML={{ __html: body }}
              />
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
