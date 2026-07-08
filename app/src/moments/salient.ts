import type { DialogueTurn, LibraryTrack } from "../types";
import type { SalientMoment } from "../memory/types";

export type SalientContext = {
  turn: DialogueTurn;
  song: LibraryTrack;
  currentTags?: string[];
};

type RuleMatch = {
  priority: number;
  narrative: string;
};

export function detectSalientMoment(ctx: SalientContext): SalientMoment | null {
  const { turn, song, currentTags = [] } = ctx;
  const { user_reaction, timestamp } = turn;
  const { behavioral, verbal, silence_positive } = user_reaction;

  let match: RuleMatch | null = null;

  // Rule 1: Full listen (priority 2)
  // Loosened: was silence_positive + completed + >=0.9 duration.
  // Now: completed + >=0.7 duration. Silence adds a richer narrative.
  if (
    behavioral.completed &&
    song.duration_ms &&
    behavioral.listen_duration_ms >= 0.7 * song.duration_ms
  ) {
    const narrative = silence_positive
      ? `《${song.title}》完整听完，沉默正向。`
      : `《${song.title}》你完整听完了。`;
    match = { priority: 2, narrative };
  }

  // Rule 2: Explicit positive verbal (priority 1)
  if (verbal?.parsed_valence === "positive") {
    const narrative = `《${song.title}》你说：${verbal.content}`;
    if (!match || 1 > match.priority) {
      match = { priority: 1, narrative };
    }
  }

  // Rule 3: Repeated listen (priority 3 — highest)
  // Loosened: was repeated >= 2. Now any replay counts.
  if (behavioral.repeated >= 1) {
    const narrative = `《${song.title}》你重听了 ${behavioral.repeated + 1} 次。`;
    if (!match || 3 > match.priority) {
      match = { priority: 3, narrative };
    }
  }

  // Rule 4: Explicit rejection (priority 0 — lowest)
  if (behavioral.skipped && verbal?.parsed_valence === "negative") {
    const narrative = `《${song.title}》被你拒绝：${verbal.content}`;
    if (!match || 0 > match.priority) {
      match = { priority: 0, narrative };
    }
  }

  // Rule 5: Long attentive listen (priority 1)
  // >= 60s AND >= 50% of song, no skip, no completion.
  // Priority-1 tie with Rule 2 (explicit positive verbal): Rule 2 wins by
  // declaration order — explicit words beat inferred attention.
  if (
    !behavioral.completed &&
    !behavioral.skipped &&
    song.duration_ms &&
    behavioral.listen_duration_ms >= 60_000 &&
    behavioral.listen_duration_ms >= 0.5 * song.duration_ms
  ) {
    const narrative = `《${song.title}》你安静地听了一大半。`;
    if (!match || 1 > match.priority) {
      match = { priority: 1, narrative };
    }
  }

  // Return null if no rule fired
  if (!match) {
    return null;
  }

  // Construct SalientMoment
  return {
    timestampISO: new Date(timestamp).toISOString(),
    tags: currentTags,
    songTitle: song.title || "未知歌曲",
    narrative: match.narrative,
  };
}
