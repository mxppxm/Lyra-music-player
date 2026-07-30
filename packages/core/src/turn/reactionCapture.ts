import type { DialogueTurn, PAD } from "../types";

export type ReactionEvent =
  | { kind: "listen_progress"; ms: number }
  | { kind: "complete" }
  | { kind: "skip" }
  | { kind: "verbal_next"; content: string; parsed_valence: "positive" | "negative" | "neutral" };

/**
 * Fold a sequence of ReactionEvents into a DialogueTurn, returning a new
 * turn with updated user_reaction. Does not mutate the base turn.
 */
export function foldReactionEvents(
  base: DialogueTurn,
  events: ReactionEvent[],
): DialogueTurn {
  // Deep-copy the mutable parts
  const behavioral = { ...base.user_reaction.behavioral };
  let verbal = base.user_reaction.verbal;

  for (const ev of events) {
    switch (ev.kind) {
      case "listen_progress":
        behavioral.listen_duration_ms = Math.max(behavioral.listen_duration_ms, ev.ms);
        break;
      case "complete":
        behavioral.completed = true;
        break;
      case "skip":
        behavioral.skipped = true;
        break;
      case "verbal_next":
        verbal = { content: ev.content, parsed_valence: ev.parsed_valence };
        break;
    }
  }

  // silence_positive: completed and not skipped and no verbal
  const silence_positive = behavioral.completed && !behavioral.skipped && verbal === undefined;

  return {
    ...base,
    user_reaction: {
      behavioral,
      verbal,
      silence_positive,
    },
  };
}

/**
 * Compute the emotion delta as componentwise subtraction: post - pre.
 */
export function computeEmotionDelta(pre: PAD, post: PAD): PAD {
  return {
    p: post.p - pre.p,
    a: post.a - pre.a,
    d: post.d - pre.d,
  };
}
