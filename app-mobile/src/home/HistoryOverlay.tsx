// HistoryOverlay — 播放历史面板（移动端，可拖拽底部单，丝滑弹簧动效）。
// 数据直接读 @lyra/core 的 dialogue_turns，与桌面端共用同一份历史。
import { useEffect, useState, useRef, useCallback } from "react";
import { listRecentTurns } from "@lyra/core/db/repo/turnRepo";
import { getTrack } from "@lyra/core/db/repo/libraryRepo";
import { songDisplayTitle, songDisplayArtist } from "@lyra/core/library/display";
import type { DialogueTurn, LibraryTrack } from "@lyra/core";
import type { Orchestrator } from "@lyra/core";

const MAX_HISTORY = 50;
const DRAG_THRESHOLD_RATIO = 0.35;
// Time budget for the slide-out, also used as a safety net so closing never
// depends on the requestAnimationFrame loop converging (which could stall).
const CLOSE_ANIM_MS = 360;
// Extra travel past the sheet height so it fully retreats below the bottom edge.
const EXIT_MARGIN = 60;

// Spring physics config - tuned for "silky" feel
const SPRING_STIFFNESS = 220;
const SPRING_DAMPING = 22;
const MASS = 1;

export type HistoryOverlayProps = {
  open: boolean;
  onClose: () => void;
  orchestrator: Orchestrator;
};

type HistoryEntry = {
  turn: DialogueTurn;
  track: LibraryTrack | null;
};

export function HistoryOverlay({
  open,
  onClose,
  orchestrator,
}: HistoryOverlayProps) {
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [dragY, setDragY] = useState(0);
  const sheetRef = useRef<HTMLDivElement>(null);
  const startYRef = useRef(0);
  const dragYRef = useRef(0);
  const sheetHeightRef = useRef(0);
  const velocityRef = useRef(0);
  const animFrameRef = useRef<number | undefined>(undefined);
  const targetYRef = useRef(0);
  const isAnimatingRef = useRef(false);
  const onCloseRef = useRef(onClose);
  const closePendingRef = useRef(false);
  const closeTimerRef = useRef<number | undefined>(undefined);

  // Load history data when opening
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    listRecentTurns(MAX_HISTORY)
      .then(async (turns) => {
        const tracks = await Promise.all(
          turns.map((t) => getTrack(t.agent_response.song_id).catch(() => null)),
        );
        if (cancelled) return;
        setEntries(turns.map((turn, i) => ({ turn, track: tracks[i] })));
      })
      .catch(() => {
        if (!cancelled) setEntries([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  // Measure sheet height after render
  useEffect(() => {
    if (!open || !sheetRef.current || typeof ResizeObserver === "undefined") return;
    const updateHeight = () => {
      sheetHeightRef.current = sheetRef.current?.offsetHeight ?? 0;
    };
    updateHeight();
    const ro = new ResizeObserver(updateHeight);
    if (sheetRef.current) ro.observe(sheetRef.current);
    return () => ro.disconnect();
  }, [open, entries.length]);

  // Spring animation loop — reads/writes only refs to avoid dependency loop
  const runSpring = useCallback(() => {
    if (isAnimatingRef.current) return;
    isAnimatingRef.current = true;

    const animate = () => {
      const currentY = dragYRef.current;
      const currentV = velocityRef.current;
      const target = targetYRef.current;

      // Spring force: F = -k * x - c * v
      const displacement = target - currentY;
      const springForce = displacement * SPRING_STIFFNESS;
      const dampingForce = -currentV * SPRING_DAMPING;
      const acceleration = (springForce + dampingForce) / MASS;

      const newV = currentV + acceleration * 0.016; // 60fps dt
      const newY = currentY + newV * 0.016;

      // Check if settled (near target and low velocity)
      const settled = Math.abs(newY - target) < 0.5 && Math.abs(newV) < 0.5;

      if (settled) {
        dragYRef.current = target;
        velocityRef.current = 0;
        isAnimatingRef.current = false;
        setDragY(target);
        return;
      }

      dragYRef.current = newY;
      velocityRef.current = newV;
      setDragY(newY);
      animFrameRef.current = requestAnimationFrame(animate);
    };

    animate();
  }, []); // intentionally empty — uses only refs, never stale

  // Start spring to target
  const springTo = useCallback((target: number) => {
    targetYRef.current = target;
    runSpring();
  }, [runSpring]);

  // Close is decoupled from the spring settle: start the slide-out animation
  // AND fire onClose via a fallback timer so closing never depends on the
  // requestAnimationFrame loop converging (which could stall / never fire).
  // translateY is positive toward the bottom here (matching drag), so we move
  // the sheet past the screen's bottom edge — it slides DOWN off-screen.
  // When the slide-out finishes we fully detach/zero the sheet so the overlay
  // hits `if (!open && dragY === 0) return null` and unmounts. Otherwise the
  // full-screen .lyra-mobile-history container (with its transparent backdrop)
  // lingers and swallows every tap — making the history button unclickable
  // after closing once.
  const closeSheet = useCallback(() => {
    if (closePendingRef.current) return;
    closePendingRef.current = true;
    springTo(sheetHeightRef.current + EXIT_MARGIN);
    closeTimerRef.current = window.setTimeout(() => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = undefined;
      isAnimatingRef.current = false;
      dragYRef.current = 0;
      velocityRef.current = 0;
      targetYRef.current = 0;
      closePendingRef.current = false;
      setDragY(0);
      onCloseRef.current();
    }, CLOSE_ANIM_MS);
  }, [springTo]);

  // Global pointer move/up for drag
  useEffect(() => {
    if (!isDragging) return;
    const onMove = (e: PointerEvent) => {
      const delta = e.clientY - startYRef.current;
      if (delta > 0) {
        dragYRef.current = delta;
        setDragY(delta);
      }
    };
    const onUp = () => {
      setIsDragging(false);
      const threshold = sheetHeightRef.current * DRAG_THRESHOLD_RATIO;
      if (dragYRef.current > threshold) {
        closeSheet();
      } else {
        springTo(0);
      }
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [isDragging, springTo, closeSheet]);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if (!open) return;
    const target = e.target as HTMLElement;
    if (target.closest(".lyra-mobile-history__list") ||
        target.closest(".lyra-mobile-history__item") ||
        target.closest(".lyra-mobile-history__close")) return;
    startYRef.current = e.clientY;
    // Cancel any ongoing animation
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    isAnimatingRef.current = false;
    setIsDragging(true);
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
  }, [open]);

  const handleReplay = useCallback((entry: HistoryEntry) => {
    if (!entry.track) return;
    void orchestrator.onReplaySong(
      entry.track,
      entry.turn.agent_response.rationale,
      entry.turn.current_emotion,
    );
    closeSheet();
  }, [orchestrator, closeSheet]);

  // Keep the latest onClose in a ref so deferred close calls never go stale.
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  // Reset drag state when opening. On close we deliberately do NOT touch dragY:
  // the sheet is mid slide-out and resetting here would yank it back to the top
  // mid-animation. We just leave it parked off-screen and reset on next open.
  useEffect(() => {
    if (!open) return;
    setDragY(0);
    setIsDragging(false);
    velocityRef.current = 0;
    dragYRef.current = 0;
    targetYRef.current = 0;
    closePendingRef.current = false;
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = undefined;
    }
  }, [open]);

  // Cleanup animation on unmount
  useEffect(() => {
    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    };
  }, []);

  const handleCardClick = useCallback((entry: HistoryEntry) => {
    handleReplay(entry);
  }, [handleReplay]);

  const sheetTransform = `translateY(${dragY}px)`;

  if (!open && dragY === 0) return null;

  return (
    <div
      className="lyra-mobile-history"
      role="dialog"
      aria-label="播放历史"
      data-testid="history-overlay"
      onPointerDown={handlePointerDown}
    >
      <div
        className="lyra-mobile-history__backdrop"
        data-testid="history-backdrop"
        onClick={() => !isDragging && closeSheet()}
      />
      <div
        ref={sheetRef}
        className="lyra-mobile-history__sheet"
        style={{ transform: sheetTransform }}
      >
        <div className="lyra-mobile-history__grabber" aria-hidden />
        <div className="lyra-mobile-history__head">
          <h2 className="lyra-mobile-history__title">播放历史</h2>
          <button
            type="button"
            className="lyra-mobile-history__close"
            onClick={closeSheet}
            data-testid="history-close"
            aria-label="关闭"
          >
            ✕
          </button>
        </div>

        {loading && (
          <p className="lyra-mobile-history__hint" data-testid="history-loading">
            正在翻阅记忆…
          </p>
        )}

        {!loading && entries.length === 0 && (
          <p className="lyra-mobile-history__hint" data-testid="history-empty">
            还没有播放记录。和我说句话，我替你挑一首。
          </p>
        )}

        <ul className="lyra-mobile-history__list">
          {entries.map((entry, i) => (
            <li
              key={entry.turn.id}
              className="lyra-mobile-history__item"
              onClick={() => handleCardClick(entry)}
              data-testid={`history-item-${i}`}
            >
              <span
                className="lyra-mobile-history__mood"
                style={{ background: getMoodColor(entry.turn.current_emotion.pad) }}
                aria-hidden
              />
              <div className="lyra-mobile-history__body">
                <div className="lyra-mobile-history__song">
                  <span className="lyra-mobile-history__title">
                    {entry.track ? songDisplayTitle(entry.track) : "（歌曲已不在库中）"}
                  </span>
                  {entry.track && entry.track.artist && (
                    <span className="lyra-mobile-history__artist">
                      {songDisplayArtist(entry.track)}
                    </span>
                  )}
                </div>
                <p className="lyra-mobile-history__note">
                  {entry.turn.agent_response.rationale.trim() || "…"}
                </p>
                <span className="lyra-mobile-history__time">
                  {formatRelativeTime(entry.turn.timestamp)}
                </span>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function getMoodColor(pad: { p: number; a: number; d: number }): string {
  const h = 240 + (pad.p + 1) * 105; // 135~345
  const s = Math.max(30, 32 + pad.a * 36);
  const l = Math.max(38, Math.min(70, 82 + pad.d * 8));
  return `hsl(${h}, ${s}%, ${l}%)`;
}

export function formatRelativeTime(ts: number, now: number = Date.now()): string {
  const min = Math.floor(Math.max(0, now - ts) / 60_000);
  if (min < 1) return "刚刚";
  if (min < 60) return `${min} 分钟前`;
  const hour = Math.floor(min / 60);
  if (hour < 24) return `${hour} 小时前`;
  const day = Math.floor(hour / 24);
  if (day === 1) return "昨天";
  if (day < 30) return `${day} 天前`;
  const d = new Date(ts);
  return `${d.getMonth() + 1}月${d.getDate()}日`;
}