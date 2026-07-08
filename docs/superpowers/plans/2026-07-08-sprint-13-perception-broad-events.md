# Sprint 13 · 感知广谱事件 · Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend Lyra's perception layer from 9 event kinds / 10 aggregator dims / 5 rules to 13 kinds / 15 dims / 8 rules so the soul can sense "quiet presence", "attentive hover", "hesitant input" without violating the newly-committed website PRIVACY promise.

**Architecture:** 4 new EventBus kinds (`scroll`, `hover_dwell`, `input_dwell_without_submit`, `focus_no_interaction`). Global window listeners in `install.ts` for 3 of them + a React hook for input dwell state (which needs the controlled `value`). A new `coarsening.ts` maps new dims to level strings (`low`/`medium`/`high`) so LLMPerceptionAgent only sends levels over the network, never raw counts. RulePerceptionAgent gets full numeric input. Zero DB migration — both `perception_audit.features_json` and `soul_perception_tuning` are JSON blobs, `?? 0` handles old snapshots.

**Tech Stack:** TypeScript, React 19, Vitest (fake timers for time-based tests), Rust (Tauri) — no Rust changes this sprint.

## Global Constraints

- **Zero DB migration.** `perception_audit.features_json` is already TEXT JSON; missing fields on old rows read as `undefined` and are coalesced with `?? 0`/`?? false`.
- **Zero UI visual change.** The only DOM additions are `data-lyra-*` attributes on 5 elements. No CSS.
- **Test floor after sprint:** 639 vitest passing / 33 cargo passing / typecheck 0 errors.
- **Network privacy:** RulePerceptionAgent gets full numeric BehavioralFeatures. LLMPerceptionAgent gets `{ features: <old 10 numeric dims>, signals: <4 coarse levels> }`. The 5 new numeric dims MUST NOT leave the local process as raw numbers.
- **Non-goals:** playback control events, selection/copy events, hover target distribution, scroll direction distribution, network sync.
- **Test files paths use POSIX** and always the app subdirectory: `音乐播放器/app/src/perception/*` etc.
- **Commit prefix:** `feat(lyra):` for behavior changes, `test(lyra):` for pure test additions, `refactor(lyra):` for internal moves. Trailer must include `Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>`.
- **Every task commit must leave the tree with all tests green.** No red-tree commits.

## File Structure

| Path | Purpose | Task |
|---|---|---|
| `src/perception/events.ts` | Extend `LyraEvent` union with 4 new kinds | 1 |
| `src/perception/events.test.ts` | +1 case covering the 4 new kinds | 1 |
| `src/perception/aggregator.ts` | Extend `BehavioralFeatures` + compute 5 new dims | 2 |
| `src/perception/aggregator.test.ts` | +4 dim tests + 1 regression | 2 |
| `src/perception/tuning.ts` | Add 4 new threshold keys with defaults + clamp | 3 |
| `src/perception/tuning.test.ts` | +1 case testing the 4 new keys through `resolveThresholds` | 3 |
| `src/perception/RulePerceptionAgent.ts` | Add 3 new rules to `buildRules` | 4 |
| `src/perception/RulePerceptionAgent.test.ts` | +3 rule tests + 1 combined case | 4 |
| `src/perception/coarsening.ts` | **New**: pure function `coarsen(features) → CoarseSignals` | 5 |
| `src/perception/coarsening.test.ts` | **New**: 5 boundary/edge cases | 5 |
| `src/perception/LLMPerceptionAgent.ts` | Call `coarsen()` and merge into prompt payload | 6 |
| `src/perception/LLMPerceptionAgent.test.ts` | +1 case verifying `signals` block appears in payload | 6 |
| `src/perception/prompt.ts` | Doc comment additions describing the 4 signal kinds | 6 |
| `src/perception/install.ts` | Add scroll/hover_dwell/focus_no_interaction listeners | 7 |
| `src/perception/install.test.ts` | +3 cases | 7 |
| `src/perception/useInputDwellBus.ts` | **New**: hook, state machine for typed-then-cleared | 8 |
| `src/perception/useInputDwellBus.test.tsx` | **New**: 3 cases (submit / clear / resume) | 8 |
| `src/home/InputBox.tsx` | Call `useInputDwellBus(bus, value)` and `notifySubmit()` on Enter | 8 |
| `src/home/InputBox.test.tsx` | +1 case verifying bus receives `input_dwell_without_submit` on the type→dwell→clear path | 8 |
| `src/ui/DataExplorer.tsx` | Add `data-lyra-scroll="data_explorer"` on the scroll wrapper | 9 |
| `src/ui/RoadmapBoard.tsx` | Add `data-lyra-scroll="roadmap"` on the scroll wrapper | 9 |
| `src/home/AlbumCover.tsx` | Add `data-lyra-hover="album_cover"` on root | 9 |
| `src/home/SmallNote.tsx` | Add `data-lyra-hover="small_note"` on root span | 9 |
| `src/home/TraceStrip.tsx` | Add `data-lyra-hover="trace_strip"` on root | 9 |

---

### Task 1: Extend `LyraEvent` union with 4 new event kinds

**Files:**
- Modify: `音乐播放器/app/src/perception/events.ts`
- Test: `音乐播放器/app/src/perception/events.test.ts`

**Interfaces:**
- Consumes: existing `EventBus`, `LyraEvent`
- Produces: new discriminants `scroll`, `hover_dwell`, `input_dwell_without_submit`, `focus_no_interaction` on `LyraEvent`

- [ ] **Step 1: Write the failing test**

Append to `音乐播放器/app/src/perception/events.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { EventBus } from "./events";

describe("EventBus new event kinds (Sprint 13)", () => {
  it("emits and retrieves scroll / hover_dwell / input_dwell_without_submit / focus_no_interaction", () => {
    const bus = new EventBus();
    bus.emit({ kind: "scroll", at: 100, container: "data_explorer", direction: "down" });
    bus.emit({ kind: "hover_dwell", at: 200, target: "album_cover", ms: 3200 });
    bus.emit({ kind: "input_dwell_without_submit", at: 300, charsTyped: 7, dwellMs: 12000 });
    bus.emit({ kind: "focus_no_interaction", at: 400, sinceMs: 185000 });

    const events = bus.recent(10_000, 5_000);
    expect(events.map((e) => e.kind)).toEqual([
      "scroll",
      "hover_dwell",
      "input_dwell_without_submit",
      "focus_no_interaction",
    ]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd 音乐播放器/app && pnpm test src/perception/events.test.ts`
Expected: TypeScript compile error (new kinds not in `LyraEvent` union) — vitest reports a transform failure.

- [ ] **Step 3: Extend the `LyraEvent` union**

Replace the `LyraEvent` type in `音乐播放器/app/src/perception/events.ts` with:

```ts
export type LyraEvent =
  | { kind: "window_focus"; at: number }
  | { kind: "window_blur"; at: number }
  | { kind: "mouse_active"; at: number }
  | { kind: "key_active"; at: number }
  | { kind: "input_submit"; at: number; charCount: number }
  | { kind: "listen_progress"; at: number; turnId: string; ms: number }
  | { kind: "skip"; at: number; turnId: string }
  | { kind: "complete"; at: number; turnId: string }
  | { kind: "proactive_dismissed"; at: number; intentId: string }
  | { kind: "scroll"; at: number; container: "data_explorer" | "roadmap" | "other"; direction: "up" | "down" }
  | { kind: "hover_dwell"; at: number; target: "album_cover" | "small_note" | "trace_strip"; ms: number }
  | { kind: "input_dwell_without_submit"; at: number; charsTyped: number; dwellMs: number }
  | { kind: "focus_no_interaction"; at: number; sinceMs: number };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd 音乐播放器/app && pnpm test src/perception/events.test.ts && pnpm typecheck`
Expected: all events tests pass; typecheck 0 errors.

- [ ] **Step 5: Commit**

```bash
git -C /Users/daoyu/Documents/my-github/idea add \
  "音乐播放器/app/src/perception/events.ts" \
  "音乐播放器/app/src/perception/events.test.ts"
git -C /Users/daoyu/Documents/my-github/idea commit -m "$(cat <<'EOF'
feat(lyra): extend LyraEvent union with 4 new perception kinds

Sprint 13 T1 — add scroll / hover_dwell / input_dwell_without_submit /
focus_no_interaction discriminants. No emitter changes yet; aggregator,
rules and install layer follow in subsequent tasks.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Extend `BehavioralFeatures` + compute 5 new dims

**Files:**
- Modify: `音乐播放器/app/src/perception/aggregator.ts`
- Test: `音乐播放器/app/src/perception/aggregator.test.ts`

**Interfaces:**
- Consumes: `LyraEvent` (4 new kinds from Task 1), `EventBus.recent()`
- Produces: `BehavioralFeatures` gains 5 numeric fields: `scrollEvents: number`, `hoverDwellCount: number`, `totalHoverDwellMs: number`, `abandonedInputs: number`, `focusIdleMs: number`

- [ ] **Step 1: Write the failing test**

Append to `音乐播放器/app/src/perception/aggregator.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { EventBus } from "./events";
import { aggregate } from "./aggregator";

describe("aggregator new dims (Sprint 13)", () => {
  const NOW = 1_000_000;
  const WIN = 60_000;

  it("counts scrollEvents", () => {
    const bus = new EventBus();
    bus.emit({ kind: "scroll", at: NOW - 1000, container: "data_explorer", direction: "up" });
    bus.emit({ kind: "scroll", at: NOW - 500, container: "roadmap", direction: "down" });
    bus.emit({ kind: "scroll", at: NOW - 100, container: "other", direction: "up" });
    expect(aggregate(bus, WIN, NOW).scrollEvents).toBe(3);
  });

  it("counts hoverDwellCount and sums totalHoverDwellMs", () => {
    const bus = new EventBus();
    bus.emit({ kind: "hover_dwell", at: NOW - 5000, target: "album_cover", ms: 3200 });
    bus.emit({ kind: "hover_dwell", at: NOW - 3000, target: "small_note", ms: 4100 });
    const f = aggregate(bus, WIN, NOW);
    expect(f.hoverDwellCount).toBe(2);
    expect(f.totalHoverDwellMs).toBe(7300);
  });

  it("counts abandonedInputs from input_dwell_without_submit events", () => {
    const bus = new EventBus();
    bus.emit({ kind: "input_dwell_without_submit", at: NOW - 4000, charsTyped: 12, dwellMs: 11000 });
    bus.emit({ kind: "input_dwell_without_submit", at: NOW - 2000, charsTyped: 5, dwellMs: 15000 });
    expect(aggregate(bus, WIN, NOW).abandonedInputs).toBe(2);
  });

  it("sums focusIdleMs from focus_no_interaction sinceMs values", () => {
    const bus = new EventBus();
    bus.emit({ kind: "focus_no_interaction", at: NOW - 30000, sinceMs: 180000 });
    bus.emit({ kind: "focus_no_interaction", at: NOW - 5000, sinceMs: 200000 });
    expect(aggregate(bus, WIN, NOW).focusIdleMs).toBe(380000);
  });

  it("does not perturb existing dims when new events are present (regression)", () => {
    const bus = new EventBus();
    bus.emit({ kind: "mouse_active", at: NOW - 3000 });
    bus.emit({ kind: "input_submit", at: NOW - 2000, charCount: 10 });
    bus.emit({ kind: "scroll", at: NOW - 1000, container: "data_explorer", direction: "up" });
    bus.emit({ kind: "hover_dwell", at: NOW - 500, target: "album_cover", ms: 3200 });
    const f = aggregate(bus, WIN, NOW);
    expect(f.activeMs).toBe(500);
    expect(f.submits).toBe(1);
    expect(f.totalChars).toBe(10);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd 音乐播放器/app && pnpm test src/perception/aggregator.test.ts`
Expected: 4 new dim tests fail (properties are `undefined`); regression test passes.

- [ ] **Step 3: Extend `BehavioralFeatures` type and `aggregate()`**

In `音乐播放器/app/src/perception/aggregator.ts`, add these fields to `BehavioralFeatures` (just before the closing `}`):

```ts
  /** Sprint 13: window内 scroll 事件总数(所有 container 合计) */
  scrollEvents: number;
  /** Sprint 13: window内 hover_dwell 触发次数 */
  hoverDwellCount: number;
  /** Sprint 13: window内 hover_dwell 停留时长总和,ms */
  totalHoverDwellMs: number;
  /** Sprint 13: 输入后放弃的次数 (typed → dwell → cleared) */
  abandonedInputs: number;
  /** Sprint 13: focus_no_interaction 事件累积的静默时长,ms */
  focusIdleMs: number;
```

Then, just before the `return { ... }` in `aggregate()`, add:

```ts
  // ── Sprint 13 new dims ───────────────────────────────────────────────────
  const scrollEvents = events.filter((e) => e.kind === "scroll").length;

  const hoverDwellEvents = events.filter((e) => e.kind === "hover_dwell");
  const hoverDwellCount = hoverDwellEvents.length;
  const totalHoverDwellMs = hoverDwellEvents.reduce(
    (sum, e) => sum + (e.kind === "hover_dwell" ? e.ms : 0),
    0,
  );

  const abandonedInputs = events.filter(
    (e) => e.kind === "input_dwell_without_submit",
  ).length;

  const focusIdleMs = events
    .filter((e) => e.kind === "focus_no_interaction")
    .reduce((sum, e) => sum + (e.kind === "focus_no_interaction" ? e.sinceMs : 0), 0);
```

Add these 5 keys to the returned object literal (append to the existing `return { ... }`):

```ts
    scrollEvents,
    hoverDwellCount,
    totalHoverDwellMs,
    abandonedInputs,
    focusIdleMs,
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd 音乐播放器/app && pnpm test src/perception/aggregator.test.ts && pnpm typecheck`
Expected: 5 new tests pass; typecheck 0 errors.

- [ ] **Step 5: Commit**

```bash
git -C /Users/daoyu/Documents/my-github/idea add \
  "音乐播放器/app/src/perception/aggregator.ts" \
  "音乐播放器/app/src/perception/aggregator.test.ts"
git -C /Users/daoyu/Documents/my-github/idea commit -m "$(cat <<'EOF'
feat(lyra): extend BehavioralFeatures with 5 Sprint 13 dims

scrollEvents, hoverDwellCount, totalHoverDwellMs, abandonedInputs,
focusIdleMs. Purely additive — existing dims unchanged, existing tests
pass. Old perception_audit snapshots without these fields will read as
undefined; downstream ?? 0 coalescing added in subsequent tasks.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Add 4 tuning thresholds with defaults + ±50% clamp

**Files:**
- Modify: `音乐播放器/app/src/perception/tuning.ts`
- Test: `音乐播放器/app/src/perception/tuning.test.ts`

**Interfaces:**
- Consumes: existing `PerceptionTuning` type and `resolveThresholds()`
- Produces: `PerceptionTuning` gains 4 optional keys: `hoverDwellCountThreshold`, `hoverDwellRatioThreshold`, `abandonedInputsThreshold`, `quietPresenceRatioThreshold`. `resolveThresholds()` supplies defaults `2`, `0.15`, `2`, `0.5` respectively. The ±50% clamp helper applies to all four.

- [ ] **Step 1: Read the existing tuning module**

Read `音乐播放器/app/src/perception/tuning.ts` end-to-end so you know the exact shape of `PerceptionTuning`, `clampTuning` (or equivalent), and `resolveThresholds`. Also read `音乐播放器/app/src/perception/tuning.test.ts` to see the existing test conventions.

- [ ] **Step 2: Write the failing test**

Append to `音乐播放器/app/src/perception/tuning.test.ts`:

```ts
describe("Sprint 13 tuning keys", () => {
  it("resolveThresholds returns defaults 2 / 0.15 / 2 / 0.5 for new keys when tuning is undefined", () => {
    const t = resolveThresholds(undefined);
    expect(t.hoverDwellCountThreshold).toBe(2);
    expect(t.hoverDwellRatioThreshold).toBeCloseTo(0.15);
    expect(t.abandonedInputsThreshold).toBe(2);
    expect(t.quietPresenceRatioThreshold).toBeCloseTo(0.5);
  });

  it("clamps new keys to ±50% of defaults", () => {
    // Way-too-low proposal
    const low = resolveThresholds({
      hoverDwellCountThreshold: 0,
      hoverDwellRatioThreshold: 0.001,
      abandonedInputsThreshold: 0,
      quietPresenceRatioThreshold: 0.05,
    });
    expect(low.hoverDwellCountThreshold).toBe(1);           // 2 * 0.5
    expect(low.hoverDwellRatioThreshold).toBeCloseTo(0.075); // 0.15 * 0.5
    expect(low.abandonedInputsThreshold).toBe(1);
    expect(low.quietPresenceRatioThreshold).toBeCloseTo(0.25);

    // Way-too-high proposal
    const high = resolveThresholds({
      hoverDwellCountThreshold: 999,
      hoverDwellRatioThreshold: 999,
      abandonedInputsThreshold: 999,
      quietPresenceRatioThreshold: 999,
    });
    expect(high.hoverDwellCountThreshold).toBe(3);           // 2 * 1.5
    expect(high.hoverDwellRatioThreshold).toBeCloseTo(0.225); // 0.15 * 1.5
    expect(high.abandonedInputsThreshold).toBe(3);
    expect(high.quietPresenceRatioThreshold).toBeCloseTo(0.75);
  });
});
```

Import list at the top of the test file may need `resolveThresholds` — verify it is already imported from `./tuning`, else add it.

- [ ] **Step 3: Run test to verify it fails**

Run: `cd 音乐播放器/app && pnpm test src/perception/tuning.test.ts`
Expected: TypeScript error (4 new keys unknown on `PerceptionTuning`).

- [ ] **Step 4: Add the 4 keys**

Edit `PerceptionTuning` type in `音乐播放器/app/src/perception/tuning.ts` to include:

```ts
  hoverDwellCountThreshold?: number;
  hoverDwellRatioThreshold?: number;
  abandonedInputsThreshold?: number;
  quietPresenceRatioThreshold?: number;
```

Add these to the `DEFAULTS` (or equivalent constant, name may differ — use whatever `resolveThresholds` already reads from):

```ts
  hoverDwellCountThreshold: 2,
  hoverDwellRatioThreshold: 0.15,
  abandonedInputsThreshold: 2,
  quietPresenceRatioThreshold: 0.5,
```

Add the same 4 keys to the ±50% clamp map so `resolveThresholds` applies the clamp automatically. If the existing clamp logic is a per-key loop over the defaults object, no additional wiring is needed — just adding to `DEFAULTS` is sufficient.

- [ ] **Step 5: Run test to verify it passes**

Run: `cd 音乐播放器/app && pnpm test src/perception/tuning.test.ts && pnpm typecheck`
Expected: 2 new tests pass; existing tests still green; typecheck 0 errors.

- [ ] **Step 6: Commit**

```bash
git -C /Users/daoyu/Documents/my-github/idea add \
  "音乐播放器/app/src/perception/tuning.ts" \
  "音乐播放器/app/src/perception/tuning.test.ts"
git -C /Users/daoyu/Documents/my-github/idea commit -m "$(cat <<'EOF'
feat(lyra): 4 tuning thresholds for Sprint 13 rules

hoverDwellCountThreshold=2, hoverDwellRatioThreshold=0.15,
abandonedInputsThreshold=2, quietPresenceRatioThreshold=0.5. All go
through the existing ±50% clamp Reflect proposals must respect.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Add 3 new rules to `RulePerceptionAgent`

**Files:**
- Modify: `音乐播放器/app/src/perception/RulePerceptionAgent.ts`
- Test: `音乐播放器/app/src/perception/RulePerceptionAgent.test.ts`

**Interfaces:**
- Consumes: `BehavioralFeatures` (with 5 new dims from Task 2), `PerceptionTuning` (with 4 new thresholds from Task 3), existing `Rule`, `PerceptionBias`
- Produces: rules array grows from 5 to 8 with `attentive_hover`, `hesitant_input`, `quiet_presence`

- [ ] **Step 1: Write the failing tests**

Append to `音乐播放器/app/src/perception/RulePerceptionAgent.test.ts`. Use whatever `makeFeatures()` helper or literal object the existing tests use to construct a `BehavioralFeatures`; add explicit values for the 5 new dims:

```ts
describe("Sprint 13 rules", () => {
  const baseF = {
    windowMs: 60_000,
    activeMs: 0,
    submits: 0,
    avgSubmitGapMs: NaN,
    totalChars: 0,
    skips: 0,
    completions: 0,
    skipRatio: 0,
    proactiveDismisses: 0,
    isBlurred: false,
    scrollEvents: 0,
    hoverDwellCount: 0,
    totalHoverDwellMs: 0,
    abandonedInputs: 0,
    focusIdleMs: 0,
  };

  it("attentive_hover fires when hoverDwellCount >= threshold", async () => {
    const agent = new RulePerceptionAgent();
    const bias = await agent.infer({ ...baseF, hoverDwellCount: 3 });
    expect(bias.reason).toContain("hover dwell");
    expect(bias.pad_bias.p).toBeGreaterThan(0);
  });

  it("attentive_hover also fires when hoverDwellRatio triggers", async () => {
    const agent = new RulePerceptionAgent();
    const bias = await agent.infer({
      ...baseF,
      hoverDwellCount: 1,
      totalHoverDwellMs: 12000, // 12000/60000 = 0.20 > 0.15
    });
    expect(bias.reason).toContain("hover dwell");
  });

  it("hesitant_input fires when abandonedInputs >= threshold; pushes P/A/D negative", async () => {
    const agent = new RulePerceptionAgent();
    const bias = await agent.infer({ ...baseF, abandonedInputs: 3 });
    expect(bias.reason).toContain("hesitation");
    expect(bias.pad_bias.p).toBeLessThan(0);
    expect(bias.pad_bias.a).toBeLessThan(0);
    expect(bias.pad_bias.d).toBeLessThan(0);
  });

  it("quiet_presence fires only when in-room (not blurred) AND focusIdleMs/windowMs>0.5 AND activeMs low", async () => {
    const agent = new RulePerceptionAgent();
    const fires = await agent.infer({
      ...baseF,
      focusIdleMs: 35_000, // 35/60 = 0.58 > 0.5
      activeMs: 3_000, // 3/60 = 0.05 < 0.1
    });
    expect(fires.reason).toContain("quiet presence");

    const noFire = await agent.infer({
      ...baseF,
      isBlurred: true,
      focusIdleMs: 40_000,
      activeMs: 0,
    });
    expect(noFire.reason).not.toContain("quiet presence");
  });

  it("multiple new rules fire together, confidence-weighted average is used", async () => {
    const agent = new RulePerceptionAgent();
    const bias = await agent.infer({
      ...baseF,
      hoverDwellCount: 3,
      abandonedInputs: 3,
      focusIdleMs: 40_000,
      activeMs: 2_000,
    });
    // three new rules should all be in the reason chain
    expect(bias.reason).toContain("hover dwell");
    expect(bias.reason).toContain("hesitation");
    expect(bias.reason).toContain("quiet presence");
    // confidence is a positive number capped at 1
    expect(bias.confidence).toBeGreaterThan(0);
    expect(bias.confidence).toBeLessThanOrEqual(1);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd 音乐播放器/app && pnpm test src/perception/RulePerceptionAgent.test.ts`
Expected: 5 new tests fail (`reason` is `"no signal"` because no rule matches yet).

- [ ] **Step 3: Add the 3 new rules**

In `音乐播放器/app/src/perception/RulePerceptionAgent.ts`, inside `buildRules(t)`, append three entries to the returned array (in order shown below, keeping the existing 5 first):

```ts
    {
      name: "attentive_hover",
      test: (f) =>
        (f.hoverDwellCount ?? 0) >= t.hoverDwellCountThreshold ||
        (f.totalHoverDwellMs ?? 0) / f.windowMs > t.hoverDwellRatioThreshold,
      pad_bias: { p: 0.1, a: 0.05, d: 0 },
      confidence: 0.4,
      reason: "hover dwell suggests attention to ambient",
    },
    {
      name: "hesitant_input",
      test: (f) => (f.abandonedInputs ?? 0) >= t.abandonedInputsThreshold,
      pad_bias: { p: -0.1, a: -0.1, d: -0.15 },
      confidence: 0.5,
      reason: "typed-then-discarded suggests hesitation",
    },
    {
      name: "quiet_presence",
      test: (f) =>
        !f.isBlurred &&
        (f.focusIdleMs ?? 0) / f.windowMs > t.quietPresenceRatioThreshold &&
        f.activeMs / f.windowMs < 0.1,
      pad_bias: { p: 0.05, a: -0.2, d: 0 },
      confidence: 0.6,
      reason: "in the room, listening — quiet presence",
    },
```

Note the `?? 0` guards handle any `BehavioralFeatures` snapshot loaded from `perception_audit` before this sprint that lacks the new fields.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd 音乐播放器/app && pnpm test src/perception/ && pnpm typecheck`
Expected: all 5 new tests pass; old 5-rule tests still green; typecheck 0 errors.

- [ ] **Step 5: Commit**

```bash
git -C /Users/daoyu/Documents/my-github/idea add \
  "音乐播放器/app/src/perception/RulePerceptionAgent.ts" \
  "音乐播放器/app/src/perception/RulePerceptionAgent.test.ts"
git -C /Users/daoyu/Documents/my-github/idea commit -m "$(cat <<'EOF'
feat(lyra): 3 new perception rules for Sprint 13

attentive_hover (p+/a+), hesitant_input (p-/a-/d-), quiet_presence
(p+ / a- — the核心「禅」signal). All use ?? 0 guards on the new
BehavioralFeatures dims so old perception_audit snapshots don't crash
downstream loaders.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Create `coarsening.ts` — pure level-string mapper

**Files:**
- Create: `音乐播放器/app/src/perception/coarsening.ts`
- Test: `音乐播放器/app/src/perception/coarsening.test.ts`

**Interfaces:**
- Consumes: `BehavioralFeatures` from `./aggregator`
- Produces: `coarsen(f: BehavioralFeatures) → CoarseSignals` with 4 keys `hover_attention`, `input_hesitation`, `quiet_presence`, `scroll_activity`; types `CoarseLevel = "low"|"medium"|"high"` and `HesitationLevel = "none"|"some"|"many"`.

- [ ] **Step 1: Write the failing test**

Create `音乐播放器/app/src/perception/coarsening.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { coarsen } from "./coarsening";
import type { BehavioralFeatures } from "./aggregator";

const base: BehavioralFeatures = {
  windowMs: 60_000,
  activeMs: 0,
  submits: 0,
  avgSubmitGapMs: NaN,
  totalChars: 0,
  skips: 0,
  completions: 0,
  skipRatio: 0,
  proactiveDismisses: 0,
  isBlurred: false,
  scrollEvents: 0,
  hoverDwellCount: 0,
  totalHoverDwellMs: 0,
  abandonedInputs: 0,
  focusIdleMs: 0,
};

describe("coarsen", () => {
  it("hover_attention buckets 0-1 low, 2-4 medium, 5+ high", () => {
    expect(coarsen({ ...base, hoverDwellCount: 0 }).hover_attention).toBe("low");
    expect(coarsen({ ...base, hoverDwellCount: 1 }).hover_attention).toBe("low");
    expect(coarsen({ ...base, hoverDwellCount: 2 }).hover_attention).toBe("medium");
    expect(coarsen({ ...base, hoverDwellCount: 4 }).hover_attention).toBe("medium");
    expect(coarsen({ ...base, hoverDwellCount: 5 }).hover_attention).toBe("high");
  });

  it("input_hesitation buckets 0 none, 1-2 some, 3+ many", () => {
    expect(coarsen({ ...base, abandonedInputs: 0 }).input_hesitation).toBe("none");
    expect(coarsen({ ...base, abandonedInputs: 1 }).input_hesitation).toBe("some");
    expect(coarsen({ ...base, abandonedInputs: 2 }).input_hesitation).toBe("some");
    expect(coarsen({ ...base, abandonedInputs: 3 }).input_hesitation).toBe("many");
  });

  it("quiet_presence buckets focusIdleMs/windowMs at 0.2 and 0.5", () => {
    expect(coarsen({ ...base, focusIdleMs: 0 }).quiet_presence).toBe("low");
    expect(coarsen({ ...base, focusIdleMs: 12_000 }).quiet_presence).toBe("medium"); // 0.20
    expect(coarsen({ ...base, focusIdleMs: 20_000 }).quiet_presence).toBe("medium");
    expect(coarsen({ ...base, focusIdleMs: 30_000 }).quiet_presence).toBe("high"); // 0.50
    expect(coarsen({ ...base, focusIdleMs: 45_000 }).quiet_presence).toBe("high");
  });

  it("scroll_activity buckets 0-2 low, 3-9 medium, 10+ high", () => {
    expect(coarsen({ ...base, scrollEvents: 0 }).scroll_activity).toBe("low");
    expect(coarsen({ ...base, scrollEvents: 3 }).scroll_activity).toBe("medium");
    expect(coarsen({ ...base, scrollEvents: 9 }).scroll_activity).toBe("medium");
    expect(coarsen({ ...base, scrollEvents: 10 }).scroll_activity).toBe("high");
  });

  it("handles zero windowMs by treating quiet_presence as 'low' (not NaN/crash)", () => {
    expect(coarsen({ ...base, windowMs: 0, focusIdleMs: 999 }).quiet_presence).toBe("low");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd 音乐播放器/app && pnpm test src/perception/coarsening.test.ts`
Expected: import fails — module does not exist yet.

- [ ] **Step 3: Create the coarsening module**

Create `音乐播放器/app/src/perception/coarsening.ts`:

```ts
// perception/coarsening.ts — level-string mapper for LLMPerceptionAgent input.
//
// Only the 4 new Sprint 13 dims are coarsened. The 10 pre-Sprint-13 dims stay
// numeric because LLMPerceptionAgent's prompt was tuned against those. This
// module exists solely to honor the website PRIVACY promise: raw new-dim
// counts never leave the local process over the network.

import type { BehavioralFeatures } from "./aggregator";

export type CoarseLevel = "low" | "medium" | "high";
export type HesitationLevel = "none" | "some" | "many";

export type CoarseSignals = {
  hover_attention: CoarseLevel;
  input_hesitation: HesitationLevel;
  quiet_presence: CoarseLevel;
  scroll_activity: CoarseLevel;
};

function bucket(value: number, [mid, hi]: [number, number]): CoarseLevel {
  if (!Number.isFinite(value) || value < mid) return "low";
  if (value < hi) return "medium";
  return "high";
}

function bucketHesitation(value: number): HesitationLevel {
  if (value <= 0) return "none";
  if (value < 3) return "some";
  return "many";
}

export function coarsen(f: BehavioralFeatures): CoarseSignals {
  const quietRatio =
    f.windowMs > 0 ? (f.focusIdleMs ?? 0) / f.windowMs : 0;
  return {
    hover_attention: bucket(f.hoverDwellCount ?? 0, [2, 5]),
    input_hesitation: bucketHesitation(f.abandonedInputs ?? 0),
    quiet_presence: bucket(quietRatio, [0.2, 0.5]),
    scroll_activity: bucket(f.scrollEvents ?? 0, [3, 10]),
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd 音乐播放器/app && pnpm test src/perception/coarsening.test.ts && pnpm typecheck`
Expected: 5 tests pass; typecheck 0 errors.

- [ ] **Step 5: Commit**

```bash
git -C /Users/daoyu/Documents/my-github/idea add \
  "音乐播放器/app/src/perception/coarsening.ts" \
  "音乐播放器/app/src/perception/coarsening.test.ts"
git -C /Users/daoyu/Documents/my-github/idea commit -m "$(cat <<'EOF'
feat(lyra): coarsen() maps 4 new dims to level strings

Only the Sprint 13 dims are coarsened; the pre-existing 10 dims that
LLMPerceptionAgent has always seen stay numeric to preserve prompt
tuning. This module is the single choke-point that lets us honor the
website PRIVACY promise without changing RulePerceptionAgent's
numeric inputs.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: Wire `coarsen()` into `LLMPerceptionAgent` prompt

**Files:**
- Modify: `音乐播放器/app/src/perception/LLMPerceptionAgent.ts`
- Modify: `音乐播放器/app/src/perception/prompt.ts` (add doc comment describing the 4 signal keys)
- Test: `音乐播放器/app/src/perception/LLMPerceptionAgent.test.ts`

**Interfaces:**
- Consumes: `BehavioralFeatures` (Task 2), `coarsen()` (Task 5), existing LLMPerceptionAgent chat provider mock in tests
- Produces: the JSON payload passed to the LLM now has shape `{ features: <10 legacy numeric dims>, signals: CoarseSignals }`. Legacy numeric field names in `features` unchanged.

- [ ] **Step 1: Read the existing LLMPerceptionAgent**

Read `音乐播放器/app/src/perception/LLMPerceptionAgent.ts` and `prompt.ts` to identify:
1. Exactly where the payload JSON is built (likely `JSON.stringify` somewhere)
2. Whether all 10 legacy numeric dims are inlined, or the whole `features` object is dumped
3. The existing test mock pattern in `LLMPerceptionAgent.test.ts`

- [ ] **Step 2: Write the failing test**

Append to `音乐播放器/app/src/perception/LLMPerceptionAgent.test.ts` a case that captures the outgoing chat request and asserts the shape:

```ts
it("payload contains signals block with 4 coarse levels; new numeric dims NOT sent verbatim", async () => {
  const captured: any[] = [];
  const provider = {
    async chat(messages: any) {
      captured.push(messages);
      return {
        content: JSON.stringify({
          pad_bias: { p: 0, a: 0, d: 0 },
          confidence: 0.3,
          reason: "test",
        }),
      };
    },
  };
  const agent = new LLMPerceptionAgent(provider as any);
  await agent.infer({
    windowMs: 60_000,
    activeMs: 5_000,
    submits: 2,
    avgSubmitGapMs: 12_000,
    totalChars: 20,
    skips: 1,
    completions: 5,
    skipRatio: 0.16,
    proactiveDismisses: 0,
    isBlurred: false,
    scrollEvents: 12,
    hoverDwellCount: 4,
    totalHoverDwellMs: 15000,
    abandonedInputs: 1,
    focusIdleMs: 40_000,
  });

  // Serialise the outgoing prompt to inspect it as text
  const promptText = JSON.stringify(captured[0]);

  // Signals block present with expected coarse levels
  expect(promptText).toContain('"signals"');
  expect(promptText).toContain('"hover_attention":"medium"');
  expect(promptText).toContain('"input_hesitation":"some"');
  expect(promptText).toContain('"quiet_presence":"high"');
  expect(promptText).toContain('"scroll_activity":"high"');

  // Raw new-dim numeric values MUST NOT leak
  expect(promptText).not.toContain('"hoverDwellCount"');
  expect(promptText).not.toContain('"abandonedInputs"');
  expect(promptText).not.toContain('"focusIdleMs"');
  expect(promptText).not.toContain('"scrollEvents"');
  expect(promptText).not.toContain('"totalHoverDwellMs"');
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd 音乐播放器/app && pnpm test src/perception/LLMPerceptionAgent.test.ts`
Expected: the new assertions fail (raw dims currently sent as-is via the whole `features` object; no `signals` block yet).

- [ ] **Step 4: Modify the payload construction**

In `LLMPerceptionAgent.ts`:

1. Add the import: `import { coarsen } from "./coarsening";`
2. Locate the payload-construction site (search for `JSON.stringify` or a `content:` string containing `features`).
3. Where the current code sends the entire `features` object, split it into a legacy-only object plus a `signals` block. The 5 new dims must be dropped from the numeric side. Example:

```ts
const legacyFeatures = {
  windowMs: features.windowMs,
  activeMs: features.activeMs,
  submits: features.submits,
  avgSubmitGapMs: features.avgSubmitGapMs,
  totalChars: features.totalChars,
  skips: features.skips,
  completions: features.completions,
  skipRatio: features.skipRatio,
  proactiveDismisses: features.proactiveDismisses,
  isBlurred: features.isBlurred,
};
const signals = coarsen(features);
const payload = { features: legacyFeatures, signals };
```

Replace whatever previously fed `features` directly with `payload`.

- [ ] **Step 5: Update `prompt.ts` doc comment**

Add to the system prompt in `prompt.ts` — right after the section that documents the numeric `features` fields — a short block describing the 4 signal levels:

```
`signals` 是 4 个粗化维度（只发级别、不发数值，保护用户隐私）：
- hover_attention: 用户在专辑封面/歌词轨迹等氛围元素上驻留的强度
- input_hesitation: 用户打字后又清空、欲言又止的次数
- quiet_presence: 窗口在场但用户完全不动的比例——"在同一个房间里安静地坐着"
- scroll_activity: 用户在 Data Explorer/Roadmap 里翻阅她的记忆/想法的强度
```

- [ ] **Step 6: Run tests to verify pass**

Run: `cd 音乐播放器/app && pnpm test src/perception/ && pnpm typecheck`
Expected: all perception tests green; typecheck 0 errors.

- [ ] **Step 7: Commit**

```bash
git -C /Users/daoyu/Documents/my-github/idea add \
  "音乐播放器/app/src/perception/LLMPerceptionAgent.ts" \
  "音乐播放器/app/src/perception/LLMPerceptionAgent.test.ts" \
  "音乐播放器/app/src/perception/prompt.ts"
git -C /Users/daoyu/Documents/my-github/idea commit -m "$(cat <<'EOF'
feat(lyra): LLMPerceptionAgent sends coarse signals, not raw new dims

Payload shape becomes { features: <10 legacy numeric dims>, signals:
CoarseSignals }. The 5 new Sprint 13 dims never leave the local process
as numbers — coarsen() runs at the network egress point. Prompt gains
a doc block describing the 4 signal categories for the model.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: Extend `install.ts` with scroll / hover_dwell / focus_no_interaction listeners

**Files:**
- Modify: `音乐播放器/app/src/perception/install.ts`
- Test: `音乐播放器/app/src/perception/install.test.ts`

**Interfaces:**
- Consumes: `EventBus` (with new kinds from Task 1)
- Produces: `installPerceptionListeners(bus, deps)` now also attaches:
  - `document`-level `scroll` (capture, passive) → emits `scroll` throttled 500ms per container based on `[data-lyra-scroll]` attribute
  - `document`-level `mouseover`/`mouseout` (capture) → per-target `setTimeout` 3000ms, emits `hover_dwell` on timeout
  - 30-second `setInterval` poll on `deps.now` — emits `focus_no_interaction` when: focused && !blurred && `now - lastInteractionAt > 180_000` && not already fired this idle period. Re-arms on next mouse/key event.

The existing focus/blur/mouse/key throttle behavior remains untouched. The `deps` shape is extended:

```ts
type InstallDeps = {
  win?: Pick<Window, "addEventListener" | "removeEventListener">;
  doc?: Pick<Document, "addEventListener" | "removeEventListener">;
  now?: () => number;
  setTimeout?: (fn: () => void, ms: number) => number;
  clearTimeout?: (id: number) => void;
  setInterval?: (fn: () => void, ms: number) => number;
  clearInterval?: (id: number) => void;
};
```

- [ ] **Step 1: Read existing install.ts + install.test.ts**

Understand:
1. How `deps.win` is currently mocked in tests
2. How the throttle map is shared
3. Which timer fns are used (real vs vitest fake timers)

- [ ] **Step 2: Write 3 failing tests**

Append to `音乐播放器/app/src/perception/install.test.ts`. Use `vi.useFakeTimers()` and a fake `document` mock analogous to the existing `win` mock:

```ts
describe("Sprint 13 install additions", () => {
  it("scroll events on data-lyra-scroll containers emit scroll with container tag", () => {
    const bus = new EventBus();
    const handlers: Record<string, any> = {};
    const doc = {
      addEventListener: (name: string, fn: any) => (handlers[name] = fn),
      removeEventListener: () => {},
    };
    const win = {
      addEventListener: () => {},
      removeEventListener: () => {},
    };
    installPerceptionListeners(bus, { win, doc, now: () => 1000 } as any);
    const target = { closest: (sel: string) => sel === '[data-lyra-scroll]' ? { getAttribute: () => "data_explorer" } : null };
    handlers.scroll({ target, deltaY: 100 } as any);
    const recent = bus.recent(10_000, 5000);
    expect(recent.find((e) => e.kind === "scroll")?.kind).toBe("scroll");
    expect((recent.find((e) => e.kind === "scroll") as any).container).toBe("data_explorer");
  });

  it("hover on data-lyra-hover fires hover_dwell after 3000ms if not left", () => {
    vi.useFakeTimers();
    const bus = new EventBus();
    const handlers: Record<string, any> = {};
    const doc = {
      addEventListener: (name: string, fn: any) => (handlers[name] = fn),
      removeEventListener: () => {},
    };
    const win = { addEventListener: () => {}, removeEventListener: () => {} };
    installPerceptionListeners(bus, { win, doc, now: () => Date.now() } as any);

    const enterTarget = { closest: (sel: string) => sel === '[data-lyra-hover]' ? { getAttribute: () => "album_cover" } : null };
    handlers.mouseover({ target: enterTarget } as any);
    vi.advanceTimersByTime(2999);
    expect(bus.recent(10_000).find((e) => e.kind === "hover_dwell")).toBeUndefined();
    vi.advanceTimersByTime(2);
    const hover = bus.recent(10_000).find((e) => e.kind === "hover_dwell") as any;
    expect(hover?.kind).toBe("hover_dwell");
    expect(hover.target).toBe("album_cover");
    vi.useRealTimers();
  });

  it("focus_no_interaction fires after 3min focused with no mouse/key, re-arms after interaction", () => {
    vi.useFakeTimers();
    const bus = new EventBus();
    let currentTime = 0;
    const winHandlers: Record<string, any> = {};
    const win = {
      addEventListener: (name: string, fn: any) => (winHandlers[name] = fn),
      removeEventListener: () => {},
    };
    const doc = { addEventListener: () => {}, removeEventListener: () => {} };
    installPerceptionListeners(bus, { win, doc, now: () => currentTime } as any);

    winHandlers.focus?.({} as any);
    currentTime = 181_000;
    vi.advanceTimersByTime(30_000); // trigger poll interval
    let evs = bus.recent(300_000).filter((e) => e.kind === "focus_no_interaction");
    expect(evs.length).toBe(1);

    // idle poll again should NOT re-fire without new interaction
    currentTime = 210_000;
    vi.advanceTimersByTime(30_000);
    evs = bus.recent(300_000).filter((e) => e.kind === "focus_no_interaction");
    expect(evs.length).toBe(1);

    // new mouse/key interaction re-arms
    winHandlers.mousemove?.({} as any);
    currentTime = 500_000;
    vi.advanceTimersByTime(30_000);
    evs = bus.recent(600_000).filter((e) => e.kind === "focus_no_interaction");
    expect(evs.length).toBe(2);
    vi.useRealTimers();
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd 音乐播放器/app && pnpm test src/perception/install.test.ts`
Expected: 3 new tests fail; the module doesn't yet know about `deps.doc`, does not emit `scroll` / `hover_dwell` / `focus_no_interaction`.

- [ ] **Step 4: Extend `installPerceptionListeners`**

In `音乐播放器/app/src/perception/install.ts`, extend `InstallDeps`:

```ts
type InstallDeps = {
  win?: Pick<Window, "addEventListener" | "removeEventListener">;
  doc?: Pick<Document, "addEventListener" | "removeEventListener">;
  now?: () => number;
  setTimeout?: (fn: () => void, ms: number) => number;
  clearTimeout?: (id: number) => void;
  setInterval?: (fn: () => void, ms: number) => number;
  clearInterval?: (id: number) => void;
};
```

Inside `installPerceptionListeners`, after resolving `win` and `clock`, add:

```ts
  const doc = deps.doc ?? (typeof document !== "undefined" ? document : undefined);
  const st = deps.setTimeout ?? ((fn, ms) => setTimeout(fn, ms) as unknown as number);
  const ct = deps.clearTimeout ?? ((id) => clearTimeout(id as unknown as ReturnType<typeof setTimeout>));
  const si = deps.setInterval ?? ((fn, ms) => setInterval(fn, ms) as unknown as number);
  const ci = deps.clearInterval ?? ((id) => clearInterval(id as unknown as ReturnType<typeof setInterval>));

  // ── scroll listener (capture, per-container throttle) ────────────────────
  const scrollLastEmit: Partial<Record<string, number>> = {};
  const onScroll = (e: Event) => {
    const container = extractContainer(e.target);
    if (!container) return;
    const at = clock();
    if (at - (scrollLastEmit[container] ?? 0) < THROTTLE_MS) return;
    scrollLastEmit[container] = at;
    bus.emit({
      kind: "scroll",
      at,
      container: container as "data_explorer" | "roadmap" | "other",
      direction: "down", // direction dropped by design (see spec §5, §6)
    });
  };
  doc?.addEventListener("scroll", onScroll as any, { capture: true, passive: true } as any);

  // ── hover_dwell listener (capture, per-target setTimeout 3000ms) ─────────
  const dwellTimers = new Map<string, number>();
  const onMouseOver = (e: any) => {
    const target = extractHoverTarget(e.target);
    if (!target) return;
    if (dwellTimers.has(target)) return; // already timing
    const start = clock();
    const id = st(() => {
      bus.emit({ kind: "hover_dwell", at: clock(), target: target as any, ms: clock() - start });
      dwellTimers.delete(target);
    }, HOVER_DWELL_MS);
    dwellTimers.set(target, id);
  };
  const onMouseOut = (e: any) => {
    const target = extractHoverTarget(e.target);
    if (!target) return;
    const id = dwellTimers.get(target);
    if (id != null) {
      ct(id);
      dwellTimers.delete(target);
    }
  };
  doc?.addEventListener("mouseover", onMouseOver as any, true);
  doc?.addEventListener("mouseout", onMouseOut as any, true);

  // ── focus_no_interaction poll every 30s ──────────────────────────────────
  let lastInteractionAt = clock();
  let currentlyFocused = true;
  let currentlyBlurred = false;
  let firedForThisIdle = false;

  // Piggy-back on existing focus/blur/mouse/key hooks by wrapping them:
  const origFocus = onFocus, origBlur = onBlur, origMouseMove = onMouseMove, origKeyDown = onKeyDown;
  const trackFocus = () => { currentlyFocused = true; currentlyBlurred = false; origFocus(); };
  const trackBlur = () => { currentlyFocused = false; currentlyBlurred = true; origBlur(); };
  const trackInteraction = (base: () => void) => () => {
    lastInteractionAt = clock();
    firedForThisIdle = false;
    base();
  };
```

Replace the existing `win.addEventListener("focus", onFocus)` etc. calls further down with the wrapped versions:

```ts
  win.addEventListener("focus", trackFocus);
  win.addEventListener("blur", trackBlur);
  win.addEventListener("mousemove", trackInteraction(origMouseMove));
  win.addEventListener("keydown", trackInteraction(origKeyDown));
```

Add the idle poll:

```ts
  const idlePollId = si(() => {
    if (!currentlyFocused || currentlyBlurred) return;
    const sinceMs = clock() - lastInteractionAt;
    if (sinceMs < FOCUS_IDLE_MS) return;
    if (firedForThisIdle) return;
    bus.emit({ kind: "focus_no_interaction", at: clock(), sinceMs });
    firedForThisIdle = true;
  }, IDLE_POLL_MS);
```

Add these constants near `THROTTLE_MS`:

```ts
const HOVER_DWELL_MS = 3000;
const FOCUS_IDLE_MS = 180_000;
const IDLE_POLL_MS = 30_000;
```

Add helpers at file bottom:

```ts
function extractContainer(target: EventTarget | null): string | null {
  const el = target as (Element | null);
  const found = el?.closest?.("[data-lyra-scroll]") ?? null;
  return found ? found.getAttribute("data-lyra-scroll") : null;
}

function extractHoverTarget(target: EventTarget | null): string | null {
  const el = target as (Element | null);
  const found = el?.closest?.("[data-lyra-hover]") ?? null;
  return found ? found.getAttribute("data-lyra-hover") : null;
}
```

Extend the returned uninstall function to also `removeEventListener` on `doc` and `clearInterval(idlePollId)`; and clear any lingering dwell timers.

- [ ] **Step 5: Run tests to verify pass**

Run: `cd 音乐播放器/app && pnpm test src/perception/install.test.ts && pnpm test src/perception/ && pnpm typecheck`
Expected: 3 new tests pass; existing install tests still green; typecheck 0 errors.

- [ ] **Step 6: Commit**

```bash
git -C /Users/daoyu/Documents/my-github/idea add \
  "音乐播放器/app/src/perception/install.ts" \
  "音乐播放器/app/src/perception/install.test.ts"
git -C /Users/daoyu/Documents/my-github/idea commit -m "$(cat <<'EOF'
feat(lyra): install layer emits scroll / hover_dwell / focus_no_interaction

Uses [data-lyra-scroll] and [data-lyra-hover] attributes to attach
signals to specific components without touching each component's
logic. hover_dwell uses per-target setTimeout 3000ms (leaves clear
timer). focus_no_interaction polls every 30s with fire-once-per-idle
guard that re-arms on any new mouse/key event.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: Create `useInputDwellBus` hook + wire into `InputBox`

**Files:**
- Create: `音乐播放器/app/src/perception/useInputDwellBus.ts`
- Create: `音乐播放器/app/src/perception/useInputDwellBus.test.tsx`
- Modify: `音乐播放器/app/src/home/InputBox.tsx`
- Modify: `音乐播放器/app/src/home/InputBox.test.tsx`

**Interfaces:**
- Consumes: `EventBus` (Task 1 kinds)
- Produces: `useInputDwellBus(bus: EventBus, value: string): { notifySubmit: () => void }` — call it once from InputBox; the hook watches `value` transitions via `useEffect` and returns a `notifySubmit` callback the parent invokes on Enter.

- [ ] **Step 1: Write the failing hook test**

Create `音乐播放器/app/src/perception/useInputDwellBus.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { EventBus } from "./events";
import { useInputDwellBus } from "./useInputDwellBus";

describe("useInputDwellBus", () => {
  it("submit path emits no input_dwell_without_submit", () => {
    vi.useFakeTimers();
    const bus = new EventBus();
    const { result, rerender } = renderHook(({ v }) => useInputDwellBus(bus, v), {
      initialProps: { v: "" },
    });
    rerender({ v: "hi" });
    vi.advanceTimersByTime(12000);
    act(() => result.current.notifySubmit());
    rerender({ v: "" });
    expect(bus.recent(60_000).filter((e) => e.kind === "input_dwell_without_submit").length).toBe(0);
    vi.useRealTimers();
  });

  it("type then dwell 10s+ then clear emits input_dwell_without_submit", () => {
    vi.useFakeTimers();
    const bus = new EventBus();
    const { rerender } = renderHook(({ v }) => useInputDwellBus(bus, v), {
      initialProps: { v: "" },
    });
    rerender({ v: "half thought" });
    vi.advanceTimersByTime(10_001); // exceed 10s dwell threshold
    rerender({ v: "" }); // cleared without submit
    const emitted = bus.recent(60_000).filter((e) => e.kind === "input_dwell_without_submit");
    expect(emitted.length).toBe(1);
    expect((emitted[0] as any).charsTyped).toBe(12);
    vi.useRealTimers();
  });

  it("type → dwell 10s+ → keep typing does NOT emit; subsequent clear also does not (state returned to TYPING)", () => {
    vi.useFakeTimers();
    const bus = new EventBus();
    const { rerender } = renderHook(({ v }) => useInputDwellBus(bus, v), {
      initialProps: { v: "" },
    });
    rerender({ v: "hesitating" });
    vi.advanceTimersByTime(10_001);
    rerender({ v: "hesitating more" });
    rerender({ v: "" });
    expect(bus.recent(60_000).filter((e) => e.kind === "input_dwell_without_submit").length).toBe(0);
    vi.useRealTimers();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd 音乐播放器/app && pnpm test src/perception/useInputDwellBus.test.tsx`
Expected: import fails — hook not defined.

- [ ] **Step 3: Implement the hook**

Create `音乐播放器/app/src/perception/useInputDwellBus.ts`:

```ts
// perception/useInputDwellBus.ts — state machine for "typed then abandoned".
//
// State machine:
//   IDLE ──value grows from empty──▶ TYPING (start 10s dwell timer, track chars)
//   TYPING ──value changes──▶ TYPING (reset timer, refresh chars)
//   TYPING ──timer expires──▶ DWELLING
//   DWELLING ──value grows──▶ TYPING
//   DWELLING ──value cleared (== "")──▶ emit → IDLE
//   TYPING ──notifySubmit()──▶ IDLE (no emit)

import { useEffect, useRef, useCallback } from "react";
import type { EventBus } from "./events";

const DWELL_MS = 10_000;

type State = "IDLE" | "TYPING" | "DWELLING";

export function useInputDwellBus(bus: EventBus, value: string) {
  const stateRef = useRef<State>("IDLE");
  const charsRef = useRef(0);
  const dwellStartRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimer = () => {
    if (timerRef.current != null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  const armDwellTimer = useCallback(() => {
    clearTimer();
    timerRef.current = setTimeout(() => {
      stateRef.current = "DWELLING";
      dwellStartRef.current = Date.now();
    }, DWELL_MS);
  }, []);

  useEffect(() => {
    const len = value.length;
    const state = stateRef.current;

    if (state === "IDLE") {
      if (len > 0) {
        stateRef.current = "TYPING";
        charsRef.current = len;
        armDwellTimer();
      }
      return;
    }

    if (state === "TYPING") {
      if (len === 0) {
        // user cleared before timer expired — treat as IDLE, no emit
        clearTimer();
        stateRef.current = "IDLE";
        return;
      }
      // still typing / editing — refresh timer + chars
      charsRef.current = len;
      armDwellTimer();
      return;
    }

    // state === "DWELLING"
    if (len === 0) {
      bus.emit({
        kind: "input_dwell_without_submit",
        at: Date.now(),
        charsTyped: charsRef.current,
        dwellMs: Date.now() - dwellStartRef.current,
      });
      stateRef.current = "IDLE";
      return;
    }
    // typing resumed — back to TYPING and re-arm
    stateRef.current = "TYPING";
    charsRef.current = len;
    armDwellTimer();
  }, [value, bus, armDwellTimer]);

  useEffect(() => () => clearTimer(), []);

  const notifySubmit = useCallback(() => {
    clearTimer();
    stateRef.current = "IDLE";
    charsRef.current = 0;
  }, []);

  return { notifySubmit };
}
```

- [ ] **Step 4: Run hook tests to verify they pass**

Run: `cd 音乐播放器/app && pnpm test src/perception/useInputDwellBus.test.tsx`
Expected: 3 tests pass.

- [ ] **Step 5: Wire into `InputBox`**

Edit `音乐播放器/app/src/home/InputBox.tsx`. Add prop for the bus:

```tsx
import { useInputDwellBus } from "../perception/useInputDwellBus";
import { bus as perceptionBus } from "../perception/events";
```

Inside the `InputBox` function body, right after the `useState`:

```tsx
  const { notifySubmit } = useInputDwellBus(perceptionBus, value);
```

Inside the existing `handleKey` `if (!text) return;` guard, after `onSubmit(text)`, call `notifySubmit()`:

```tsx
      onSubmit(text);
      notifySubmit();
      setValue("");
```

- [ ] **Step 6: Write failing InputBox integration test**

Append to `音乐播放器/app/src/home/InputBox.test.tsx`:

```tsx
import { bus as perceptionBus } from "../perception/events";

it("emits input_dwell_without_submit on type → dwell → clear (no submit)", async () => {
  vi.useFakeTimers();
  const before = perceptionBus.recent(60_000).length;
  const { getByTestId, rerender } = render(<InputBox onSubmit={() => {}} />);
  const ta = getByTestId("lyra-input") as HTMLTextAreaElement;
  fireEvent.change(ta, { target: { value: "considering it" } });
  vi.advanceTimersByTime(10_001);
  fireEvent.change(ta, { target: { value: "" } });
  const after = perceptionBus.recent(60_000);
  const emitted = after.filter((e) => e.kind === "input_dwell_without_submit");
  expect(emitted.length).toBeGreaterThanOrEqual(1);
  vi.useRealTimers();
});
```

Adjust `render` / import to match what `InputBox.test.tsx` already uses (likely `@testing-library/react`). If the file uses a module-scoped singleton bus and tests run in parallel with other InputBox tests, wrap the state with `beforeEach` to snapshot `bus.recent(0)` count.

- [ ] **Step 7: Run full perception + InputBox tests**

Run: `cd 音乐播放器/app && pnpm test src/perception/ src/home/InputBox && pnpm typecheck`
Expected: all green; typecheck 0 errors.

- [ ] **Step 8: Commit**

```bash
git -C /Users/daoyu/Documents/my-github/idea add \
  "音乐播放器/app/src/perception/useInputDwellBus.ts" \
  "音乐播放器/app/src/perception/useInputDwellBus.test.tsx" \
  "音乐播放器/app/src/home/InputBox.tsx" \
  "音乐播放器/app/src/home/InputBox.test.tsx"
git -C /Users/daoyu/Documents/my-github/idea commit -m "$(cat <<'EOF'
feat(lyra): useInputDwellBus hook + InputBox integration

State machine for "typed then abandoned": IDLE → TYPING → DWELLING →
emit or resume. InputBox calls notifySubmit() on Enter to cancel
tracking cleanly. Uses controlled input value transitions to detect
clear; pure DOM listener could not access React state, hence the hook
rather than putting this in install.ts.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 9: Wire `data-lyra-*` attributes + full suite verification

**Files:**
- Modify: `音乐播放器/app/src/ui/DataExplorer.tsx`
- Modify: `音乐播放器/app/src/ui/RoadmapBoard.tsx`
- Modify: `音乐播放器/app/src/home/AlbumCover.tsx`
- Modify: `音乐播放器/app/src/home/SmallNote.tsx`
- Modify: `音乐播放器/app/src/home/TraceStrip.tsx`

**Interfaces:**
- Consumes: install.ts's `[data-lyra-scroll]` and `[data-lyra-hover]` selectors from Task 7
- Produces: 5 attribute additions across 5 files; no other logic change

- [ ] **Step 1: Add `data-lyra-scroll="data_explorer"` to DataExplorer root**

Open `音乐播放器/app/src/ui/DataExplorer.tsx`. Locate the outermost `<div>` that owns the scroll area (the wrapper with `overflow: auto` or `overflowY: auto`). Add `data-lyra-scroll="data_explorer"` to it. If the scroll behavior lives on a nested div, put the attribute on that specific one.

- [ ] **Step 2: Add `data-lyra-scroll="roadmap"` to RoadmapBoard root**

Same pattern in `音乐播放器/app/src/ui/RoadmapBoard.tsx`.

- [ ] **Step 3: Add `data-lyra-hover` on the 3 ambient components**

- `音乐播放器/app/src/home/AlbumCover.tsx` — add `data-lyra-hover="album_cover"` to the root element.
- `音乐播放器/app/src/home/SmallNote.tsx` — add `data-lyra-hover="small_note"` to the root element.
- `音乐播放器/app/src/home/TraceStrip.tsx` — add `data-lyra-hover="trace_strip"` to the root element.

- [ ] **Step 4: Run the whole app-side suite for final green**

Run: `cd 音乐播放器/app && pnpm test && pnpm typecheck && pnpm build`
Expected:
- 639+ vitest passing (was 625 → +14 = 639)
- typecheck 0 errors
- build succeeds; dist size within a few KB of 308 KB

Also confirm no visual regression — the 5 `data-lyra-*` attributes are unknown to CSS and to React, so nothing should change visually. If any DOM snapshot tests exist for the modified components (e.g., `AlbumCover.test.tsx`), they may need `toMatchSnapshot()` re-baseline — re-run and inspect diff before updating.

- [ ] **Step 5: Commit**

```bash
git -C /Users/daoyu/Documents/my-github/idea add \
  "音乐播放器/app/src/ui/DataExplorer.tsx" \
  "音乐播放器/app/src/ui/RoadmapBoard.tsx" \
  "音乐播放器/app/src/home/AlbumCover.tsx" \
  "音乐播放器/app/src/home/SmallNote.tsx" \
  "音乐播放器/app/src/home/TraceStrip.tsx"
git -C /Users/daoyu/Documents/my-github/idea commit -m "$(cat <<'EOF'
feat(lyra): data-lyra-* attributes wire perception to 5 components

- data-lyra-scroll="data_explorer" on DataExplorer scroll wrapper
- data-lyra-scroll="roadmap" on RoadmapBoard scroll wrapper
- data-lyra-hover="album_cover" on AlbumCover root
- data-lyra-hover="small_note" on SmallNote root
- data-lyra-hover="trace_strip" on TraceStrip root

Zero logic change in the components themselves; install.ts picks up
the attributes via document-level event capture. Completes Sprint 13.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Self-Review Notes

- **Spec coverage:**
  - §5 Event kinds → Task 1 ✅
  - §6 BehavioralFeatures dims → Task 2 ✅
  - §7 Rules + tuning → Tasks 3 & 4 ✅
  - §8 LLM prompt coarsening → Tasks 5 & 6 ✅
  - §9 Install layer → Tasks 7 & 8 ✅
  - §9 `data-lyra-*` wiring → Task 9 ✅
  - §10 Testing → distributed per-task, meets ~14 new case target ✅
  - §11 Zero migration → confirmed, no migration task exists ✅
  - §12 Success criteria (639/33/0/UI unchanged) → verified in Task 9 ✅
  - §13 Out-of-scope items → not touched by any task ✅

- **Type consistency:** `CoarseSignals` (Task 5) keys match Task 6 test expectations exactly; `BehavioralFeatures` fields (Task 2) match Rule tests (Task 4) and coarsening (Task 5); `InstallDeps` shape (Task 7) matches test mock in that same task.

- **No placeholders detected.** Each code step shows the actual code. Each test step shows real assertions.

- **Post-plan doc update reminder:** After Task 9 lands, refresh `docs/superpowers/specs/2026-07-08-lyra-current-implementation.md` §4.7 (Perception layer: 5→8 rules, 10→15 dims) and drop the "感知广谱事件" entry from §7 defer list. This is a follow-up doc commit, not part of the 9 tasks.
