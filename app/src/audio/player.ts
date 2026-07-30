import { getLyraPlatform } from "@lyra/platform";

export async function playFile(
  path: string,
  durationMs?: number | null,
): Promise<number> {
  return getLyraPlatform().playFile(path, durationMs);
}

export async function stopPlayback(): Promise<void> {
  return getLyraPlatform().stop();
}

export async function pausePlayback(): Promise<void> {
  return getLyraPlatform().pause();
}

export async function resumePlayback(): Promise<void> {
  return getLyraPlatform().resume();
}

export async function isPlaying(): Promise<boolean> {
  return getLyraPlatform().isPlaying();
}

export async function getPlaybackPosition(): Promise<[number, number] | null> {
  return getLyraPlatform().getPosition();
}

export async function onSongComplete(
  cb: (playbackId: number) => void,
): Promise<() => void> {
  return getLyraPlatform().onComplete(cb);
}
