import type { LibraryTrack } from "../types";
import type { MusicProfile } from "../types/musicProfile";

/** Normalize for fuzzy artist matching (case, whitespace). */
export function normalizeArtistToken(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, "");
}

/** Quick-reject regex for common mood/scene words.
 *  This is a FAST PATH only — the real guard is the library artist check
 *  in updateArtistFilterFromUserInput. Words here skip the DB query entirely.
 *  Keep it small; don't try to enumerate every mood word. */
const MOOD_OR_SCENE =
  /有点|累|烦|开心|难过|失眠|低落|还好|随便|算了|放空|孤独|焦虑|平静|老样子|没事|丧|今天|最近|现在|下雨|安静|慢|快|燃|治愈|放松|emo/u;

const GENERIC_MUSIC_REQUEST =
  /^(?:来|放|播)(?:一|1)?[首个]?(?:歌|音乐)?$|^(?:来(?:点|首|个)?|随便(?:来|听)?)(?:歌|音乐)?$/u;

const COMMAND_PREFIX = /^(?:来|放|播|换|给|让|帮我)/u;

function isMoodOnlyUtterance(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  return MOOD_OR_SCENE.test(t) && !/的(?:歌|音乐)/u.test(t);
}

function normalizeArtistName(name: string): string {
  return name.trim().replace(/的(?:歌|音乐)?$/u, "");
}

/**
 * Parse an artist-only session intent from free-form user text.
 * Returns the artist name when the user is asking to hear that artist;
 * returns null for mood/scene utterances or generic "play something" requests.
 */
export function parseArtistIntent(utterance: string): string | null {
  const text = utterance.trim();
  if (!text) return null;

  const explicit =
    text.match(/(?:想听|来(?:点|首|个)|只听|播放)\s*([^\s,，。！!?？]+)/u) ??
    text.match(/(?:换)\s*([^\s,，。！!?？]+)/u);
  if (explicit?.[1]) return normalizeArtistName(explicit[1]);

  const possessive = text.match(/^([^\s的,，。！!?？]+?)的(?:歌|音乐)/u);
  if (possessive?.[1]) return normalizeArtistName(possessive[1]);

  if (GENERIC_MUSIC_REQUEST.test(text)) {
    return null;
  }

  const leading = text.match(/^([^\s,，。！!?？]{2,12})(?:\s+(.+))?$/u);
  if (leading?.[1]) {
    const name = leading[1].trim();
    const tail = leading[2]?.trim() ?? "";
    if (COMMAND_PREFIX.test(name) || GENERIC_MUSIC_REQUEST.test(name)) {
      return null;
    }
    if (!tail) {
      if (isMoodOnlyUtterance(name)) return null;
      return name;
    }
    // "梁博 安静点的" — leading token is the artist, tail is mood/scene.
    return name;
  }

  if (isMoodOnlyUtterance(text)) {
    return null;
  }

  return null;
}

/** Text fields searched when matching an artist filter against library rows. */
export function artistSearchHaystack(
  track: Pick<LibraryTrack, "title" | "artist" | "metadata">,
  profile: MusicProfile | null | undefined,
): string {
  const meta = track.metadata as Record<string, unknown> | undefined;
  const rawTitle = typeof meta?.raw_title === "string" ? meta.raw_title : "";
  const tag = typeof meta?.tag === "string" ? meta.tag : "";

  return [
    track.title,
    track.artist,
    rawTitle,
    tag,
    profile?.canonical_work,
  ]
    .filter((v): v is string => typeof v === "string" && v.trim().length > 0)
    .join(" ");
}

/** Whether a library track belongs to the active artist filter. */
export function trackMatchesArtist(
  track: Pick<LibraryTrack, "title" | "artist" | "metadata">,
  profile: MusicProfile | null | undefined,
  artistFilter: string,
): boolean {
  const needle = normalizeArtistToken(artistFilter);
  if (!needle) return true;

  const hay = normalizeArtistToken(artistSearchHaystack(track, profile));
  return hay.includes(needle);
}
