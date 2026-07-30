import type { LibraryTrack } from "../types";
import { MusicProfileAgent } from "../agents/MusicProfileAgent";
import { trackToProfileInput } from "../agents/buildProfileAnalyzeInput";
import * as libraryRepo from "../db/repo/libraryRepo";
import * as musicProfileRepo from "../db/repo/musicProfileRepo";
import { profileNeedsRefresh } from "../types/musicProfile";

export type BackgroundProfilingOpts = {
  /** Tracks to profile first (e.g. current turn candidates). */
  priorityTrackIds?: readonly string[];
  /** Max profiles to generate this batch. */
  limit?: number;
};

let inFlight = false;

/**
 * Fire-and-forget: fill missing / stale MusicProfiles for library tracks.
 * Prioritizes `priorityTrackIds`, then any track needing refresh.
 */
export function scheduleBackgroundProfiling(opts: BackgroundProfilingOpts = {}): void {
  if (inFlight) return;
  inFlight = true;
  void runBackgroundProfiling(opts).finally(() => {
    inFlight = false;
  });
}

export async function runBackgroundProfiling(
  opts: BackgroundProfilingOpts = {},
): Promise<number> {
  const limit = opts.limit ?? 8;
  if (limit <= 0) return 0;

  const all = await libraryRepo.listAll();
  if (all.length === 0) return 0;

  const byId = new Map(all.map((t) => [t.id, t]));
  const ordered: LibraryTrack[] = [];

  for (const id of opts.priorityTrackIds ?? []) {
    const t = byId.get(id);
    if (t) ordered.push(t);
  }

  const rest = shuffle(all.filter((t) => !ordered.some((o) => o.id === t.id)));
  ordered.push(...rest);

  const profileMap = await musicProfileRepo.getBatch(ordered.map((t) => t.id));
  const need = ordered.filter((t) => profileNeedsRefresh(profileMap.get(t.id)));

  if (need.length === 0) return 0;

  const agent = new MusicProfileAgent();
  let done = 0;

  for (const track of need.slice(0, limit)) {
    try {
      const input = trackToProfileInput(track);
      const profile = await agent.analyze(input);
      if (profile) {
        profile.track_id = track.id;
        await musicProfileRepo.upsert(profile);
        done++;
      }
    } catch (e) {
      console.warn(`[lyra] background profile failed ${track.id}:`, e);
    }
  }

  if (done > 0) {
    console.log(`[lyra] background profiles: +${done} (queued ${need.length}, cap ${limit})`);
  }

  return done;
}

function shuffle<T>(arr: T[]): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
