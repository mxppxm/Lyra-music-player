import type { CurrentEmotion, LibraryTrack, SoulState } from "../types";
import type { MusicProfile } from "../types/musicProfile";
import type { Fact } from "../memory/types";
import type { RecommendationContext } from "../recommendation";

export type TargetProfile = string;

export type ChosenSong = {
  song_id: string;
  rationale: string;
  target_profile: TargetProfile;
  needed_shift: "接住" | "点燃" | "陪着" | "打断";
};

export type CompanionInput = {
  userUtterance: string;
  currentEmotion: CurrentEmotion;
  soul: SoulState;
  candidates: (Pick<LibraryTrack, "id" | "path" | "title" | "artist" | "album" | "duration_ms" | "metadata"> & {
    musicProfile?: MusicProfile | null;
    /** Real FFT-extracted PAD from audio analysis (takes priority over LLM pad_estimate) */
    audioPad?: { p: number; a: number; d: number };
  })[];
  livingPortrait?: string;
  topFacts?: Fact[];
  /** Play-history context — recent songs, fatigue, feedback. Drives diversity mandate. */
  recommendation?: RecommendationContext;
};

export type EmotionInput = {
  userUtterance: string;
};
