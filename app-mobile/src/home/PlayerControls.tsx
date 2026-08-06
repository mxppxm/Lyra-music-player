import { BreathingGlow } from "./BreathingGlow";
import { IconHistory, IconNext, IconPause, IconPlay, IconPrev } from "./icons";

export type PlayerControlsProps = {
  canControl: boolean;
  paused: boolean;
  /** Stream is still loading / buffering — nothing audible yet. */
  loading?: boolean;
  onTogglePlay: () => void;
  onSkip: () => void;
  onHistory?: () => void;
};

export function PlayerControls({
  canControl,
  paused,
  loading = false,
  onTogglePlay,
  onSkip,
  onHistory,
}: PlayerControlsProps) {
  return (
    <div className="lyra-mobile-player-controls" data-testid="player-controls">
      <div className="lyra-mobile-player-controls__center">
        <button
          type="button"
          className="lyra-mobile-control-btn lyra-mobile-control-btn--ghost"
          disabled
          title="上一首"
          aria-label="上一首"
        >
          <IconPrev />
        </button>

        <button
          type="button"
          className="lyra-mobile-control-btn lyra-mobile-control-btn--primary"
          disabled={!canControl}
          onClick={onTogglePlay}
          title={loading ? "加载中" : canControl && !paused ? "暂停" : "播放"}
          aria-label={loading ? "加载中" : canControl && !paused ? "暂停" : "播放"}
          data-testid="play-pause-btn"
        >
          {loading ? (
            <BreathingGlow size="sm" tone="light" />
          ) : canControl && !paused ? (
            <IconPause />
          ) : (
            <IconPlay />
          )}
        </button>

        <button
          type="button"
          className="lyra-mobile-control-btn lyra-mobile-control-btn--ghost"
          disabled={!canControl}
          onClick={onSkip}
          title="下一首"
          aria-label="下一首"
          data-testid="skip-btn"
        >
          <IconNext />
        </button>
      </div>

      {onHistory && (
        <button
          type="button"
          className="lyra-mobile-player-controls__history"
          onClick={onHistory}
          title="播放历史"
          aria-label="播放历史"
          data-testid="history-open-btn"
        >
          <IconHistory />
        </button>
      )}
    </div>
  );
}
