import {
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type TransitionEvent,
} from "react";
import { createPortal } from "react-dom";
import { normalizeCoverUrl } from "./CoverBackground";

export type RectBox = {
  top: number;
  left: number;
  width: number;
  height: number;
};

const MORPH_MS = 480;
const MORPH_EASE = "cubic-bezier(0.22, 0.61, 0.36, 1)";

export function readElementRect(el: HTMLElement): RectBox {
  const r = el.getBoundingClientRect();
  return { top: r.top, left: r.left, width: r.width, height: r.height };
}

/** Portrait fullscreen inset — slight margin so it still “grows” like lyrics. */
export function videoFullscreenTarget(): RectBox {
  return {
    top: 0,
    left: 0,
    width: window.innerWidth,
    height: window.innerHeight,
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

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true
  );
}

export type CoverVideoMorphProps = {
  /** Cover image shown while the shell stretches (before native video). */
  coverUrl: string | null;
  origin: RectBox;
  /** true = animate toward fullscreen; false = animate back to origin. */
  open: boolean;
  /** Called once the open morph finishes (native overlay should attach then). */
  onOpened?: () => void;
  /** Called once the close morph finishes (unmount shell). */
  onClosed?: () => void;
};

/**
 * Lyrics-sheet style morph: fixed shell grows from the cover rect to
 * fullscreen (and reverse). Native AVPlayerLayer attaches after open settles
 * so the stretch feels continuous instead of a hard cut.
 */
export function CoverVideoMorph({
  coverUrl,
  origin,
  open,
  onOpened,
  onClosed,
}: CoverVideoMorphProps) {
  const [liveOpen, setLiveOpen] = useState(false);
  const openRef = useRef(open);
  const settledOpenRef = useRef(false);
  const onOpenedRef = useRef(onOpened);
  const onClosedRef = useRef(onClosed);
  openRef.current = open;
  onOpenedRef.current = onOpened;
  onClosedRef.current = onClosed;

  const src = normalizeCoverUrl(coverUrl);
  const target = videoFullscreenTarget();
  const reduced = prefersReducedMotion();

  useLayoutEffect(() => {
    if (reduced) {
      setLiveOpen(open);
      if (open) {
        settledOpenRef.current = true;
        onOpenedRef.current?.();
      } else {
        settledOpenRef.current = false;
        onClosedRef.current?.();
      }
      return;
    }
    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => {
        setLiveOpen(open);
      });
    });
    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
    };
  }, [open, reduced]);

  function onTransitionEnd(e: TransitionEvent<HTMLDivElement>) {
    if (e.target !== e.currentTarget) return;
    if (e.propertyName !== "width" && e.propertyName !== "height") return;
    if (openRef.current) {
      if (settledOpenRef.current) return;
      settledOpenRef.current = true;
      onOpenedRef.current?.();
    } else {
      settledOpenRef.current = false;
      onClosedRef.current?.();
    }
  }

  const liveBox = liveOpen ? target : origin;

  return createPortal(
    <div
      className={[
        "lyra-mobile-video-morph",
        liveOpen ? "lyra-mobile-video-morph--open" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      data-testid="cover-video-morph"
      aria-hidden
    >
      <div
        className="lyra-mobile-video-morph__shell"
        style={{
          ...boxStyle(liveBox),
          transition: reduced
            ? "none"
            : [
                `top ${MORPH_MS}ms ${MORPH_EASE}`,
                `left ${MORPH_MS}ms ${MORPH_EASE}`,
                `width ${MORPH_MS}ms ${MORPH_EASE}`,
                `height ${MORPH_MS}ms ${MORPH_EASE}`,
                `border-radius ${MORPH_MS}ms ${MORPH_EASE}`,
              ].join(", "),
        }}
        onTransitionEnd={onTransitionEnd}
      >
        {src ? (
          <img
            className="lyra-mobile-video-morph__cover"
            src={src}
            alt=""
            draggable={false}
          />
        ) : (
          <div className="lyra-mobile-video-morph__cover lyra-mobile-video-morph__cover--empty" />
        )}
      </div>
    </div>,
    document.body,
  );
}

export const COVER_VIDEO_MORPH_MS = MORPH_MS;
