/**
 * Parse a Bilibili / repost video title into canonical song + artist.
 * Uploader (e.g. JLRS-LeoFM) is NOT the original artist.
 */

export type TrackIdentity = {
  /** Canonical song title for LLM lookup */
  songTitle: string;
  /** Original artist / band when parsed from title */
  artist: string;
  rawTitle: string;
  uploader?: string;
  /** Repost from 百万豪装录音棚-style channels */
  isStudioCover: boolean;
  bilibiliTag?: string;
};

const STUDIO_COVER_RE = /百万豪装|JLRS|LeoFM|录音棚/i;

/** Strip channel branding wrappers */
function stripNoise(s: string): string {
  return s
    .replace(/【[^】]*】/g, " ")
    .replace(/\[[^\]]*\]/g, " ")
    .replace(/\([^)]*录音棚[^)]*\)/gi, " ")
    // Fullwidth ｜ is decorative (after Hi-Res tags), not a channel cut.
    .replace(/｜/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Clean artist parsed from the rest of a 《title》… blob. */
function cleanParsedArtist(artist: string, uploader?: string): string {
  let a = artist.trim();
  // Drop lyric snippets embedded in the title.
  a = a.replace(/[“"].*?[”"]/gu, " ");
  a = a.replace(/百万豪装.*$/u, "");
  a = a.replace(/(?:大声听|试听|大屏歌词|无损音质|Hi-?Res).*$/giu, "");
  a = a.replace(/录音棚.*$/u, "");
  a = a.replace(/^[-—–·|]\s*/u, "").trim();
  a = a.replace(/\s+/g, " ").trim();
  // Still noisy ("王菲 频道废话") → keep a short leading name token.
  if (a.length > 16) {
    const first = a.split(/\s+/)[0] ?? "";
    if (first.length > 0 && first.length <= 12) a = first;
  }
  if (!a || isUploaderLike(a, uploader)) return "";
  return a;
}

/** 《下雨天》→ 下雨天 */
export function unwrapBookTitle(s: string): { song?: string; rest: string } {
  const m = s.match(/《([^》]+)》/);
  if (!m) return { rest: s };
  const rest = s.replace(/《[^》]+》/, " ").replace(/\s+/g, " ").trim();
  return { song: m[1].trim(), rest };
}

function splitOnDelimiters(s: string): string[] {
  return s
    .split(/\s*[-—–\/\\|·•]\s*/u)
    .map((p) => p.trim())
    .filter(Boolean);
}

/** Uploader handles that are never the original artist */
function isUploaderLike(s: string, uploader?: string): boolean {
  const lower = s.toLowerCase();
  if (/^(jlrs|leofm|百万)/i.test(s)) return true;
  if (uploader && lower === uploader.trim().toLowerCase()) return true;
  return false;
}

function pickSongAndArtist(parts: string[], uploader?: string): { songTitle: string; artist: string } {
  const cleaned = parts.filter((p) => !isUploaderLike(p, uploader));
  if (cleaned.length === 0) {
    return { songTitle: parts[0] ?? "", artist: "" };
  }
  if (cleaned.length === 1) {
    return { songTitle: cleaned[0], artist: "" };
  }
  // Bilibili reposts most often: "Song - Artist"
  const [first, second, ...rest] = cleaned;
  if (rest.length === 0) {
    return { songTitle: first, artist: second };
  }
  // 3+ parts: join middle as song, last as artist heuristic
  return { songTitle: cleaned.slice(0, -1).join(" "), artist: cleaned[cleaned.length - 1] };
}

/**
 * Best-effort parse of video title + uploader into canonical identity.
 */
export function parseTrackIdentity(
  rawTitle: string,
  opts: { uploader?: string; tag?: string } = {},
): TrackIdentity {
  const raw = rawTitle.trim();
  const uploader = opts.uploader?.trim();
  const isStudioCover =
    STUDIO_COVER_RE.test(raw) ||
    STUDIO_COVER_RE.test(uploader ?? "") ||
    STUDIO_COVER_RE.test(opts.tag ?? "");

  let working = stripNoise(raw);
  // Drop trailing | channel suffix
  working = working.split("|")[0].trim();

  const artistBook = working.match(/^([^《]+)《([^》]+)》/u);
  if (artistBook) {
    const artist = cleanParsedArtist(
      artistBook[1].replace(/百万豪装.*$/u, "").trim(),
      uploader,
    );
    const songTitle = artistBook[2].trim();
    if (songTitle && artist) {
      return {
        songTitle,
        artist,
        rawTitle: raw,
        uploader,
        isStudioCover,
        bilibiliTag: opts.tag,
      };
    }
  }

  const { song: bookSong, rest } = unwrapBookTitle(working);
  if (bookSong) {
    const artist = cleanParsedArtist(
      rest.replace(/^[-—–·]\s*/, "").trim(),
      uploader,
    );
    return {
      songTitle: bookSong,
      artist,
      rawTitle: raw,
      uploader,
      isStudioCover,
      bilibiliTag: opts.tag,
    };
  }

  const parts = splitOnDelimiters(working);
  const { songTitle, artist } = pickSongAndArtist(parts, uploader);

  return {
    songTitle: songTitle || working,
    artist,
    rawTitle: raw,
    uploader,
    isStudioCover,
    bilibiliTag: opts.tag,
  };
}
