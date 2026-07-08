import type { DialogueTurn } from "../../types";

export type DialogueTurnRow = {
  id: string;
  timestamp: number;
  user_utterance_json: string;
  agent_response_json: string;
  user_reaction_json: string;
  current_emotion_json: string;
  emotion_delta_json: string;
  turn_latency_ms?: number | null;
};

export function toRow(t: DialogueTurn): DialogueTurnRow {
  return {
    id: t.id,
    timestamp: t.timestamp,
    current_emotion_json: JSON.stringify(t.current_emotion),
    user_utterance_json: JSON.stringify(t.user_utterance),
    agent_response_json: JSON.stringify(t.agent_response),
    user_reaction_json: JSON.stringify(t.user_reaction),
    emotion_delta_json: JSON.stringify(t.emotion_delta),
  };
}

export function fromRow(r: DialogueTurnRow): DialogueTurn {
  const t: DialogueTurn = {
    id: r.id,
    timestamp: r.timestamp,
    current_emotion: JSON.parse(r.current_emotion_json),
    user_utterance: JSON.parse(r.user_utterance_json),
    agent_response: JSON.parse(r.agent_response_json),
    user_reaction: JSON.parse(r.user_reaction_json),
    emotion_delta: JSON.parse(r.emotion_delta_json),
  };
  // Only expose the column when the row actually carries a value — keeps
  // round-trips clean for existing turn samples (pre-Sprint 11) and lets
  // the UI treat "field absent" the same as "no latency recorded".
  if (r.turn_latency_ms != null) t.turn_latency_ms = r.turn_latency_ms;
  return t;
}
