# Day Mood Summary Implementation Plan

> **For agentic workers:** Execute task-by-task. Steps use checkbox syntax.

**Goal:** Replace daily-letter +「停过的歌」with day-scoped mood summary (same skeleton as `/mood`), feeding digest/conclusions into brief + 读解.

**Architecture:** `runDaily` → turns(day) + digest → `summarizeMood` + `deriveConclusions` → day mood brief → `MoodSummaryAgent` → HTML (`day-mood-v1`) with trajectory + letter + 读解. Kill song list. Desktop `/mood` uses same day window.

**Tech Stack:** `@lyra/core`, vitest, existing moodSummary + daily modules.

## Global Constraints

- Do not change recommendation / track-lock state machine / homepage styles
- No「停过的歌」list
- Behavioral data must feed brief + 读解
- Layout marker: `day-mood-v1`

---

### Task 1: Day mood brief builder

**Files:** Create `packages/core/src/daily/buildDayMoodBrief.ts` (+ test); optionally deprecate `buildDailyMoodBrief.ts`

- [ ] Brief includes: mood trajectory summary, period lines, utterance excerpts, conclusion claims, top songs with listen/lock notes (readable titles)
- [ ] Tests green

### Task 2: Renderer with 读解, no song list

**Files:** Create/replace `packages/core/src/daily/renderDailyHtml.ts` (or `renderDayMoodHtml.ts`)

- [ ] Renders opener/band/body/song_note/stats/periods/读解/forward
- [ ] Class `day-mood-v1`; no「停过的歌」
- [ ] Tests assert structure

### Task 3: Wire `runDaily` + MoodSummaryAgent day prompt

**Files:** `runDaily.ts`, extend `MoodSummaryAgent` / prompt for 自然日 window label

- [ ] Cache checks `day-mood-v1`
- [ ] Fallback when sparse / LLM fail
- [ ] Tests

### Task 4: Desktop `/mood` day window

**Files:** `app/src/moodSummary/wire.ts`, help text if needed

- [ ] `listTurnsBetween` yesterday (or today option); drop TURN_LIMIT 60 default

### Task 5: Cleanup + mobile sync

- [ ] Remove/stop exporting DailyMood letter path from `runDaily`
- [ ] Update daily tests; `pnpm build && cap:sync` in app-mobile
