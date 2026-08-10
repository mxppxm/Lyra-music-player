import { BreathingGlow } from "./BreathingGlow";
import {
  IconHistory,
  IconNext,
  IconPause,
  IconPlay,
  IconPrev,
  IconShare,
} from "./icons";

export type PlayerControlsProps = {
  canControl: boolean;
  paused: boolean;
  /** Stream is still loading / buffering — nothing audible yet. */
  loading?: boolean;
  /** When false, next is disabled (e.g. thinking / selecting next). */
  canSkip?: boolean;
  /** Session stack has a previous song. */
  canGoPrevious?: boolean;
  onTogglePlay: () => void;
  onSkip: () => void;
  onPrevious?: () => void;
  onHistory?: () => void;
  /** Share the currently playing track (system share sheet, incl. WeChat). */
  onShare?: () => void;
};

export function PlayerControls({
  canControl,
  paused,
  loading = false,
  canSkip = true,
  canGoPrevious = false,
  onTogglePlay,
  onSkip,
  onPrevious,
  onHistory,
  onShare,
}: PlayerControlsProps) {
  return (
    <div className="lyra-mobile-player-controls" data-testid="player-controls">
      <div className="lyra-mobile-player-controls__center">
        <button
          type="button"
          className="lyra-mobile-control-btn lyra-mobile-control-btn--ghost"
          disabled={!canGoPrevious || !onPrevious}
          onClick={onPrevious}
          title="上一首"
          aria-label="上一首"
          data-testid="prev-btn"
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
          disabled={!canControl || !canSkip}
          onClick={onSkip}
          title="下一首"
          aria-label="下一首"
          data-testid="skip-btn"
        >
          <IconNext />
        </button>
      </div>

      {onShare && (
        <button
          type="button"
          className="lyra-mobile-player-controls__share"
          disabled={!canControl}
          onClick={onShare}
          title="分享到微信"
          aria-label="分享到微信"
          data-testid="share-btn"
        >
          <IconShare />
        </button>
      )}

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
