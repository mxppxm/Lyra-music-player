# Sprint 1b-β Acceptance — Tuning Notes
**Date:** 2026-07-06
**Branch baseline:** 5a08298
**Tester:** (fill in)

---

## Setup

1. `pnpm tauri dev` in `音乐播放器/app/`
2. Open Settings (Cmd+,) → enter at least one API key (Anthropic / DeepSeek / Zhipu)
3. Import ≥ 10 local music files via Settings → Library
4. Close Settings — app transitions from cold-boot to idle state ("Lyra 在等你说一句话")

---

## Scenario A — 疲惫深夜 (spec §6.4.1)

**Precondition:** Local library has at least one track. Evening/night system time preferred.

**Steps:**
1. Type "最近有点累" in the input box and press Enter
2. Observe SmallNote briefly shows "…" (thinking state)
3. Observe song starts playing; SmallNote shows Companion's rationale
4. Open browser/Tauri devtools console

**Expected:**
- [ ] `state.kind` transitions: idle → thinking → playing
- [ ] `AmbientBackground` hue shifts toward deep indigo (low-p, low-a PAD)
- [ ] SmallNote rationale is written by real LLM (not placeholder text)
- [ ] A song from local library is chosen and plays (audio audible)
- [ ] DevTools console shows `[lyra]` log or DB inspector shows `dialogue_turns` row inserted
- [ ] EmotionLightBand shows a single sample bar (v0.1 single-sample approximation)

**Delta / actual result:**
```
(fill after manual smoke)
```

---

## Scenario B — 换一首，安静点 (spec §6.4.2)

**Precondition:** Scenario A complete; a song is currently playing.

**Steps:**
1. While song plays, type "换一首，安静点" and press Enter
2. Observe previous song stops; new song starts

**Expected:**
- [ ] Previous turn's `user_reaction.verbal` is captured (content = "换一首，安静点")
- [ ] New `DialogueTurn` inserted in `dialogue_turns` table
- [ ] Companion picks a different song from a re-filtered candidate list
- [ ] New song is demonstrably quieter / more ambient than the previous pick
- [ ] TraceStrip gains a new item (previous turn thumbnail visible)

**Delta / actual result:**
```
(fill after manual smoke)
```

---

## Scenario C — 手动 Reflect Now (spec §6.4.3)

**Status: DEFERRED to Sprint 2**

Auto-dream / Reflect Now is not yet built. The `Orchestrator` does not implement
proactive open or dream synthesis. This scenario will be revisited in Sprint 2
when the proactive budget + dream pipeline lands.

**Placeholder checklist (for Sprint 2 runner):**
- [ ] "Reflect now" button or proactive trigger available in UI
- [ ] `ProactiveKind` = `"share"` or `"care"` turn inserted
- [ ] Dream narrative displayed in SmallNote
- [ ] SoulState `evolution_log` updated

---

## Regression

| Suite | Before T8 | After T8 | Delta |
|-------|-----------|----------|-------|
| vitest | 183 | (fill) | (fill) |
| cargo test | 11 | (fill) | (fill) |
| TypeScript | clean | (fill) | — |
| pnpm build | — | (fill) | — |

---

## Notes

- v0.1: `EmotionLightBand` shows a 1-element PAD array (single-sample approximation).
  Sprint 2 will accumulate a rolling window of recent turns' PADs.
- `coverUrl` is `null` for all local tracks in v0.1; album art extraction deferred to Sprint 2.
- Cold-boot state (no API key) preserved Lyra hero identity (h1 "Lyra" + EN + CN slogan).
