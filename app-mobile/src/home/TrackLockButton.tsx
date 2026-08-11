import { lightTap } from "./immersiveStatusBar";
import { IconTrackLock } from "./icons";

export type TrackLockButtonProps = {
  locked: boolean;
  onToggle: () => void;
  disabled?: boolean;
};

export function TrackLockButton({
  locked,
  onToggle,
  disabled = false,
}: TrackLockButtonProps) {
  return (
    <button
      type="button"
      className={[
        "lyra-mobile-track-lock",
        locked ? "lyra-mobile-track-lock--on" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      disabled={disabled}
      onClick={() => {
        lightTap();
        onToggle();
      }}
      title={locked ? "取消锁定播放" : "锁定播放"}
      aria-label={locked ? "取消锁定播放" : "锁定播放"}
      aria-pressed={locked}
      data-testid="track-lock-btn"
    >
      <IconTrackLock active={locked} />
    </button>
  );
}
