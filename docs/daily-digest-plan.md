# Daily Digest Implementation Plan

> **For agentic workers:** Execute task-by-task. Steps use checkbox syntax.

**Goal:** Ship daily digest: behavior telemetry + rule digest/conclusions + History overlay「日报」Tab (no email/share).

**Architecture:** Append-only `activity_events` + `play_sessions`; pure `buildDailyDigest` / `deriveConclusions`; HTML in `daily_snapshots`; UI only adds a third tab on HistoryOverlay. Side-effect-only `trackActivity` — never blocks play/recommend.

**Tech Stack:** `@lyra/core`, Capacitor SQLite migrations, React HistoryOverlay, vitest via app-mobile.

## Global Constraints

- Do not change recommendation scoring, moodLocked, or track-lock state machine semantics
- Do not change homepage / lock button styles; History overlay only adds a Tab
- No email, share, push, or `/day` reader in v1
- Distinguish `trackLock` (单曲循环) vs `moodLocked` (心情锚点) in all naming
- Fire-and-forget telemetry (`void trackActivity(...).catch`)

---

### Task 1: Schema + repos

**Files:**
- Create: `packages/platform-ios/src/migrations/010_daily_activity.sql`
- Modify: `packages/platform-ios/src/db.ts` (register migration 10)
- Create: `packages/core/src/db/repo/activityEventsRepo.ts`
- Create: `packages/core/src/db/repo/playSessionsRepo.ts`
- Create: `packages/core/src/db/repo/dailySnapshotsRepo.ts`
- Create: matching `*.test.ts` (mock getDb)

- [ ] Migration creates `activity_events`, `play_sessions`, `daily_snapshots`
- [ ] Repos: insert/listByDayKey / listBetween
- [ ] Tests green

### Task 2: trackActivity + PlaySessionTracker

**Files:**
- Create: `packages/core/src/daily/trackActivity.ts`
- Create: `packages/core/src/daily/PlaySessionTracker.ts`
- Create: `packages/core/src/daily/dayKey.ts`
- Create: tests

- [ ] `dayKey(date)` local YYYY-MM-DD
- [ ] `trackActivity({ name, songId?, turnId?, props? })` writes event
- [ ] PlaySessionTracker start/progress/pause/resume/end → play_sessions row

### Task 3: Wire Orchestrator + mobile (side-effect only)

**Files:**
- Modify: `Orchestrator.ts` (setTrackLock, clearTrackLock, onSongComplete lock branch, play/skip/complete, user_input, lyra_start)
- Modify: mobile lyrics / history / immersive / appState / favorite toggle call sites
- Tests: spy trackActivity; existing lock tests still pass

### Task 4: Digest + conclusions

**Files:**
- Create: `packages/core/src/daily/buildDailyDigest.ts`
- Create: `packages/core/src/daily/deriveConclusions.ts`
- Create: `packages/core/src/daily/renderDailyHtml.ts`
- Create: `packages/core/src/daily/runDaily.ts`
- Fixture tests: lock 5 loops → lock.deep + per-track seconds

### Task 5: HistoryOverlay 日报 Tab

**Files:**
- Modify: `HistoryOverlay.tsx` / `mobile.css` (tab only)
- Modify: `HistoryOverlay.test.tsx`
- Wire cold-start / simple schedule to `runDaily(yesterday)` in App boot

### Task 6: Verify

- [ ] Orchestrator + daily unit tests
- [ ] `pnpm build && cap copy ios` (or sync)
