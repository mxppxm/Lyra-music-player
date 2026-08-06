// Pure helpers for building the share payload of the currently-playing track.
// Kept framework-free so the payload shape (title / bilibili link / blurb) is
// unit-testable without rendering the whole home view.
import type { LibraryTrack } from "@lyra/core";
import { songDisplayTitle, songDisplayArtist } from "@lyra/core/library/display";

export type SharePayload = {
  title: string;
  text: string;
  url?: string;
};

const DEFAULT_BLURB = "Lyra 刚给我挑了这首，一起听。";

/**
 * Build the Web Share API payload for a track:
 * - title: "Lyra | <song title>"
 * - text: "♫ <title> - <artist>\n<blurb>\n<bilibili url>" (blurb = rationale)
 * - url: https://www.bilibili.com/video/<bvid> when the track has a bvid
 */
export function buildSharePayload(
  track: LibraryTrack,
  rationale = "",
): SharePayload {
  const title = songDisplayTitle(track);
  const artist = songDisplayArtist(track);
  const bvid =
    typeof track.metadata?.bvid === "string" ? track.metadata.bvid : undefined;
  const url = bvid ? `https://www.bilibili.com/video/${bvid}` : undefined;
  const blurb = (rationale || "").trim() || DEFAULT_BLURB;
  const text = [
    `♫ ${title}${artist ? ` - ${artist}` : ""}`,
    blurb,
    url,
  ]
    .filter((part): part is string => Boolean(part))
    .join("\n");
  return { title: `Lyra | ${title}`, text, ...(url ? { url } : {}) };
}
