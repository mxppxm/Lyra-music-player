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

  // Rule 1: Silent full listen (priority 2)
  // Conditions: silence_positive + completed + listen_duration_ms >= 0.9 * song.duration_ms
  if (
    silence_positive &&
    behavioral.completed &&
    song.duration_ms &&
    behavioral.listen_duration_ms >= 0.9 * song.duration_ms
  ) {
    const narrative = `《${song.title}》完整听完，沉默正向。`;
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
  if (behavioral.repeated >= 2) {
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
