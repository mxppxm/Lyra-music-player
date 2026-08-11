import { BreathingGlow } from "./BreathingGlow";
import {
  IconFavorite,
  IconHistory,
  IconNext,
  IconPause,
  IconPlay,
  IconPrev,
} from "./icons";
import { lightTap } from "./immersiveStatusBar";

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
  /** Toggle favorite for the currently playing track. */
  onFavorite?: () => void;
  /** Whether the current track is favorited. */
  favorited?: boolean;
};

function tapThen(fn: () => void) {
  lightTap();
  fn();
}

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
  onFavorite,
  favorited = false,
}: PlayerControlsProps) {
  return (
    <div className="lyra-mobile-player-controls" data-testid="player-controls">
      <div className="lyra-mobile-player-controls__center">
        <button
          type="button"
          className="lyra-mobile-control-btn lyra-mobile-control-btn--ghost"
          disabled={!canGoPrevious || !onPrevious}
          onClick={() => {
            if (!onPrevious) return;
            tapThen(onPrevious);
          }}
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
          onClick={() => tapThen(onTogglePlay)}
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
          onClick={() => tapThen(onSkip)}
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
          onClick={() => tapThen(onHistory)}
          title="播放历史"
          aria-label="播放历史"
          data-testid="history-open-btn"
        >
          <IconHistory />
        </button>
      )}

      {onFavorite && (
        <button
          type="button"
          className={[
            "lyra-mobile-player-controls__favorite",
            favorited ? "lyra-mobile-player-controls__favorite--on" : "",
          ]
            .filter(Boolean)
            .join(" ")}
          disabled={!canControl}
          onClick={(e) => {
            e.stopPropagation();
            e.preventDefault();
            tapThen(onFavorite);
          }}
          onPointerDown={(e) => e.stopPropagation()}
          title={favorited ? "取消收藏" : "收藏"}
          aria-label={favorited ? "取消收藏" : "收藏"}
          aria-pressed={favorited}
          data-testid="favorite-btn"
        >
          <IconFavorite filled={favorited} />
        </button>
      )}
    </div>
  );
}
