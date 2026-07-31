import { IconNext, IconPause, IconPlay, IconPrev } from "./icons";

export type PlayerControlsProps = {
  canControl: boolean;
  paused: boolean;
  onTogglePlay: () => void;
  onSkip: () => void;
};

export function PlayerControls({
  canControl,
  paused,
  onTogglePlay,
  onSkip,
}: PlayerControlsProps) {
  return (
    <div className="lyra-mobile-player-controls" data-testid="player-controls">
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
        title={canControl && !paused ? "暂停" : "播放"}
        aria-label={canControl && !paused ? "暂停" : "播放"}
        data-testid="play-pause-btn"
      >
        {canControl && !paused ? <IconPause /> : <IconPlay />}
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
  );
}
