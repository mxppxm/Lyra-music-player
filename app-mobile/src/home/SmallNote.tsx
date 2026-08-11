import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
  type RefObject,
  type TransitionEvent,
} from "react";
import { createPortal } from "react-dom";
import { Crossfade } from "../ui/motion/Crossfade";
import { IconExpand, IconExpandCollapse, IconRefresh } from "./icons";
import { trackActivity } from "@lyra/core/daily/trackActivity";
import { playSessionTracker } from "@lyra/core/daily/PlaySessionTracker";

export type SmallNoteFlip = {
  flipped: boolean;
  /** Lyrics body when loaded; ignored while loading/failed. */
  backText?: string;
  loading?: boolean;
  failed?: boolean;
  /** Force re-fetch in progress (expanded sheet keeps showing old text). */
  refreshing?: boolean;
  /** Re-fetch lyrics and overwrite cache (shown on expanded sheet). */
  onRefresh?: () => void;
  /** Optional song id for daily activity telemetry. */
  songId?: string;
};

export type SmallNoteProps = {
  text: string;
  color?: string;
  /** Error state — clickable (retry) with a clamped, scrollable height. */
  error?: boolean;
  /** Front-face copy is still being generated (replay). */
  textLoading?: boolean;
  onClick?: () => void;
  /** When set, the note is a flippable card (rationale ↔ lyrics). */
  flip?: SmallNoteFlip;
};

const FAILED_COPY = "暂时找不到歌词，点一下重试";
const RATIONALE_EXPAND_MS = 520;
const RATIONALE_EXPAND_EASE = "cubic-bezier(0.22, 0.61, 0.36, 1)";

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true
  );
}

type SizeBox = { width: number; height: number };

/** Grow the note bubble from the compact "…" size into full copy — both
 *  axes, expanding from the visual center (width via margin:auto, height
 *  via a compensating marginTop that eases out). */
function useRationaleExpand(
  shellRef: RefObject<HTMLElement | null>,
  textLoading: boolean,
  text: string,
) {
  const wasLoadingRef = useRef(textLoading);
  const loadingSizeRef = useRef<SizeBox>({ width: 0, height: 0 });

  useLayoutEffect(() => {
    const el = shellRef.current;
    if (!el) {
      wasLoadingRef.current = textLoading;
      return;
    }

    const clearInline = () => {
      el.style.width = "";
      el.style.height = "";
      el.style.maxWidth = "";
      el.style.marginTop = "";
      el.style.overflow = "";
      el.style.transition = "";
    };

    if (textLoading) {
      const box = el.getBoundingClientRect();
      loadingSizeRef.current = { width: box.width, height: box.height };
      wasLoadingRef.current = true;
      clearInline();
      return;
    }

    if (!wasLoadingRef.current) return;
    wasLoadingRef.current = false;

    if (prefersReducedMotion() || !text.trim()) return;

    const from = loadingSizeRef.current;
    // Natural size after the real copy is already in the DOM.
    const toWidth = el.getBoundingClientRect().width;
    const toHeight = el.scrollHeight;
    const dW = Math.abs(toWidth - from.width);
    const dH = Math.abs(toHeight - from.height);
    if (!(from.width > 0 && from.height > 0) || (dW < 2 && dH < 2)) return;

    const marginTopFrom = Math.max(0, (toHeight - from.height) / 2);

    el.style.maxWidth = "none";
    el.style.overflow = "hidden";
    el.style.width = `${from.width}px`;
    el.style.height = `${from.height}px`;
    el.style.marginTop = `${marginTopFrom}px`;
    el.style.transition = "none";
    void el.offsetHeight;

    el.style.transition = [
      `width ${RATIONALE_EXPAND_MS}ms ${RATIONALE_EXPAND_EASE}`,
      `height ${RATIONALE_EXPAND_MS}ms ${RATIONALE_EXPAND_EASE}`,
      `margin-top ${RATIONALE_EXPAND_MS}ms ${RATIONALE_EXPAND_EASE}`,
    ].join(", ");
    el.style.width = `${toWidth}px`;
    el.style.height = `${toHeight}px`;
    el.style.marginTop = "0px";

    let settled = false;
    const settle = () => {
      if (settled) return;
      settled = true;
      clearInline();
    };
    const onEnd = (e: Event) => {
      const te = e as globalThis.TransitionEvent;
      if (te.target !== el) return;
      if (te.propertyName !== "height" && te.propertyName !== "width") return;
      settle();
    };
    el.addEventListener("transitionend", onEnd);
    const fallback = window.setTimeout(settle, RATIONALE_EXPAND_MS + 100);
    return () => {
      el.removeEventListener("transitionend", onEnd);
      window.clearTimeout(fallback);
    };
  }, [shellRef, textLoading, text]);
}

function RationaleLoading() {
  return (
    <span
      className="lyra-mobile-small-note__loading"
      data-testid="small-note-text-loading"
      aria-label="文案生成中"
    >
      <span className="lyra-mobile-thinking__dots" aria-hidden>
        <span>.</span>
        <span>.</span>
        <span>.</span>
      </span>
    </span>
  );
}

type RectBox = { top: number; left: number; width: number; height: number };

function LyricsLoading() {
  return (
    <span className="lyra-mobile-small-note__loading" aria-label="在找歌词">
      在找歌词
      <span className="lyra-mobile-thinking__dots" aria-hidden>
        <span>.</span>
        <span>.</span>
        <span>.</span>
      </span>
    </span>
  );
}

function readRect(el: HTMLElement): RectBox {
  const r = el.getBoundingClientRect();
  return { top: r.top, left: r.left, width: r.width, height: r.height };
}

function expandedTarget(origin: RectBox): RectBox {
  const margin = 14;
  const width = Math.min(520, window.innerWidth - margin * 2);
  const height = Math.min(window.innerHeight * 0.78, 640);
  // Grow from the small card's center so the sheet doesn't drop downward;
  // only nudge if the target would leave the viewport.
  const cx = origin.left + origin.width / 2;
  const cy = origin.top + origin.height / 2;
  const left = Math.min(
    Math.max(cx - width / 2, margin),
    window.innerWidth - margin - width,
  );
  const top = Math.min(
    Math.max(cy - height / 2, margin),
    window.innerHeight - margin - height,
  );
  return { top, left, width, height };
}

function boxStyle(box: RectBox): CSSProperties {
  return {
    top: box.top,
    left: box.left,
    width: box.width,
    height: box.height,
  };
}

/** Recommendation rationale — always shown in full. Error notes are
 *  clickable ("点一下重试") and their text is height-clamped + scrollable so
 *  long provider error bodies can never push the layout.
 *  Expand grows from the small card's center; the expand control rides the
 *  card's top-right and flips to collapse. */
export function SmallNote({
  text,
  color,
  error,
  textLoading = false,
  onClick,
  flip,
}: SmallNoteProps) {
  const flippable = Boolean(flip) && !error;
  const interactive = Boolean(onClick) && !textLoading;
  const flipped = Boolean(flip?.flipped);
  const noteRef = useRef<HTMLDivElement>(null);
  const originRef = useRef<RectBox | null>(null);
  const morphGenRef = useRef(0);
  const morphOpenRef = useRef(false);

  const [morphMounted, setMorphMounted] = useState(false);
  const [morphOpen, setMorphOpen] = useState(false);
  const [originBox, setOriginBox] = useState<RectBox | null>(null);
  const [targetBox, setTargetBox] = useState<RectBox | null>(null);

  morphOpenRef.current = morphOpen;

  const loading = Boolean(flip?.loading);
  const failed = Boolean(flip?.failed);
  const lyricsReady = !loading && !failed && Boolean(flip?.backText?.trim());
  const canExpand = flipped && lyricsReady;

  const frontContent = textLoading ? (
    <RationaleLoading />
  ) : (
    <Crossfade text={text}>{text}</Crossfade>
  );

  useRationaleExpand(noteRef, textLoading, text);

  useEffect(() => {
    if (!canExpand && morphMounted) {
      morphGenRef.current += 1;
      setMorphOpen(false);
      setMorphMounted(false);
      setOriginBox(null);
      setTargetBox(null);
      originRef.current = null;
    }
  }, [canExpand, morphMounted]);

  useEffect(() => {
    if (!morphMounted) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeExpand();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [morphMounted]);

  useLayoutEffect(() => {
    if (!morphMounted || morphOpenRef.current || !originBox || !targetBox) return;
    const gen = morphGenRef.current;
    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => {
        if (gen !== morphGenRef.current) return;
        setMorphOpen(true);
      });
    });
    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
    };
  }, [morphMounted]); // eslint-disable-line react-hooks/exhaustive-deps -- kick once per morph mount

  function openExpand() {
    const el = noteRef.current;
    if (!el || morphMounted) return;
    const origin = readRect(el);
    const target = expandedTarget(origin);
    originRef.current = origin;
    morphGenRef.current += 1;
    setOriginBox(origin);
    setTargetBox(target);
    setMorphMounted(true);
    setMorphOpen(false);
    playSessionTracker.noteLyricsOpen();
    void trackActivity({
      name: "lyrics_open",
      songId: flip?.songId,
      props: { surface: "sheet" },
    });
  }

  function closeExpand() {
    morphGenRef.current += 1;
    const origin =
      originRef.current ??
      (noteRef.current ? readRect(noteRef.current) : null);
    void trackActivity({
      name: "lyrics_close",
      songId: flip?.songId,
      props: { surface: "sheet" },
    });
    if (!origin) {
      setMorphOpen(false);
      setMorphMounted(false);
      setOriginBox(null);
      setTargetBox(null);
      return;
    }
    setOriginBox(origin);
    setMorphOpen(false);
  }

  function onMorphTransitionEnd(e: TransitionEvent<HTMLDivElement>) {
    if (e.target !== e.currentTarget) return;
    if (morphOpenRef.current) return;
    setMorphMounted(false);
    setOriginBox(null);
    setTargetBox(null);
    originRef.current = null;
  }

  let backContent: ReactNode = <LyricsLoading />;
  if (failed) backContent = FAILED_COPY;
  else if (lyricsReady) backContent = flip!.backText;
  else if (loading) backContent = <LyricsLoading />;
  else if (flip?.backText) backContent = flip.backText;

  const className = [
    "lyra-mobile-small-note",
    error ? "lyra-mobile-small-note--error" : "",
    flippable ? "lyra-mobile-small-note--flippable" : "",
    flipped ? "lyra-mobile-small-note--flipped" : "",
    morphMounted ? "lyra-mobile-small-note--morphing" : "",
  ]
    .filter(Boolean)
    .join(" ");

  if (!flippable) {
    return (
      <div
        ref={noteRef}
        data-testid="small-note"
        className={className}
        style={color ? { color } : undefined}
        role={interactive ? "button" : undefined}
        tabIndex={interactive ? 0 : undefined}
        aria-disabled={interactive ? undefined : true}
        aria-busy={textLoading || undefined}
        onClick={textLoading ? undefined : onClick}
        onKeyDown={
          interactive
            ? (e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onClick?.();
                }
              }
            : undefined
        }
      >
        {frontContent}
      </div>
    );
  }

  const liveBox =
    morphOpen && targetBox
      ? targetBox
      : (originBox ?? targetBox);

  return (
    <>
      <div
        ref={noteRef}
        data-testid="small-note"
        className={className}
        style={color ? { color } : undefined}
        role="button"
        tabIndex={0}
        aria-pressed={flipped}
        onClick={(e) => {
          e.stopPropagation();
          if (morphMounted || textLoading) return;
          onClick?.();
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            e.stopPropagation();
            if (morphMounted || textLoading) return;
            onClick?.();
          }
        }}
      >
        <div
          className={[
            "lyra-mobile-small-note__scene",
            flipped ? "lyra-mobile-small-note__scene--flipped" : "",
          ]
            .filter(Boolean)
            .join(" ")}
        >
          <div className="lyra-mobile-small-note__card lyra-mobile-small-note__card--front">
            {frontContent}
          </div>
          <div
            className="lyra-mobile-small-note__card lyra-mobile-small-note__card--back"
            data-testid="small-note-lyrics"
          >
            {canExpand && !morphMounted && (
              <button
                type="button"
                className="lyra-mobile-small-note__expand"
                data-testid="small-note-expand"
                aria-label="扩大歌词"
                onClick={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                  openExpand();
                }}
              >
                <IconExpand />
              </button>
            )}
            <div className="lyra-mobile-small-note__lyrics-body">{backContent}</div>
          </div>
        </div>
      </div>

      {morphMounted &&
        liveBox &&
        createPortal(
          <div
            className={[
              "lyra-mobile-lyrics-morph",
              morphOpen ? "lyra-mobile-lyrics-morph--open" : "",
            ]
              .filter(Boolean)
              .join(" ")}
            data-testid="lyrics-sheet"
            role="dialog"
            aria-modal="true"
            aria-label="歌词"
          >
            <div
              className="lyra-mobile-lyrics-morph__backdrop"
              onClick={(e) => {
                e.stopPropagation();
                closeExpand();
              }}
            />
            <div
              className="lyra-mobile-lyrics-morph__card"
              style={boxStyle(liveBox)}
              onClick={(e) => e.stopPropagation()}
              onTransitionEnd={onMorphTransitionEnd}
            >
              <button
                type="button"
                className="lyra-mobile-small-note__expand lyra-mobile-lyrics-morph__close"
                data-testid="lyrics-sheet-close"
                aria-label={morphOpen ? "收起歌词" : "扩大歌词"}
                onClick={(e) => {
                  e.stopPropagation();
                  closeExpand();
                }}
              >
                <IconExpandCollapse collapsed={morphOpen} />
              </button>
              <div className="lyra-mobile-lyrics-morph__content">
                <div
                  className={[
                    "lyra-mobile-lyrics-morph__body",
                    flip?.refreshing
                      ? "lyra-mobile-lyrics-morph__body--refreshing"
                      : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                >
                  <Crossfade text={flip?.backText ?? ""}>
                    {flip?.backText}
                  </Crossfade>
                  <button
                    type="button"
                    className={[
                      "lyra-mobile-small-note__expand",
                      "lyra-mobile-lyrics-morph__refresh",
                      flip?.refreshing
                        ? "lyra-mobile-lyrics-morph__refresh--spin"
                        : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    data-testid="lyrics-sheet-refresh"
                    aria-label="重新获取歌词"
                    disabled={Boolean(flip?.refreshing)}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (flip?.refreshing) return;
                      void trackActivity({
                        name: "lyrics_refresh",
                        songId: flip?.songId,
                      });
                      flip?.onRefresh?.();
                    }}
                  >
                    <IconRefresh />
                  </button>
                </div>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
