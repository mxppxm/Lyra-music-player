import type { CurrentEmotion } from "../../types";

export type EmotionSnapshotRow = {
  id: string;
  timestamp: number;
  turn_id: string | null;
  pad_p: number;
  pad_a: number;
  pad_d: number;
  labels_json: string;
  confidence: number;
  source: "emotion-agent-inferred" | "user-declared" | "ring-signal";
};

export function toRow(
  e: CurrentEmotion,
  meta: { id: string; timestamp: number; turnId?: string | null },
): EmotionSnapshotRow {
  return {
    id: meta.id,
    timestamp: meta.timestamp,
    turn_id: meta.turnId ?? null,
    pad_p: e.pad.p,
    pad_a: e.pad.a,
    pad_d: e.pad.d,
    labels_json: JSON.stringify(e.labels),
    confidence: e.confidence,
    source: e.source,
  };
}

export function fromRow(r: EmotionSnapshotRow): CurrentEmotion {
  return {
    pad: { p: r.pad_p, a: r.pad_a, d: r.pad_d },
    labels: JSON.parse(r.labels_json),
    confidence: r.confidence,
    source: r.source,
  };
}
