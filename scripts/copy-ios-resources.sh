#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
MOBILE="$ROOT/app-mobile"

mkdir -p "$MOBILE/public"
cp "$ROOT/app/src-tauri/resources/lyra.db" "$MOBILE/public/lyra.db"
cp "$ROOT/app/src-tauri/resources/lyra-audio-features.json" \
   "$MOBILE/public/lyra-audio-features.json"
node "$ROOT/scripts/export-library-seed.mjs" \
  "$ROOT/app/src-tauri/resources/lyra.db" \
  "$MOBILE/public/library-seed.json"

echo "Copied bundled resources to app-mobile/public/"
