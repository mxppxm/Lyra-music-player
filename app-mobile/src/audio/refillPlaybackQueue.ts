import type { Orchestrator, PrefetchNextResult } from "@lyra/core";
import { LyraAudio } from "@lyra/platform-ios";
import { normalizeCoverUrl } from "../home/CoverBackground";

/** How many upcoming tracks native should hold while locked. */
export const TARGET_QUEUE_DEPTH = 5;
let queueGeneration = 0;

/** Cancel refill batches captured before an explicit native queue reset. */
export function invalidatePlaybackQueueRefills(): void {
  queueGeneration += 1;
}

function toNativeTrack(track: PrefetchNextResult) {
  return {
    url: track.url,
    songId: track.songId,
    title: track.title,
    artist: track.artist,
    durationMs: track.durationMs,
    coverUrl: normalizeCoverUrl(track.coverUrl ?? null) ?? undefined,
  };
}

/** Top up the native queue — pick + resolve only, playback stays on native. */
export async function refillPlaybackQueue(
  orchestrator: Orchestrator,
): Promise<number> {
  const generation = queueGeneration;
  const { count, songIds } = await LyraAudio.getPlaybackQueueInfo();
  const need = TARGET_QUEUE_DEPTH - count;
  if (need <= 0) return 0;

  const tracks = await orchestrator.prefetchMore(need, songIds);
  if (tracks.length === 0) return 0;
  if (generation !== queueGeneration) return 0;

  await LyraAudio.appendToPlaybackQueue({
    tracks: tracks.map(toNativeTrack),
  });
  console.log(
    `[lyra-ios] queue refilled +${tracks.length} (target ${TARGET_QUEUE_DEPTH})`,
  );
  return tracks.length;
}
