export type ProgressBarProps = {
  /** 0–1 */
  progress: number;
  /** Total duration in human-readable form, e.g. "1:23 / 3:42" */
  label?: string;
};

/** Formats ms → "m:ss" */
function fmtMs(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}:${sec.toString().padStart(2, "0")}`;
}

export function ProgressBar({ progress, label }: ProgressBarProps) {
  const pct = Math.min(100, Math.max(0, progress * 100));

  return (
    <div className="lyra-progress" data-testid="progress-bar">
      <div className="lyra-progress__track" aria-hidden>
        <div className="lyra-progress__fill" style={{ width: `${pct}%` }} />
      </div>
      {label ? <span className="lyra-progress__label">{label}</span> : null}
    </div>
  );
}

export function progressLabel(elapsedMs: number, durationMs: number): string {
  if (durationMs <= 0) return "";
  return `${fmtMs(elapsedMs)} / ${fmtMs(durationMs)}`;
}
