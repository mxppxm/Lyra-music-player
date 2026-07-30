import { parseTrackIdentity } from "../library/parseTrackIdentity";
import type { LibraryTrack } from "../types";

export type ProfileAnalyzeInput = {
  songTitle: string;
  artist?: string;
  rawTitle?: string;
  uploader?: string;
  isStudioCover?: boolean;
  bilibiliTag?: string;
  lyricsSnippet?: string;
};

/** Build MusicProfileAgent input from a raw video/library title row. */
export function buildProfileAnalyzeInput(opts: {
  title: string;
  artist?: string;
  tag?: string;
  lyricsSnippet?: string;
}): ProfileAnalyzeInput {
  const identity = parseTrackIdentity(opts.title, {
    uploader: opts.artist,
    tag: opts.tag,
  });

  return {
    songTitle: identity.songTitle,
    artist: identity.artist || undefined,
    rawTitle: identity.rawTitle,
    uploader: identity.uploader,
    isStudioCover: identity.isStudioCover,
    bilibiliTag: identity.bilibiliTag,
    lyricsSnippet: opts.lyricsSnippet,
  };
}

/** Format the user message sent to MusicProfileAgent. */
export function formatProfileAnalyzeBrief(input: ProfileAnalyzeInput): string {
  const lines = [
    `原曲歌名: ${input.songTitle}`,
    input.artist ? `原曲艺人: ${input.artist}` : "",
    input.rawTitle && input.rawTitle !== input.songTitle
      ? `B站视频标题: ${input.rawTitle}`
      : "",
    input.uploader ? `B站上传者: ${input.uploader}` : "",
    input.isStudioCover
      ? "说明: 这是翻录/重制频道上的版本，请分析「原曲」本身，不是按标题字面猜环境音。"
      : "",
    input.bilibiliTag ? `B站标签: ${input.bilibiliTag}` : "",
    input.lyricsSnippet ? `歌词片段: ${input.lyricsSnippet.slice(0, 400)}` : "",
  ];
  return lines.filter(Boolean).join("\n");
}

/** Build analyze input from a library track (local or Bilibili-synced). */
export function trackToProfileInput(track: LibraryTrack): ProfileAnalyzeInput {
  const meta = track.metadata as Record<string, unknown> | undefined;
  const rawTitle =
    (typeof meta?.raw_title === "string" && meta.raw_title) ||
    track.title ||
    "";
  const uploader =
    (typeof meta?.uploader === "string" && meta.uploader) ||
    (track.origin === "web" ? track.artist : undefined);
  const tag = typeof meta?.tag === "string" ? meta.tag : undefined;

  return buildProfileAnalyzeInput({
    title: rawTitle,
    artist: uploader,
    tag,
  });
}
