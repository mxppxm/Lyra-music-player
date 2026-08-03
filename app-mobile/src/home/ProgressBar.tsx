import { useCallback, useRef, useState } from "react";

export type ProgressBarProps = {
  /** 0–1 */
  progress: number;
  label?: string;
  durationMs?: number;
  onSeek?: (positionMs: number) => void;
};

function fmtMs(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}:${sec.toString().padStart(2, "0")}`;
}

export function ProgressBar({
  progress,
  label,
  durationMs = 0,
  onSeek,
}: ProgressBarProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  const [dragProgress, setDragProgress] = useState<number | null>(null);

  const canSeek = Boolean(onSeek && durationMs > 0);
  const shown = dragProgress ?? progress;
  const pct = Math.min(100, Math.max(0, shown * 100));

  const progressAt = useCallback((clientX: number) => {
    const track = trackRef.current;
    if (!track) return 0;
    const rect = track.getBoundingClientRect();
    if (rect.width <= 0) return 0;
    return Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
  }, []);

  const commitSeek = useCallback(
    (p: number) => {
      if (!canSeek) return;
      onSeek!(Math.round(p * durationMs));
    },
    [canSeek, durationMs, onSeek],
  );

  const onPointerDown = (e: React.PointerEvent) => {
    if (!canSeek) return;
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    setDragging(true);
    setDragProgress(progressAt(e.clientX));
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragging || !canSeek) return;
    e.stopPropagation();
    setDragProgress(progressAt(e.clientX));
  };

  const finishDrag = (e: React.PointerEvent) => {
    if (!dragging) return;
    e.stopPropagation();
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    const p = dragProgress ?? progressAt(e.clientX);
    setDragging(false);
    setDragProgress(null);
    commitSeek(p);
  };

  return (
    <div className="lyra-mobile-progress" data-testid="progress-bar">
      <div
        ref={trackRef}
        className={[
          "lyra-mobile-progress__hit",
          canSeek ? "lyra-mobile-progress__hit--seekable" : "",
          dragging ? "lyra-mobile-progress__hit--dragging" : "",
        ]
          .filter(Boolean)
          .join(" ")}
        role={canSeek ? "slider" : undefined}
        aria-valuemin={canSeek ? 0 : undefined}
        aria-valuemax={canSeek ? 100 : undefined}
        aria-valuenow={canSeek ? Math.round(pct) : undefined}
        aria-label={canSeek ? "播放进度" : undefined}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={finishDrag}
        onPointerCancel={finishDrag}
      >
        <div className="lyra-mobile-progress__track" aria-hidden>
          <div
            className="lyra-mobile-progress__fill"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
      {label ? (
        <span className="lyra-mobile-progress__label">{label}</span>
      ) : null}
    </div>
  );
}

export function progressLabel(elapsedMs: number, durationMs: number): string {
  if (durationMs <= 0) return "";
  return `${fmtMs(elapsedMs)} / ${fmtMs(durationMs)}`;
}
