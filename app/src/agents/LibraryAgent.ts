import type { LibraryTrack, PAD } from "../types";
import * as libraryRepo from "../db/repo/libraryRepo";
import type { TargetProfile } from "./types";

export type LibraryRepoLike = { listAll(): Promise<LibraryTrack[]> };

const DEFAULT_LIMIT = 30;

function tokenize(target: string): string[] {
  return target
    .toLowerCase()
    .split(/[\s,，。.！!?？:：;；\-—()（）\[\]"']+/u)
    .filter((s) => s.length > 1);
}

function keywordScore(track: LibraryTrack, tokens: string[]): number {
  const hay = [track.title, track.artist, track.album]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  let score = 0;
  for (const t of tokens) if (hay.includes(t)) score++;
  return score;
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export class LibraryAgent {
  private repo: LibraryRepoLike;
  constructor(opts: { repo?: LibraryRepoLike } = {}) {
    this.repo = opts.repo ?? { listAll: libraryRepo.listAll };
  }

  async prefilter(target: TargetProfile, _currentPAD: PAD, limit = DEFAULT_LIMIT): Promise<LibraryTrack[]> {
    const tokens = tokenize(target);
    const all = await this.repo.listAll();
    if (all.length === 0) return [];

    const scored = all.map((t) => ({ t, score: keywordScore(t, tokens) }));
    const anyMatch = scored.some((s) => s.score > 0);
    if (anyMatch) {
      scored.sort((a, b) => b.score - a.score);
      return scored.slice(0, limit).map((s) => s.t);
    }
    // No keyword hits — random sample
    return shuffle(all).slice(0, limit);
  }
}
