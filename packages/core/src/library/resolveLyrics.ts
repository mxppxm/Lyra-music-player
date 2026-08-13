import type { DialogueTurn } from "../types";
import { looksLikePartialLyrics } from "../agents/LyricsAgent";

export type ResolveLyricsDeps = {
  turn: DialogueTurn;
  title: string;
  artist?: string;
  listRecentTurns: (limit: number) => Promise<DialogueTurn[]>;
  updateTurn: (t: DialogueTurn) => Promise<void>;
  fetchLyrics: (input: {
    title: string;
    artist?: string;
    enableThinking?: boolean;
  }) => Promise<string>;
  /** How many recent turns to scan for a same-song cache hit. */
  historyLimit?: number;
  /** Skip all caches and re-fetch from LLM, overwriting the turn. */
  force?: boolean;
};

function withLyrics(turn: DialogueTurn, lyrics: string): DialogueTurn {
  return {
    ...turn,
    agent_response: {
      ...turn.agent_response,
      lyrics,
    },
  };
}

function usableCachedLyrics(raw: string | undefined): string | null {
  const lyrics = raw?.trim();
  if (!lyrics) return null;
  if (looksLikePartialLyrics(lyrics)) return null;
  return lyrics;
}

/**
 * Resolve lyrics for the playing turn: current → history same song_id → LLM.
 * Persists onto the current turn when copying from history or fetching.
 * Chorus-only / truncated cache entries are ignored so we re-fetch full lyrics.
 * Pass `force: true` to always hit the LLM and overwrite.
 */
export async function resolveAndPersistLyrics(
  deps: ResolveLyricsDeps,
): Promise<string> {
  if (!deps.force) {
    const existing = usableCachedLyrics(deps.turn.agent_response.lyrics);
    if (existing) return existing;

    const songId = deps.turn.agent_response.song_id;
    const recent = await deps.listRecentTurns(deps.historyLimit ?? 80);
    const cached = recent.find(
      (t) =>
        t.id !== deps.turn.id &&
        t.agent_response.song_id === songId &&
        usableCachedLyrics(t.agent_response.lyrics) !== null,
    );
    const fromHistory = usableCachedLyrics(cached?.agent_response.lyrics);
    if (fromHistory) {
      await deps.updateTurn(withLyrics(deps.turn, fromHistory));
      return fromHistory;
    }
  }

  const lyrics = (
    await deps.fetchLyrics({
      title: deps.title,
      artist: deps.artist,
      enableThinking: Boolean(deps.force),
    })
  ).trim();
  if (!lyrics) throw new Error("empty lyrics");
  await deps.updateTurn(withLyrics(deps.turn, lyrics));
  return lyrics;
}
