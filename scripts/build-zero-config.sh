#!/usr/bin/env bash
# Build a zero-config Lyra DMG: keys + precomputed library baked in.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
APP="$ROOT/app"
ENV_FILE="${LYRA_ENV_FILE:-$APP/.env.production.local}"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing $ENV_FILE"
  echo "Copy app/.env.production.example → app/.env.production.local and fill API keys."
  exit 1
fi

# Vite reads .env.production.local automatically during `tauri build`.
export PATH="${HOME}/.rustup/toolchains/stable-aarch64-apple-darwin/bin:${PATH:-}"

cd "$APP"
pnpm tauri build

echo ""
echo "Done. Install:"
echo "  $APP/src-tauri/target/release/bundle/dmg/"*.dmg
