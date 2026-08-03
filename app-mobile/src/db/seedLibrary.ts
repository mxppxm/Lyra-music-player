import type { LibraryTrack } from "@lyra/core";
import * as libraryRepo from "@lyra/core/db/repo/libraryRepo";

/** Import bundled library-seed.json when the on-device library is missing or barely populated. */
export async function seedMobileLibraryIfNeeded(): Promise<number> {
  const existing = await libraryRepo.listAll();
  if (existing.length >= 50) return 0;

  const res = await fetch("/library-seed.json");
  if (!res.ok) {
    console.warn("[lyra-ios] library-seed.json missing:", res.status);
    return 0;
  }

  const tracks = (await res.json()) as LibraryTrack[];
  if (!Array.isArray(tracks) || tracks.length === 0) return 0;

  const n = await libraryRepo.batchInsertTracks(tracks);
  console.log(`[lyra-ios] seeded ${n} library tracks from bundle`);
  return n;
}
