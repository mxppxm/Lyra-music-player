# Sprint 10 — 歌词语义 embedding — Acceptance Checklist

**Date:** 2026-07-08
**Sprint:** 10 (v0.2.2)
**Feature:** Lyrics embedding + three-signal LibraryAgent scoring

---

## Pre-conditions

- App is running locally (`pnpm tauri dev` or a production build)
- Zhipu OR OpenAI API key configured under embedding provider selection (Settings modal)
- SQLite freshly migrated: `library_lyrics_embeddings` table present (migration 004)
- A test folder of mp3/flac with at least a few tracks that carry USLT / vorbis LYRICS tags

---

## Scenario A — Import populates embeddings

**Steps:**
1. Wipe existing library rows (fresh dev DB) or use a folder that has never been imported
2. Open Settings → Embedding provider → choose Zhipu or OpenAI, paste API key → Save
3. Trigger Import folder in Settings
4. Wait ~30-60s

**Expected:**
- Data Explorer (Cmd+Shift+D) → 歌词 embedding tab → coverage > 0%
- `library_lyrics_embeddings` has rows whose `model_id` matches the selected provider
- Tracks without any lyrics tag are simply absent from the table (no rows written, no errors)

---

## Scenario B — Refill picks up laggards

**Steps:**
1. Toggle embedding provider (Zhipu → OpenAI or vice-versa) in Settings → Save
2. Open Data Explorer 歌词 embedding tab — coverage drops (existing rows are wrong `model_id`)
3. Return to Settings → click "Refill missing lyrics embeddings"
4. Wait ~1 min per 200 tracks

**Expected:**
- Coverage climbs back toward its original level (bounded by tracks that carry lyrics tags)
- `model_id` on new rows matches the newly selected provider
- Refill button re-enables after the batch completes; status shows "Refill: N succeeded, M failed (of K)."

---

## Scenario C — Missing lyrics tag graceful

**Steps:**
1. Import a folder where NO track carries a USLT / LYRICS tag
2. Check `library_lyrics_embeddings` — should be empty
3. Have a normal conversation with Lyra → LibraryAgent still returns candidates

**Expected:**
- Data Explorer 歌词 embedding tab shows 0% coverage
- Conversation works; ranking equivalent to Sprint 9 baseline (kw + PAD only)

---

## Scenario D — Provider not configured graceful

**Steps:**
1. Remove embedding provider selection in Settings (choose "未启用") → Save
2. Import a folder
3. Watch for silent degradation

**Expected:**
- `library_lyrics_embeddings` remains empty (no crashes)
- LibraryAgent silently degrades to kw+pad; conversation works
- Refill button is disabled while no provider is chosen

---

## Scenario E — LibraryAgent scoring changes with sem

**Steps** (dev / unit level):
1. Run `pnpm test src/agents/LibraryAgent.test.ts`
2. Look for the "Sprint 10: three-signal scoring" block

**Expected:**
- All 6 new Sprint 10 cases pass
- Sprint 9 cases (kw+pad blending) still pass — the Sprint 9 formula is
  preserved when sem is unavailable, because 0.2/(0.2+0.3)=0.4 and
  0.3/(0.2+0.3)=0.6

---

## Scenario F — Automated suites green

Run:
```bash
cd 音乐播放器/app && pnpm test && pnpm typecheck && pnpm build
cd 音乐播放器/app/src-tauri && cargo test
```

**Expected:**
- vitest ≥ 600 pass
- cargo ≥ 22 pass (Sprint 9 baseline 17 + Sprint 10 T1 adds 4 = 21+)
- typecheck 0 errors
- `pnpm build` succeeds

---

## Sign-off

| Scenario | Pass | Notes |
|----------|------|-------|
| A — import populates | ☐ | |
| B — refill after provider switch | ☐ | |
| C — missing lyrics graceful | ☐ | |
| D — provider unconfigured graceful | ☐ | |
| E — LibraryAgent sem-aware scoring | ☐ | |
| F — automated suites green | ☐ | |

All scenarios must pass before promoting Sprint 10 to v0.2.2.
