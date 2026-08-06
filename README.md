# Lyra

**English** · [简体中文](./README.zh-CN.md)

> **Between the things you say. 未成曲调先有情。**

A music agent that sings to you, remembers you, and grows on its own. **Not just another music player.**

Lyra is a **pnpm monorepo** built with **React 19** + **TypeScript 5**. It ships as a **Tauri 2 desktop app** (`app/`) and an **iOS app** (`app-mobile/` via Capacitor), sharing one core (`@lyra/core`). It manages a personal music library, maintains emotional state, and uses LLM backends to recommend and play music in real time — adapting to your mood and preferences as you interact with it.

## Repository Layout

```
Lyra-music-player/                  # pnpm monorepo (pnpm-workspace.yaml)
├── app/                            # Tauri 2 desktop application (React + Rust)
├── app-mobile/                     # iOS app (Capacitor 7 + React)
├── packages/
│   ├── core/                       # @lyra/core — shared agent brain (agents, memory, library, providers)
│   ├── platform/                   # @lyra/platform — platform interface contracts
│   ├── platform-desktop/           # @lyra/platform-desktop — desktop impl (Tauri IPC)
│   └── platform-ios/               # @lyra/platform-ios — iOS impl (native audio plugin, Capacitor)
├── website/                        # Official website (Vite)
├── docs/                           # Product docs, plans, specs, and design notes
│   ├── business-model.md
│   ├── emotional-computing.md
│   ├── feature-gaps.md
│   ├── music-licensing-policy.md
│   ├── promotion-strategy.md
│   └── superpowers/                # plans/ and specs/
├── scripts/                        # shared build / resource scripts
├── start.sh                        # Convenience launcher — cd app && pnpm tauri dev
└── 需求.md                         # Original product requirements (Chinese)
```

The full desktop developer guide lives in [`app/README.md`](./app/README.md).

## Key Features

- **Personal Music Library** — SQLite-backed storage (desktop: `tauri-plugin-sql`; iOS: `@capacitor-community/sqlite`) with metadata and listening history; bigram tokenization + lyrics embeddings for fast Chinese song matching
- **Emotional Agent State** — Tracks mood with the PAD model (pleasure / arousal / dominance), listening patterns, and aesthetic preferences; a perception layer blends LLM reads, rule-based signals, and Open-Meteo weather into the current emotional state
- **Multi-LLM Support** — Pluggable providers (Anthropic, DeepSeek, Zhipu) plus OpenAI-compatible gateways (SupaNet `fxb` on desktop, SenseNova on iOS/core), with automatic fallback and retry on transient errors; OpenAI embeddings for lyrics search
- **Song Recommender** — Recommends songs by time-of-day and mood via the `song-recommender` strategy
- **Bilibili Integration** — CORS proxy to `api.bilibili.com`, DASH audio streaming, FFT-extracted audio features (energy, spectral centroid → real PAD), and lyrics extraction with semantic embeddings
- **Native iOS Playback** — Custom `LyraAudioPlugin` with a native playback queue for long background listening, lock-screen controls, and Live Activity (Dynamic Island)
- **Immersive Player** — One-tap Lyra start, immersive chrome that persists across song switches, emotion-glow backdrop, and restrained motion (crossfades, AnimatedMount overlays, collapsing dock)
- **ShanShui Home** — Ink-wash canvas over a photographic background layer sets the tone of the room
- **Weekly Letter** — Lyra writes you a first-person weekly reflection every Sunday (Rust `weekly.rs` + HTML renderer)
- **System Integration** — Tauri plugins for opener (URIs/paths) and notifications; tray breathing icon; on-device debug log panel for real-phone troubleshooting (iOS)

## Tech Stack

### Shared (`packages/`)
- **@lyra/core** — platform-agnostic agent brain: agents, memory, library, providers, recommendation
- **@lyra/platform** + **@lyra/platform-desktop** + **@lyra/platform-ios** — interface contracts and per-platform implementations

### Desktop (`app/`)
- **React 19** + **TypeScript 5**
- **Vite 7** for bundling and dev server
- **Vitest 1.6** + **Testing Library** for unit/component tests
- **@tauri-apps/api** for IPC to the backend

### iOS (`app-mobile/`)
- **Capacitor 7** with `@capacitor-community/sqlite`, filesystem, preferences
- **Custom `LyraAudioPlugin`** — native audio playback queue for background listening, lock-screen controls & Live Activity
- Shares `@lyra/core` agent logic via workspace deps; the mobile UI shell lives in `app-mobile/src`

### Backend (Rust, desktop)
- **Tauri 2** desktop framework
- **SQLite** via `tauri-plugin-sql` for persistent storage
- **rodio** for audio playback (symphonia backend)
- **reqwest** CORS proxy for Bilibili + DASH stream download; **lofty** for metadata; **rustfft** for audio feature extraction
- API keys are stored as `secrets.json` in the app data directory (not the system keychain — see [Persistence](#persistence--configuration))

### Tooling
- **pnpm 10.27** package manager + workspaces
- **@tauri-apps/cli** / **@capacitor/cli** for building and packaging

## Getting Started

### Prerequisites

- **Node.js** 18+ with **pnpm 10.27**
- **Rust stable** (1.77+, for Tauri 2) — needed for the desktop backend
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

**Important: `app-mobile` is a Capacitor project, not React Native.** Its UI is React + Vite **web code**; what actually ships in the iOS app is a set of static web assets loaded by the `WKWebView` (`dist/` → `ios/App/App/public/`), not native code compiled into the binary.

First-time build:

```bash
cd app-mobile
pnpm install
pnpm build && pnpm cap:sync    # bundle JS and sync the native iOS project
# then open / build in Xcode: pnpm cap:open
```

#### After editing web code (`.tsx` / `.js` / `.css`), you MUST sync to see it on-device

- The files you edit are "web source". A plain `xcodebuild` recompile will **not** pick them up.
- The native app loads the static files under `ios/App/App/public/`; only after the freshly built assets are synced there will the device show your changes.
- So every time you change web code, repeat the **build → sync → recompile** triple (steps 1–2 can be combined):

```bash
cd app-mobile
npx cap sync ios        # 1) runs build and copies the new web bundle into ios/App/App/public
# 2) then rebuild & reinstall (Xcode Run, or xcodebuild)
```

> Note: you only need to rebuild the native layer when you change **native Swift code** (`ios/App/App/*.swift`, e.g. the `Lyra*Plugin` files) or **add/remove native plugins**. For page-only changes the native shell doesn't need recompiling, but the sync step (`npx cap sync ios`) is never optional.

See the [Mobile Debug Log Panel](#mobile-debug-log-panel-app-mobile) section below for running the on-device debug console.

## Persistence & Configuration

- **SQLite database** — `~/Library/Application Support/com.daoyu.lyra/lyra.db` (desktop)
- **API keys & secrets** — desktop: plain-JSON `secrets.json` in the app data directory (the `keyring` crate / system keychain is **not** used); iOS: Capacitor Preferences
- **Bundle IDs** — desktop `com.daoyu.lyra`; iOS `com.jiuri.lyra`

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
- **Shared brain**: `packages/core` (`@lyra/core`) holds the platform-agnostic agent logic; desktop and iOS both consume it. Keep cross-platform behavior there rather than in the app shells. Note: `app/src` still keeps local copies of several subsystems (`db`, `providers`, `recommendation`, `memory`, `proactive`, `reflect`) that predate the packages split and have drifted — the desktop boot registers the SupaNet `fxb` gateway while core boots SenseNova. Migrate these to `@lyra/core` as you touch them.
- **Rust crate names**: `Cargo.toml` uses `name = "app"` and `lib.name = "lyra_lib"` pending a future rename sweep. Product/project name is consistently "Lyra".
- **Known debt**: desktop secrets are stored as plaintext JSON, not in the system keychain; replacing them with real keychain storage is on the backlog.

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
