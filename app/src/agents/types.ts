import type { CurrentEmotion, LibraryTrack, SoulState } from "../types";
import type { Fact } from "../memory/types";

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
  candidates: Pick<LibraryTrack, "id" | "title" | "artist" | "album" | "duration_ms">[];
  livingPortrait?: string;
  topFacts?: Fact[];
};

export type EmotionInput = {
  userUtterance: string;
};
