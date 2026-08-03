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
    .replace(/\s+/g, " ")
    .trim();
}

/** 《下雨天》→ 下雨天 */
function unwrapBookTitle(s: string): { song?: string; rest: string } {
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
    const artist = artistBook[1].replace(/百万豪装.*$/u, "").trim();
    const songTitle = artistBook[2].trim();
    if (songTitle && artist && !isUploaderLike(artist, uploader)) {
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
    const artist = rest.replace(/^[-—–·]\s*/, "").trim();
    return {
      songTitle: bookSong,
      artist: isUploaderLike(artist, uploader) ? "" : artist,
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
