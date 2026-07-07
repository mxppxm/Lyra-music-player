# Sprint 3 Acceptance — 让她主动（Auto Dream + Proactive + Emotion Prediction）

**Head:** `afb87f2` (Sprint 3 T4)
**Gates before user smoke:** vitest 401/401 · cargo 14/14 · typecheck 0 errors · build ok

## Automated integration smoke
- [x] Dream scheduler unit tests: 22 cases (daily trigger, idle trigger, concurrency guard, lifecycle)
- [x] Proactive engine end-to-end: rules→gate→fulfil chain covered by engine + politeness + sulk + rules tests
- [x] Orchestrator: `proactive-pending` state + `startProactiveIntent` + backdated consume on `onUserInput` verified
- [x] Tray + notification wiring: `setBreathing(true)` on fulfil, `setBreathing(false)` on consume, notification sent lazily with permission request
- [x] Emotion prediction: LLM output validated, dropped-if-malformed, orchestrator uses `predicted_pad` when elapsed_min ∈ [3, horizon]

## User manual smoke (to fill after running `pnpm tauri dev`)

Have keys configured, library imported. Restart the app fresh before each scenario.

### Scenario A — Auto dream fires overnight (or forced)

Steps:
1. Open Settings, set **Daily dream time (HH:MM)** to `now + 2 minutes`
2. Close Settings; keep the window in the foreground
3. Wait for the target time

Expected:
- [ ] "Lyra is dreaming…" overlay appears within ~60 seconds after the target minute
- [ ] Overlay closes when Reflect completes
- [ ] `~/Library/Application Support/com.daoyu.lyra/memory.md` has a new **Dreams** entry with today's timestamp
- [ ] Living Portrait section updated (if the LLM decided to update it)
- [ ] Facts section may have new/updated conditional preferences

**Observed:** _(fill after run)_

### Scenario B — Morning proactive open

Steps:
1. Force-close the app (Cmd-Q)
2. Advance system clock to any time in [05:00, 12:00) OR just open first thing next morning
3. Launch the app fresh

Expected:
- [ ] After boot completes, state transitions to `proactive-pending` (not `idle`)
- [ ] Tray icon starts "breathing" (the AtomicBool toggles; icon may stay static per T3's degrade note)
- [ ] macOS Notification Center gets a notification: title `Lyra`, body `💬 我想给你放一首`
- [ ] Cover / small-note area may still show blank (v0.2 UX polish — proactive-pending doesn't render a cover yet)
- [ ] Typing anything, or letting the auto-advance eventually resolve, triggers the pending song to actually play; a new `DialogueTurn` with `modality: "proactive-open"` is recorded
- [ ] Tray stops breathing after consume

**Observed:** _(fill after run)_

### Scenario C — Sulk mode

Steps:
1. Trigger 3 proactive intents in a row (open + close + open + close, adjusting system clock to fool morning window if needed)
2. Do NOT interact with the notification / do NOT type anything — let each intent get "dismissed" by closing
3. On the 4th open

Expected:
- [ ] After 3 consecutive dismisses, sulk state kicks in; devtools console logs
  `[lyra] sulk mode activated; next release 2026-07-XXTHH:MM`
- [ ] Next proactive tick is skipped with reason `"sulk"` (visible in devtools if console.debug is enabled)
- [ ] No new tray breathing / no new notification
- [ ] Manually typing a message DOES clear the sulk (per plan: user typing = user willing to engage)

**Observed:** _(fill after run)_

### Scenario D — Emotion prediction

Steps:
1. Type `我要开始工作两小时了，让我先热身` (or a similar utterance that hints at future trajectory)
2. Wait for Lyra to pick a song and start playing
3. Let the song play for at least 3 minutes
4. Let the song naturally end

Expected:
- [ ] EmotionAgent's output for that turn includes `predicted_trajectory` (check via devtools console / a `console.debug` you can add temporarily)
- [ ] When auto-advance kicks in after the song ends AND elapsed_min ∈ [3, horizon_min], the next turn's `current_emotion.pad` uses `predicted_pad` (not the previous turn's pad)
- [ ] Song choice reflects the shifted PAD (should trend toward "in focus" territory)

**Observed:** _(fill after run)_

## Deltas observed

_(user fills in any UI polish items, unexpected behavior, or "should have" observations)_

1.
2.
3.
4.

## Follow-up decisions

Based on your smoke, choose next direction:
- **All 4 scenarios pass with no delta ≥ 6:** proceed to next sprint (network multi-source / music-gen / engineer agent per your call)
- **1-5 deltas across scenarios:** one polish mini-sprint before the next feature sprint
- **Fundamental scenario breaks:** revisit T1-T4 designs in a debug session

## Known v0.2 limitations documented up-front

- **Tray breath animation is `AtomicBool`-only** — actual icon toggling requires an `Arc<Mutex<AppHandle>>` refactor deferred to a follow-up. Notification remains the primary user signal.
- **Non-morning proactive kinds (`care`, `anniversary`, `share`, `rhythm`) return `null`** — they'll be filled in as follow-ups (need biosignal for care, real memory-date matching for anniversary, dream-seed piping for share, focus-detection for rhythm).
- **Sulk state doesn't persist across restarts** in v0.2 (in-memory only). If you close and reopen, sulk resets. A follow-up ticket adds keychain-backed persistence.
- **Proactive-pending UI is bare** — the plan intentionally leaves the cover/small-note area blank in that state; a real "she has something for you" visual (soft cover reveal, tray dot) is a v0.2 polish item.
