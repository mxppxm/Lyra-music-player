# Lyra

**English** · [简体中文](./README.zh-CN.md)

> **Between the things you say. 未成曲调先有情。**

A music agent that sings to you, remembers you, and grows on its own. **Not just another music player.**

Lyra is a music agent built as a **pnpm monorepo** with **React 19** + **TypeScript 5**. It ships as a **Tauri 2 desktop app** (`app/`) and an **iOS app** (`app-mobile/` via Capacitor), sharing one core (`@lyra/core`). It manages a personal music library, maintains emotional state, and uses LLM backends to recommend and generate song selections in real time — adapting to your mood and preferences as you interact with it.

## Repository Layout

```
Lyra-music-player/                  # pnpm monorepo (pnpm-workspace.yaml)
├── app/                            # Tauri 2 desktop application (React + Rust)
├── app-mobile/                     # iOS app (Capacitor 7 + React)
├── packages/
│   ├── core/                       # @lyra/core — shared agent brain (agents, memory, library)
│   ├── platform/                   # @lyra/platform — platform interface contracts
│   ├── platform-desktop/           # @lyra/platform-desktop — desktop impl
│   └── platform-ios/               # @lyra/platform-ios — iOS impl (native audio plugin)
├── website/                        # Official website (Vite)
├── docs/                           # Product docs, plans, specs, and design notes
│   ├── business-model.md
│   ├── emotional-computing.md
│   ├── feature-gaps.md
│   ├── music-licensing-policy.md
│   ├── promotion-strategy.md
│   └── superpowers/                # plans, specs, tuning notes
├── scripts/                        # shared build / resource scripts
├── start.sh                        # Convenience launcher — cd app && pnpm tauri dev
└── 需求.md                         # Original product requirements (Chinese)
```

The full desktop developer guide lives in [`app/README.md`](./app/README.md).

## Key Features

- **Personal Music Library** — SQLite-backed local storage with metadata and listening history; bigram + lyrics semantic search for fast Chinese song matching
- **Emotional Agent State** — Tracks mood (PAD model), listening patterns, and aesthetic preferences
- **Multi-LLM Support** — Pluggable model providers (Anthropic, DeepSeek, Zhipu, DouBao, OpenAI, local Ollama, SenseNova / SupaNet gateway), with automatic fallback and retry on transient errors
- **Song Recommender** — Recommends songs by time-of-day and mood via the `song-recommender` strategy
- **Native iOS Playback** — Custom `LyraAudioPlugin` (mediagrid → native) with a native playback queue for long background listening, lock screen & Dynamic Island controls
- **Immersive Player** — One-tap Lyra start, immersive chrome that persists across song switches, emotion-glow backdrop, animated motion (FLIP dock, crossfades, AnimatedMount overlays)
- **ShanShui Home** — Ink-wash canvas + photographic background layer set the tone of the room
- **Weekly Letter** — Lyra writes you a first-person weekly reflection every Sunday
- **System Integration** — Native keychain via `keyring`; file dialogs and URIs via Tauri plugins (desktop); on-device debug log panel for real-phone troubleshooting (iOS)

## Tech Stack

### Shared (`packages/`)
- **@lyra/core** — platform-agnostic agent brain: agents, memory, library, LLM call-sites
- **@lyra/platform** + **@lyra/platform-desktop** + **@lyra/platform-ios** — interface contracts and per-platform implementations

### Desktop (`app/`)
- **React 19** + **TypeScript 5**
- **Vite 7** for bundling and dev server
- **Vitest 1.6** + **Testing Library** for unit/component tests
- **@tauri-apps/api** for IPC to the backend

### iOS (`app-mobile/`)
- **Capacitor 7** (iOS) with `@capacitor-community/sqlite`, filesystem, preferences
- **Custom `LyraAudioPlugin`** — native audio playback queue for background listening & lock-screen controls
- Shares `@lyra/core` UI components (MobileHomeView) via workspace deps

### Backend (Rust, desktop)
- **Tauri 2** desktop framework
- **SQLite** via `tauri-plugin-sql` for persistent storage
- **rodio** for audio playback (symphonia backend)
- **keyring** for secure credential storage (Apple native)

### Tooling
- **pnpm 10.27** package manager + workspaces
- **@tauri-apps/cli** / **@capacitor/cli** for building and packaging

## Getting Started

### Prerequisites

- **Node.js** 18+ with **pnpm 10.27**
- **Rust 1.70+** (for the Tauri desktop backend)
- **Xcode Command Line Tools** (macOS) — also needed for the iOS app: **Xcode 15+** and `@capacitor/cli`

### Quick Start

```bash
# Clone
git clone git@github.com:daoyuly/Lyra-music-player.git
cd Lyra-music-player

# Install all workspace deps from the monorepo root
pnpm install

# Run the desktop app in dev mode
sh start.sh
# — equivalent to:
#   cd app && pnpm tauri dev
```

### Common Commands (from `app/`)

```bash
pnpm tauri dev       # Run the desktop app with hot reload
pnpm typecheck       # TypeScript check
pnpm test            # Run all tests once
pnpm test:watch      # Vitest watch mode
pnpm build           # Vite production build
pnpm tauri build     # Package a distributable binary
```

### iOS (`app-mobile/`)

```bash
cd app-mobile
pnpm install
pnpm build && pnpm cap:sync    # bundle JS and sync the native iOS project
# then open / build in Xcode: pnpm cap:open
```

See the [Mobile Debug Log Panel](#mobile-debug-log-panel-app-mobile) section below for running the on-device debug console.

## Persistence & Configuration

- **SQLite database** — `~/Library/Application Support/com.daoyu.lyra/lyra.db`
- **Keychain** — API keys and secrets stored via the macOS native keychain (`keyring` crate)
- **Bundle ID** — `com.daoyu.lyra`

## Commit Conventions

All commits follow conventional commits with the `lyra` scope:

```
feat(lyra):     new feature
fix(lyra):      bug fix
docs(lyra):     documentation
refactor(lyra): refactor with no behavior change
test(lyra):     tests
chore(lyra):    build, dependencies, tooling
```

## Contributing

1. Branch off `main`: `git checkout -b feat/lyra-my-feature`
2. Make changes with proper commit scope
3. Verify: `pnpm typecheck && pnpm test`
4. Open a pull request

## Documentation

- [App developer guide](./app/README.md) — desktop setup, project structure, IPC, and internals
- [Mobile Debug Log Panel](#mobile-debug-log-panel-app-mobile) — on-device debug console for `app-mobile`
- [Business model](./docs/business-model.md)
- [Emotional computing](./docs/emotional-computing.md)
- [Feature gaps](./docs/feature-gaps.md)
- [Music licensing policy](./docs/music-licensing-policy.md)
- [Promotion strategy](./docs/promotion-strategy.md)
- [Design specs & plans](./docs/superpowers/)

## License

Proprietary — all rights reserved unless a top-level LICENSE file states otherwise.

## Notes for Maintainers

- **Agent personality**: Lyra is a music *agent* — not a player, not a recommender tool, but a conversational entity that learns and grows through dialogue. Design decisions reflect this agency model.
- **Shared brain**: `packages/core` (`@lyra/core`) holds the platform-agnostic agent logic; desktop and iOS both consume it. Keep cross-platform behavior there rather than in the app shells.
- **Rust crate names**: `Cargo.toml` uses `name = "app"` and `lib.name = "lyra_lib"` pending a future rename sweep. Product/project name is consistently "Lyra".

## Mobile Debug Log Panel (`app-mobile`)

The iOS app (`app-mobile/`) ships with a hidden on-device debug console: `OnScreenLog`
(`app-mobile/src/App.tsx`) intercepts `console.log/warn/error` (only lines starting
with `[lyra`) and renders them in a floating translucent panel on the device screen,
so real-device debugging needs no Xcode console.

**It is compiled OUT of normal builds — the UI is completely absent.** To enable it:

1. In `app-mobile/.env.production.local` (git-ignored, never commit keys):
   ```
   VITE_LYRA_DEBUG_LOG=true
   ```
2. Rebuild & redeploy the app:
   ```bash
   pnpm -C app-mobile build
   pnpm -C app-mobile cap:sync
   cd app-mobile/ios/App
   xcodebuild build -workspace App.xcworkspace -scheme App \
     -configuration Debug -destination 'platform=iOS,id=<DEVICE_UDID>' \
     -derivedDataPath ../DerivedData
   xcrun devicectl device install app --device <DEVICE_UDID> ../DerivedData/Build/Products/Debug-iphoneos/App.app
   xcrun devicectl device process launch --device <DEVICE_UDID> com.jiuri.lyra
   ```

When enabled, the panel starts collapsed — tap the small **📜 日志(off)** button
(bottom-right) to expand; tap the panel header to collapse it again. Logs are
capped at the 200 most recent lines. Remove `VITE_LYRA_DEBUG_LOG` from the env
file and rebuild to ship clean builds.
