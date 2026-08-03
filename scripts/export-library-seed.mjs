#!/usr/bin/env node
/**
 * Export library_tracks from lyra.db → library-seed.json for iOS bundled import.
 * Usage: node scripts/export-library-seed.mjs <input.db> <output.json>
 */
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";

const [dbPath, outPath] = process.argv.slice(2);
if (!dbPath || !outPath) {
  console.error("Usage: export-library-seed.mjs <input.db> <output.json>");
  process.exit(1);
}

const raw = execFileSync(
  "sqlite3",
  [
    dbPath,
    "-json",
    "SELECT id, path, origin, title, artist, album, duration_ms, added_at, metadata_json FROM library_tracks ORDER BY added_at ASC",
  ],
  { encoding: "utf8" },
);

const rows = JSON.parse(raw || "[]");
const tracks = rows.map((r) => {
  const t = {
    id: r.id,
    path: r.path,
    origin: r.origin,
    added_at: r.added_at,
  };
  if (r.title != null) t.title = r.title;
  if (r.artist != null) t.artist = r.artist;
  if (r.album != null) t.album = r.album;
  if (r.duration_ms != null) t.duration_ms = r.duration_ms;
  if (r.metadata_json) t.metadata = JSON.parse(r.metadata_json);
  return t;
});

writeFileSync(outPath, JSON.stringify(tracks));
console.log(`Exported ${tracks.length} tracks → ${outPath}`);
