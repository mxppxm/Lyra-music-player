// types/dialogue.ts — DialogueTurn及相关（spec §2.1）
export type PAD = { p: number; a: number; d: number };

export type CurrentEmotion = {
  pad: PAD;
  labels: string[];
  confidence: number;
  source: "emotion-agent-inferred" | "user-declared" | "ring-signal";
  predicted_trajectory?: {
    horizon_min: number;
    predicted_pad: PAD;
  };
};

export type UserUtterance = {
  modality: "text" | "voice" | "proactive-open";
  content: string;
};

export type ProactiveKind =
  | "morning"
  | "care"
  | "anniversary"
  | "share"
  | "rhythm";

export type AgentResponse = {
  song_id: string;
  rationale: string;
  proactive_kind?: ProactiveKind;
  generation_meta?: {
    generator: string;
    prompt: string;
    duration_ms: number;
  };
};

export type UserReaction = {
  behavioral: {
    listen_duration_ms: number;
    completed: boolean;
    skipped: boolean;
    repeated: number;
    volume_delta: number;
  };
  verbal?: {
    content: string;
    parsed_valence: "positive" | "negative" | "neutral";
  };
  silence_positive: boolean;
};

export type DialogueTurn = {
  id: string;
  timestamp: number;
  current_emotion: CurrentEmotion;
  user_utterance: UserUtterance;
  agent_response: AgentResponse;
  user_reaction: UserReaction;
  emotion_delta: PAD;
};
