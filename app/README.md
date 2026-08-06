# Lyra (Desktop App)

> **Between the things you say. 未成曲调先有情。**

A music agent that sings to you, remembers you, and grows on its own. **Not yet another music player.**

Design docs and decisions live in [`../docs/superpowers/`](../docs/superpowers/).

## Overview

Lyra is a desktop music agent built with **Tauri 2** + **React 19** + **TypeScript 5**. It manages a personal music library, maintains emotional state, and uses LLM backends to recommend and play music in real time — adapting to your mood and preferences as you interact with it.

### Key Features

- **Personal Music Library**: SQLite-backed local storage with metadata and listening history
- **Emotional Agent State**: Tracks mood (PAD model), listening patterns, and aesthetic preferences
- **Multi-LLM Support**: Pluggable model providers (Anthropic, DeepSeek, Zhipu, plus the SupaNet `fxb` OpenAI-compatible gateway), with automatic fallback and retry
- **Bilibili Integration**: CORS proxy to `api.bilibili.com`, DASH audio streaming, FFT audio features, and lyrics extraction with semantic embeddings
- **Song Recommender**: Recommends songs by time-of-day and mood via the `song-recommender` strategy
- **Immersive Player**: One-tap Lyra start, immersive chrome, emotion-glow backdrop, and restrained motion
- **ShanShui Home**: Ink-wash canvas over a photographic background
- **Weekly Letter**: First-person weekly reflection every Sunday
- **System Integration**: Tauri plugins for opener (URIs/paths) and notifications; tray breathing icon

## Tech Stack

### Frontend
- **React 19** + **TypeScript 5** for UI
- **Vite 7** for bundling and dev server
- **Vitest 1.6** + **Testing Library** for unit/component tests
- **@tauri-apps/api** for IPC to the backend

### Backend (Rust)
- **Tauri 2** desktop framework
- **SQLite** via `tauri-plugin-sql` for persistent storage
- **rodio** for audio playback (symphonia backend)
- **reqwest** for the Bilibili CORS proxy + DASH stream download; **lofty** for metadata; **rustfft** for audio feature extraction
- **serde** + **serde_json** for serialization

### Build & Development
- **pnpm 10.27** package manager
- **@tauri-apps/cli** for building and packaging
- **tsconfig.json** with strict type checking enabled

## Getting Started

### Prerequisites

- **Node.js** 18+ (we use pnpm 10.27)
- **Rust stable** (1.77+, for Tauri 2)
- **Xcode Command Line Tools** (macOS) or equivalent build tools

### Installation

1. Clone the monorepo and install workspace deps from the root:
   ```bash
   git clone git@github.com:daoyuly/Lyra-music-player.git
   cd Lyra-music-player
   pnpm install
   ```

2. From this directory (`app/`), verify the setup:
   ```bash
   pnpm typecheck
   ```

### Development

#### Running in Dev Mode
```bash
pnpm tauri dev
```
This starts both the Vite dev server (hot reload) and the Tauri backend.

#### TypeScript Checking
```bash
pnpm typecheck
```

#### Testing
```bash
pnpm test              # Run all tests once
pnpm test:watch        # Watch mode
pnpm test:ui           # Vitest UI dashboard
```

#### Building for Distribution
```bash
pnpm build            # TypeScript + Vite build
pnpm tauri build      # Package as macOS .app (or platform-specific binary)
```

## Project Structure

```
app/
├── src/                          # TypeScript/React frontend
│   ├── agents/                   # Agent re-exports from @lyra/core (+ emotion eval regression)
│   ├── audio/                    # Tauri IPC → rodio audio playback (player.ts, useProgress)
│   ├── bilibili/                 # Bilibili API client + FFT audio-features cache
│   ├── db/                       # SQLite client + codec + repository (local copy, mirrors core)
│   ├── home/                     # Home view: ShanShuiCanvas, PlayerControls, WeeklyReader, keyboard/slash commands
│   ├── library/                  # Bilibili-track → library mapping, lyrics extraction/embeddings, feature extraction
│   ├── memory/                   # Salient memory, context assembly, file-backed store (local copy, mirrors core)
│   ├── moodSummary/              # PAD time-bucket summaries (local copy, mirrors core)
│   ├── perception/               # LLM + rule-based perception, weather (Open-Meteo)
│   ├── proactive/                # Proactive engine, politeness, sulk persistence
│   ├── providers/                # Model provider adapters + bootProviders() — registers Anthropic/DeepSeek/Zhipu/fxb
│   ├── reasoning/                # LLM reasoning traces
│   ├── recommendation/           # time-of-day/mood context, play history, profile scoring, diversity
│   ├── reflect/                  # Weekly/reflective agent
│   ├── schedule/                 # Scheduled triggers
│   ├── settings/                 # Settings modal + secret storage wrapper
│   ├── tray/                     # Tray breathing-icon bridge
│   ├── turn/                     # Turn orchestration (local copy, mirrors core)
│   ├── ui/                       # Motion primitives (AnimatedMount, Crossfade), overlays
│   ├── weekly/                   # WeeklyAgent, data gathering, HTML renderer, Sunday trigger wiring
│   ├── App.tsx                   # App shell: boot providers, mount HomeView, overlays
│   └── main.tsx                  # React entry point
├── src-tauri/                    # Rust backend
│   ├── src/
│   │   ├── main.rs               # Tauri entry point
│   │   ├── lib.rs                # Plugin registration + Tauri command handlers
│   │   ├── audio.rs              # rodio-based playback (Arc<AudioPlayer>)
│   │   ├── audio_features.rs     # FFT feature extraction from audio URLs
│   │   ├── bilibili_proxy.rs     # CORS proxy for api.bilibili.com
│   │   ├── library_scan.rs       # Directory scan + metadata (lofty)
│   │   ├── lyrics.rs             # Lyrics handling
│   │   ├── secrets.rs            # secrets.json CRUD in the app data dir
│   │   ├── tray.rs               # Tray breathing icon
│   │   └── weekly.rs             # Weekly letter generation/writing
│   ├── migrations/               # SQLite schema migrations (001..008)
│   ├── tests/                    # Rust integration tests (audio, secrets, weekly, library_scan, features)
│   ├── capabilities/default.json
│   ├── Cargo.toml
│   └── tauri.conf.json
├── public/                       # Static assets
├── index.html                    # HTML entry point
├── vite.config.ts / vitest.config.ts
├── tsconfig.json
├── package.json
└── README.md                     # This file
```

## Persistence & Configuration

### SQLite Database
- **Path**: `~/Library/Application Support/com.daoyu.lyra/lyra.db`
- **Schema**: Defined by migrations in `src-tauri/migrations/`

### API Keys & Secrets
- Stored as plain-JSON `secrets.json` in the app data directory (see `src-tauri/src/secrets.rs`).
- **Note**: the system keychain (`keyring` crate) is **not** used; this is known technical debt.

## Commit Conventions

All commits follow conventional commits with the `lyra` scope:

```
docs(lyra): update README for developer setup
feat(lyra): add new LLM provider adapter
fix(lyra): resolve song selection race condition
refactor(lyra): simplify dialogue turn handling
test(lyra): add unit tests for soul state evolution
```

### Commit Prefix Reference
- `feat(lyra):` — New feature
- `fix(lyra):` — Bug fix
- `docs(lyra):` — Documentation
- `refactor(lyra):` — Code refactoring (no behavior change)
- `test(lyra):` — Tests
- `chore(lyra):` — Build, dependencies, tooling

## Recommended IDE Setup

- **[VS Code](https://code.visualstudio.com/)**
  - [Tauri Extension](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode)
  - [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer)
  - [ESLint](https://marketplace.visualstudio.com/items?itemName=dbaeumer.vscode-eslint)

## Contributing

1. Create a feature branch off `main`:
   ```bash
   git checkout -b feat/lyra-my-feature
   ```

2. Make changes, commit with proper scope:
   ```bash
   git add .
   git commit -m "feat(lyra): describe your change"
   ```

3. Run tests and typecheck before pushing:
   ```bash
   pnpm typecheck && pnpm test
   ```

4. Open a pull request with a clear description.

## Troubleshooting

### "Failed to resolve plugin"
- Run `pnpm install` to ensure all Tauri plugins are installed
- Check that `@tauri-apps/cli` matches your Tauri 2.x version

### Type errors in IDE
- Run `pnpm typecheck` to see all errors
- Ensure `node_modules/.bin/tsc` is up to date

### Vite dev server not hot-reloading
- Check that `vite.config.ts` has the correct port and host
- Restart the dev server with `pnpm tauri dev`

## License

Proprietary — see parent project LICENSE if applicable.

## Notes for Maintainers

- **Rust crate names**: The Cargo.toml still uses `name = "app"` and `lib.name = "lyra_lib"` for now (pending a future rename sweep to fully align with the Lyra branding). The README uses "Lyra" consistently for the product/project name.
- **Bundle ID**: `com.daoyu.lyra` (see `src-tauri/tauri.conf.json`); the iOS app uses `com.jiuri.lyra`.
- **Agent personality**: Lyra is a music agent — not a player, not a recommender tool, but a conversational entity that learns and grows through dialogue. Design decisions reflect this agency model.
- **Local copies vs `@lyra/core`**: several `app/src` subsystems (`db`, `providers`, `recommendation`, `memory`, `proactive`, `turn`) are local copies that predate the packages split and have drifted from `@lyra/core` (e.g. the desktop boot registers the SupaNet `fxb` gateway, while core registers SenseNova). Migrate them back to core as you touch them.
