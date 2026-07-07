# Sprint 4 Acceptance — Perception Agent（感知 agent）

**Head:** `b299879` (Sprint 4 T4) · Sprint 4 template committed as T5
**Gates before user smoke:** vitest 431/431 · typecheck 0 errors · build ok

## Automated integration smoke

- [x] Perception EventBus: 5 tests (emit fires listeners, unsubscribe stops delivery, `recent(window)` respects lookback + sorts asc, buffer caps at 1000, singleton export)
- [x] BehavioralAggregator: 7 tests (empty bus, activeMs from mouse/key, submits + totalChars + avgSubmitGapMs, skipRatio, proactiveDismisses, isBlurred focus/blur, windowMs boundary)
- [x] PerceptionAgent (rules v1): 7 tests (no-signal, one per rule, multi-rule combine with confidence-weighted average + reason concat + capped confidence)
- [x] install: 5 tests (attaches focus/blur/mousemove/keydown, emits typed events, throttles ≤ 1 event / 500ms per kind, uninstall removes listeners, SSR no-op)
- [x] Orchestrator perception blending: 5 tests (no-bias passthrough, blend scaled by confidence, clamp to [-1,1], null clears prior bias, optional eventBus emits input_submit/skip/complete)

## User manual smoke (fill after running `pnpm tauri dev`)

Restart the app fresh before each scenario. Open devtools before starting.

### Scenario 1 — Rapid succession (arousal boost)

Steps:
1. Immediately after boot, type 3 short messages within 30 seconds (e.g. `想听点什么`, `随便`, `快一点`)
2. Wait ~60 seconds (perception tick interval) OR let the boot-time prime tick fire
3. Watch devtools console for `[lyra] perception bias:` log

Expected:
- [ ] Bias `reason` contains `"rapid succession"` (Rule 3)
- [ ] `pad_bias.a > 0` and `pad_bias.d > 0`; `confidence ≥ 0.5`
- [ ] On the very next user message after the log, the companion picks a slightly higher-arousal song (verify subjectively — tempo, energy)

**Observed:** _(fill after run)_

### Scenario 2 — High skip ratio (frustration dampen)

Steps:
1. From a playing state, skip 3 songs in a row (Cmd/Ctrl+K or the skip button, before each finishes)
2. Wait ~60 seconds for the next perception tick
3. Watch devtools console

Expected:
- [ ] Bias `reason` contains `"high skip ratio"` (Rule 1)
- [ ] `pad_bias.p ≈ -0.2`, `pad_bias.a ≈ +0.1`, `confidence ≈ 0.5`
- [ ] Next companion pick tilts toward lower-p (softer, less intense) song
- [ ] `EventBus.recent()` inspected in devtools shows 3 `skip` events with distinct `turnId`

**Observed:** _(fill after run)_

### Scenario 3 — Extended blur / idle (calm/away)

Steps:
1. Focus the Lyra window briefly, then Cmd-Tab away for at least 6 minutes without moving mouse or typing
2. Return to the app
3. Wait for the perception tick

Expected:
- [ ] Bias `reason` contains `"extended blur/idle"` (Rule 2)
- [ ] `pad_bias.a ≈ -0.3` (lower arousal), `confidence ≈ 0.4`
- [ ] Next user input receives lower-a bias → gentler song selection
- [ ] Aggregator's `isBlurred` is true when logged

**Observed:** _(fill after run)_

### Scenario 4 — Perception toggle OFF

Steps:
1. Open Settings; uncheck **Perception (privacy)**; Save
2. Reproduce Scenario 1 (3 rapid messages)
3. Watch devtools console

Expected:
- [ ] No `[lyra] perception bias:` log fires
- [ ] `SECRET_KEYS.perceptionEnabled` stored as `"false"` (verify via `secret_get perception.enabled` in the Rust debug console)
- [ ] No `input_submit` / `skip` / `complete` events accumulate in the bus for aggregator ticks — because listeners are not installed (uninstall on toggle-off happens on next boot)
- [ ] Re-enabling in Settings and restarting the app restores perception behavior

**Observed:** _(fill after run)_

## Deltas observed

_(user fills in any UI polish items, unexpected behavior, or "should have" observations)_

1.
2.
3.
4.

## Follow-up decisions

Based on your smoke, choose next direction:
- **All 4 scenarios pass, no delta ≥ 6:** proceed to next sprint (multi-provider LLM routing / music-gen agent / engineer agent per your call)
- **1-5 deltas across scenarios:** one polish mini-sprint before the next feature sprint
- **Fundamental scenario breaks (bias never fires, or fires incorrectly):** revisit T2/T3 thresholds — they were tuned by inspection, not empiricism

## Known v0.2 limitations documented up-front

- **Perception thresholds are hand-tuned** — `skipRatio ≥ 0.6`, `avgSubmitGapMs < 15s`, `activeMs/windowMs < 0.05`, etc. These are educated guesses; the acceptance run is meant to surface which need adjustment. Values live in `src/perception/PerceptionAgent.ts`.
- **Rule fires apply for one turn only** — the bias is stored on the Orchestrator and read on the next `onUserInput`; there's no fade / half-life yet. Fast-changing signals should feel responsive; slow-varying signals may under-weight.
- **Toggle change requires app restart** — the perception `useEffect` reads the setting on boot; toggling in Settings persists to keychain but doesn't tear down/rebuild the listener chain live. Follow-up ticket if this is annoying.
- **In-memory only** — the EventBus buffer, aggregator features, and PerceptionAgent output are never written to DB. Only the final blended `CurrentEmotion.pad` on a `DialogueTurn` persists (as before). This is a privacy guarantee, not a bug.
- **PerceptionAgent has no LLM** in Sprint 4 by design. Rules are deterministic. A future LLM-backed "perception+" that reads the last N events + memory context is scoped for a later sprint.
- **`listen_progress` event is emitted from Rust already but not yet aggregated** — the aggregator ignores it in v1 because the same signal is folded into `completions` via `onSongComplete`. Wire this in if a "half-listened many times" rule is needed.
