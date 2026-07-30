import type { BilibiliTrack } from "../bilibili/api";
import type { LibraryTrack } from "../types";
import { parseTrackIdentity } from "./parseTrackIdentity";

/** Map Bilibili API row → library track with parsed song/artist identity. */
export function bilibiliTrackToLibrary(
  t: BilibiliTrack,
  featureCache: Record<string, unknown> = {},
): LibraryTrack {
  const identity = parseTrackIdentity(t.title, {
    uploader: t.author,
    tag: t.tag,
  });

  return {
    id: `bili:${t.bvid}`,
    title: identity.songTitle,
    artist: identity.artist || undefined,
    album: undefined,
    path: `bili:__pending__:${t.bvid}`,
    duration_ms: t.duration_ms,
    origin: "web" as const,
    added_at: Date.now(),
    metadata: {
      bvid: t.bvid,
      aid: t.aid,
      tag: t.tag,
      cover: t.cover,
      play_count: t.play_count,
      raw_title: identity.rawTitle,
      uploader: identity.uploader,
      is_studio_cover: identity.isStudioCover,
      ...(featureCache[t.bvid] ? { audio_features: featureCache[t.bvid] } : {}),
    },
  };
}
