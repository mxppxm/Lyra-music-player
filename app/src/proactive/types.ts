import type { SalientMoment } from "../memory/types";

export type ProactiveKind = "morning" | "care" | "anniversary" | "share" | "rhythm";

export type ProactiveIntent = {
  id: string;           // uuid
  createdAt: number;    // epoch ms
  validUntil: number;   // epoch ms (default createdAt + 30 min)
  kind: ProactiveKind;
  urgency: number;      // 0..1
  hint: string;         // human-readable trigger reason (for logs)
  targetProfile?: string; // free-text for LibraryAgent pre-filter
  seed?: {              // if this intent came from a dream_seed
    reflectDreamISO: string;
    songHint?: string;
  };
};

export type SkipReason =
  | "daily_limit"
  | "kind_budget"
  | "cooldown"
  | "focus_or_sleep"
  | "sulk"
  | "playing_other";

export type PolitenessState = {
  todayProactiveCount: number;
  todayKindCount: Partial<Record<ProactiveKind, number>>;
  lastKindFireAt: Partial<Record<ProactiveKind, number>>;
  sulkUntil: number | null;
  isFocusOrSleep: () => boolean;
  isPlayingOtherSource: () => boolean;
};

export type DreamSeed = {
  kind: ProactiveKind;
  hint?: string;
  createdISO: string;
};

export type RuleContext = {
  now: Date;
  lastAppOpenAt: number | null;
  todayFirstOpen: boolean;
  sharedMemories: SalientMoment[];
  dreamSeeds: DreamSeed[];
  todayKindCount: Partial<Record<ProactiveKind, number>>;
};
