# 锁定播放 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 app-mobile 增加「锁定播放」：当前曲循环重播，每次循环重生 Companion `rationale`（带锁定遍数），切歌/新输入自动退出。

**Architecture:** Orchestrator 持有会话态 `trackLock`；`onSongComplete` 在锁定时走「同曲 `playFile` + 单候选 `companion.choose`（`lockPlayCount`）」而不 `finalisePreviousTurn`/选下一首。UI 在输入框右侧与收藏对齐放循环钮；锁定时 `clearNextTrack` 并跳过 prefetch。

**Tech Stack:** TypeScript、React、Vitest、Capacitor `LyraAudio`、`@lyra/core` Orchestrator / CompanionAgent

**Spec:** `docs/lock-play-design.md`

## Global Constraints

- 仅 `app-mobile` + `packages/core`；不做桌面 `app` UI。
- 不与 `moodLocked`（心情锁定）合并。
- 切歌（下一首/左滑/上一首）与用户新输入均退出锁定；不禁用切歌。
- 同曲重播用 `deps.audio.playFile(同 path)`（不引入 seek）；文案 patch 当前 turn，不新插空壳 turn。
- 改完 app-mobile / core 后执行：`cd app-mobile && pnpm build && pnpm cap:sync`（pod 失败则 `pnpm exec cap copy ios`）。

## File map

| File | Responsibility |
|------|----------------|
| `packages/core/src/agents/types.ts` | `CompanionInput.lockPlayCount?` |
| `packages/core/src/agents/CompanionAgent.ts` | `buildBrief` 锁定提示 |
| `packages/core/src/agents/CompanionAgent.test.ts` | brief 断言 |
| `packages/core/src/turn/Orchestrator.ts` | `trackLock` API + complete 分支 + 清锁 |
| `packages/core/src/turn/Orchestrator.test.ts` | 锁定循环 / 清锁测试 |
| `app-mobile/src/home/icons.tsx` | `IconTrackLock`（单曲循环） |
| `app-mobile/src/home/TrackLockButton.tsx` | 右侧锁定钮（可测） |
| `app-mobile/src/home/TrackLockButton.test.tsx` | 按钮交互 |
| `app-mobile/src/home/MobileHomeView.tsx` | 输入行布局 + 接线 |
| `app-mobile/src/home/mobile.css` | 输入行 + 右列对齐 |
| `app-mobile/src/audio/usePrefetchNext.ts` | 锁定时不 refill |
| `app-mobile/src/audio/usePrefetchNext.test.ts` | 门控测试 |

---

### Task 1: Companion `lockPlayCount` → brief

**Files:**
- Modify: `packages/core/src/agents/types.ts`
- Modify: `packages/core/src/agents/CompanionAgent.ts` (`buildBrief`)
- Modify: `packages/core/src/agents/CompanionAgent.test.ts`

**Interfaces:**
- Produces: `CompanionInput.lockPlayCount?: number`
- Produces: brief 含「锁定播放」与第 N 遍提示（当 `lockPlayCount` 有值）

- [ ] **Step 1: Write the failing test**

在 `CompanionAgent.test.ts` 增加：

```ts
it("includes lock-play brief when lockPlayCount is set", async () => {
  const p = stub(validResponse);
  const a = new CompanionAgent({ provider: p });
  await a.choose({
    ...input,
    candidates: [candidates[0]!],
    lockPlayCount: 3,
    previousRationale: "上一句文案",
  });
  const userMsg = (p.chat as any).mock.calls[0][0].find(
    (m: ChatMessage) => m.role === "user",
  ).content as string;
  expect(userMsg).toMatch(/锁定播放/);
  expect(userMsg).toMatch(/第\s*3\s*遍|第 3 遍/);
  expect(userMsg).not.toMatch(/上一首刚播完/);
});
```

（若现有 stub 取 messages 的方式不同，对齐该文件里 `system prompt includes` 的取法。）

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm -C app-mobile exec vitest run ../packages/core/src/agents/CompanionAgent.test.ts -t "lock-play"
```

Expected: FAIL（`lockPlayCount` 未入 brief 或类型不存在）

- [ ] **Step 3: Minimal implementation**

`types.ts` — `CompanionInput` 增加：

```ts
/** 锁定播放：本次锁定内当前遍数。仅锁定循环重生文案时设置。 */
lockPlayCount?: number;
```

`CompanionAgent.ts` `buildBrief` — 在 auto-advance `previousSong` 块之后（或替代）：

```ts
if (i.lockPlayCount != null && i.lockPlayCount > 0) {
  parts.push(
    `锁定播放模式：用户正在循环同一首歌。这是本曲锁定播放的第 ${i.lockPlayCount} 遍。请换一个全新角度写 rationale，不要复述上一句；不要建议切歌。`,
  );
  if (i.previousRationale) {
    parts.push(`你上一条 rationale: "${i.previousRationale}" ← 必须换一个完全不同的角度写这条`);
  }
} else if (i.previousSong) {
  // 保持现有 auto-advance 分支不变
  ...
}
```

注意：有 `lockPlayCount` 时**不要**写「上一首刚播完」过渡叙事。

- [ ] **Step 4: Run test to verify it passes**

同 Step 2，Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/agents/types.ts \
  packages/core/src/agents/CompanionAgent.ts \
  packages/core/src/agents/CompanionAgent.test.ts
git commit -m "$(cat <<'EOF'
feat(core): Companion brief 支持锁定播放遍数

EOF
)"
```

---

### Task 2: Orchestrator `trackLock` + locked `onSongComplete`

**Files:**
- Modify: `packages/core/src/turn/Orchestrator.ts`
- Modify: `packages/core/src/turn/Orchestrator.test.ts`

**Interfaces:**
- Consumes: `CompanionInput.lockPlayCount`（Task 1）
- Produces:
  - `setTrackLock(enabled: boolean): void`
  - `isTrackLockEnabled(): boolean`
  - `getTrackLockPlayCount(): number`
  - `clearTrackLock(): void`（内部，切歌入口调用）
- 锁定下 `onSongComplete`：同 `song.id` 再 `playFile`；`playCount` +1；`companion.choose` 带 `lockPlayCount`；patch `currentTurn.agent_response.rationale`；`emit playing`（可用 `rationalePending`）

**实现选定（锁死）：**
1. 重播：`await this.deps.audio.playFile(song.path, song.duration_ms ?? null)`（与现有路径一致）。
2. 不调用 `finalisePreviousTurn`（它会把 `currentTurn`/`currentSong` 置 null）。
3. 折叠 `complete` 后手动 `behavioral.repeated += 1`，`updateTurn` 若存在则调用。
4. 文案：扩展私有 `rationaleForNativeSong(..., { lockPlayCount, previousRationale })`，或内联同等 `companion.choose`；**不传** `previousSong`（避免过渡文案）；候选仅当前曲。
5. UI 可知性：`setTrackLock` 在 `state.kind === "playing"` 时 `emit({ ...this.state })`（可加 `trackLocked?: boolean` 到 playing 态，推荐加上以免 UI 另轮询）。

- [ ] **Step 1: Write failing tests** in `Orchestrator.test.ts`

```ts
describe("Orchestrator track lock", () => {
  it("setTrackLock binds current song and playCount starts at 1", async () => {
    const deps = makeDeps();
    const orc = new Orchestrator(deps as any);
    await orc.onUserInput("来一首");
    orc.setTrackLock(true);
    expect(orc.isTrackLockEnabled()).toBe(true);
    expect(orc.getTrackLockPlayCount()).toBe(1);
  });

  it("onSongComplete while locked replays same song and bumps playCount", async () => {
    const deps = makeDeps();
    (deps.companion.choose as any)
      .mockResolvedValueOnce({
        song_id: "t1", target_profile: "x", rationale: "第一遍", needed_shift: "接住",
      })
      .mockResolvedValue({
        song_id: "t1", target_profile: "x", rationale: "第二遍文案", needed_shift: "陪着",
      });
    const orc = new Orchestrator(deps as any);
    await orc.onUserInput("来一首");
    orc.setTrackLock(true);
    (deps.audio.playFile as any).mockClear();
    (deps.companion.choose as any).mockClear();

    await orc.onSongComplete();

    expect(deps.audio.playFile).toHaveBeenCalledWith("/x.mp3", null);
    expect(orc.isTrackLockEnabled()).toBe(true);
    expect(orc.getTrackLockPlayCount()).toBe(2);
    const st = orc.getState();
    expect(st.kind).toBe("playing");
    if (st.kind === "playing") {
      expect(st.song.id).toBe("t1");
      // 等后台 fill 完成：若异步，await microtask / 轮询
    }
    // 断言 companion.choose 收到 lockPlayCount: 2
    const chooseArg = (deps.companion.choose as any).mock.calls.at(-1)[0];
    expect(chooseArg.lockPlayCount).toBe(2);
    expect(chooseArg.candidates).toHaveLength(1);
    expect(chooseArg.candidates[0].id).toBe("t1");
  });

  it("onSkip clears track lock", async () => {
    const deps = makeDeps();
    const orc = new Orchestrator(deps as any);
    await orc.onUserInput("来一首");
    orc.setTrackLock(true);
    await orc.onSkip();
    expect(orc.isTrackLockEnabled()).toBe(false);
    expect(orc.getTrackLockPlayCount()).toBe(0);
  });

  it("onUserInput clears track lock", async () => {
    const deps = makeDeps();
    const orc = new Orchestrator(deps as any);
    await orc.onUserInput("来一首");
    orc.setTrackLock(true);
    await orc.onUserInput("换个心情");
    expect(orc.isTrackLockEnabled()).toBe(false);
  });
});
```

按现有 `makeDeps` / mock 字段名微调（path、song id）。再补：`onPrevious` / `onReplaySong` 清锁各一条（可合并进上表）。

- [ ] **Step 2: Run tests — expect FAIL**

```bash
pnpm -C app-mobile exec vitest run ../packages/core/src/turn/Orchestrator.test.ts -t "track lock"
```

- [ ] **Step 3: Implement Orchestrator**

私有字段：

```ts
private trackLock: {
  enabled: boolean;
  songId: string;
  playCount: number;
} | null = null;
```

公开方法：

```ts
setTrackLock(enabled: boolean): void {
  if (!enabled) {
    this.clearTrackLock();
    if (this.state.kind === "playing") {
      this.emit({ ...this.state, trackLocked: false });
    }
    return;
  }
  if (!this.currentSong || this.state.kind !== "playing") return;
  this.trackLock = {
    enabled: true,
    songId: this.currentSong.id,
    playCount: 1,
  };
  this.emit({ ...this.state, trackLocked: true });
}

isTrackLockEnabled(): boolean {
  return Boolean(this.trackLock?.enabled);
}

getTrackLockPlayCount(): number {
  return this.trackLock?.enabled ? this.trackLock.playCount : 0;
}

clearTrackLock(): void {
  this.trackLock = null;
}
```

`OrchestratorState` playing 分支增加可选 `trackLocked?: boolean`。

在 `onSkip` / `onPrevious` / `onUserInput`（进入转换后尽早）/ `onReplaySong` 开头调用 `this.clearTrackLock()`。

`onSongComplete` 在 pause 检查之后、现有 advance 逻辑之前：

```ts
if (
  this.trackLock?.enabled &&
  this.currentSong &&
  this.trackLock.songId === this.currentSong.id
) {
  // fold complete + bump repeated；updateTurn；playCount++；
  // playFile 同曲；emit playing + rationalePending；
  // void fillTrackLockRationale(...)
  return;
}
```

`fillTrackLockRationale` 可仿 `fillReplayRationale`：调用扩展后的 `rationaleForNativeSong`，传入 `lockPlayCount: this.trackLock.playCount` 与 `previousRationale`（旧文案），patch turn，`emit` `rationalePending: false`。

扩展 `rationaleForNativeSong` 签名增加可选 opts：

```ts
opts?: { lockPlayCount?: number; previousRationale?: string; previousSong?: ... }
```

有 `lockPlayCount` 时只传 `lockPlayCount` + `previousRationale`，不传 `previousSong`。

- [ ] **Step 4: Run tests — expect PASS**

同 Step 2。若 rationale 异步，测试里：

```ts
await vi.waitFor(() => {
  const st = orc.getState();
  expect(st.kind === "playing" && st.turn.agent_response.rationale).toBe("第二遍文案");
});
```

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/turn/Orchestrator.ts \
  packages/core/src/turn/Orchestrator.test.ts
git commit -m "$(cat <<'EOF'
feat(core): Orchestrator 锁定播放循环与文案重生

EOF
)"
```

---

### Task 3: UI — 图标 + 锁定钮 + 输入行布局

**Files:**
- Modify: `app-mobile/src/home/icons.tsx`
- Create: `app-mobile/src/home/TrackLockButton.tsx`
- Create: `app-mobile/src/home/TrackLockButton.test.tsx`
- Modify: `app-mobile/src/home/mobile.css`
- Modify: `app-mobile/src/home/MobileHomeView.tsx`（本 Task 只做布局壳 + props 接线桩；完整 orchestrator 接线可在 Task 4）

**Interfaces:**
- Produces: `IconTrackLock({ active?: boolean })`
- Produces: `<TrackLockButton locked onToggle disabled />`
- Produces: dock 输入行结构

布局目标：

```
[历史]  [prev play next]  [收藏]
[==== InputBox 胶囊 flex:1 ====] [锁定]
```

- [ ] **Step 1: Failing UI test**

`TrackLockButton.test.tsx`：

```tsx
import { render, screen, fireEvent } from "@testing-library/react";
import { TrackLockButton } from "./TrackLockButton";

it("toggles aria-pressed and calls onToggle", () => {
  const onToggle = vi.fn();
  render(<TrackLockButton locked={false} onToggle={onToggle} />);
  const btn = screen.getByTestId("track-lock-btn");
  expect(btn).toHaveAttribute("aria-pressed", "false");
  fireEvent.click(btn);
  expect(onToggle).toHaveBeenCalledOnce();
});

it("shows cancel label when locked", () => {
  render(<TrackLockButton locked onToggle={() => {}} />);
  expect(screen.getByTestId("track-lock-btn")).toHaveAttribute(
    "aria-label",
    "取消锁定播放",
  );
});
```

- [ ] **Step 2: Run — expect FAIL**

```bash
pnpm -C app-mobile exec vitest run src/home/TrackLockButton.test.tsx
```

- [ ] **Step 3: Implement icon + button + CSS + dock row**

`IconTrackLock`：单曲循环 SVG（一条带箭头的闭环），`active` 时加 class 高亮（对齐收藏 `--on` 色系，可用控制墨色/略深，勿用锁头图标）。

`TrackLockButton.tsx`：复用收藏钮视觉 class 模式（frosted 38px），`lightTap` + `onToggle`。

`mobile.css`：

```css
.lyra-mobile-input-row {
  display: flex;
  align-items: flex-end;
  gap: 10px;
}
.lyra-mobile-input-row .lyra-mobile-input-wrap {
  flex: 1;
  min-width: 0;
}
.lyra-mobile-track-lock {
  /* 与 .lyra-mobile-player-controls__favorite 同尺寸/材质 */
  flex: none;
  width: 38px;
  height: 38px;
  /* ... */
}
.lyra-mobile-track-lock--on {
  /* 点亮态 */
}
```

`MobileHomeView`：playing 时把 `InputBox` 包进：

```tsx
<div className="lyra-mobile-input-row" onClick={(e) => e.stopPropagation()}>
  <InputBox ... />
  {playing && (
    <TrackLockButton
      locked={trackLocked}
      onToggle={() => orchestrator.setTrackLock(!trackLocked)}
      disabled={!playing}
    />
  )}
</div>
```

idle 不渲染锁定钮（输入行可仍用 row，仅胶囊）。

收藏仍在 `PlayerControls` 右侧；用相同右边距/列宽，使视觉上「收藏在上、锁定在下」对齐（输入行与 controls 同宽即可）。

- [ ] **Step 4: Run UI tests — PASS**

- [ ] **Step 5: Commit**

```bash
git add app-mobile/src/home/icons.tsx \
  app-mobile/src/home/TrackLockButton.tsx \
  app-mobile/src/home/TrackLockButton.test.tsx \
  app-mobile/src/home/mobile.css \
  app-mobile/src/home/MobileHomeView.tsx
git commit -m "$(cat <<'EOF'
feat(mobile): 输入框右侧锁定播放按钮

EOF
)"
```

---

### Task 4: 接线状态 + 原生队列门控

**Files:**
- Modify: `app-mobile/src/home/MobileHomeView.tsx`
- Modify: `app-mobile/src/audio/usePrefetchNext.ts`
- Modify: `app-mobile/src/audio/usePrefetchNext.test.ts`

**Interfaces:**
- Consumes: `orchestrator.setTrackLock` / `isTrackLockEnabled` / playing.`trackLocked`
- 锁定开启：`invalidatePlaybackQueueRefills()` + `LyraAudio.clearNextTrack()`
- 锁定关闭且仍 playing：允许 `usePrefetchNext` 再次 refill
- `usePrefetchNext`：若 `orchestrator.isTrackLockEnabled()` 则直接 return，不 refill

- [ ] **Step 1: Failing prefetch test**

```ts
it("skips refill while track lock is enabled", async () => {
  const orchestrator = {
    isTrackLockEnabled: () => true,
    prefetchMore: vi.fn(),
  };
  // 按现有 usePrefetchNext.test 的 harness 渲染 hook，触发 run
  await waitFor(() => {
    expect(refillPlaybackQueue).not.toHaveBeenCalled();
  });
});
```

（对齐现有 mock 结构；若 refill 在 hook 内直接调，则断言 `refillPlaybackQueue` 未被调用。）

- [ ] **Step 2: Run — FAIL**

```bash
pnpm -C app-mobile exec vitest run src/audio/usePrefetchNext.test.ts
```

- [ ] **Step 3: Implement**

`usePrefetchNext` 的 `runRefill` 开头：

```ts
if (orchestrator.isTrackLockEnabled()) return;
```

`MobileHomeView`：

- 从 `state.kind === "playing" && state.trackLocked`（或 `orchestrator.isTrackLockEnabled()`）推导 `trackLocked`。
- `onToggle`：

```ts
const next = !orchestrator.isTrackLockEnabled();
orchestrator.setTrackLock(next);
if (next) {
  invalidatePlaybackQueueRefills();
  void LyraAudio.clearNextTrack().catch(() => {});
} else {
  // 关闭后由 usePrefetchNext 的 effect 自然 refill
}
```

订阅 orchestrator 状态变化时同步按钮点亮（已有 state 订阅则跟着 `trackLocked` 字段走）。

- [ ] **Step 4: Run mobile + core related tests**

```bash
pnpm -C app-mobile exec vitest run \
  src/audio/usePrefetchNext.test.ts \
  src/home/TrackLockButton.test.tsx \
  ../packages/core/src/turn/Orchestrator.test.ts -t "track lock" \
  ../packages/core/src/agents/CompanionAgent.test.ts -t "lock-play"
```

Expected: PASS

- [ ] **Step 5: Build + sync + commit**

```bash
cd app-mobile && pnpm build && pnpm cap:sync
# 若仅 pod 失败：pnpm exec cap copy ios
```

```bash
git add app-mobile/src/home/MobileHomeView.tsx \
  app-mobile/src/audio/usePrefetchNext.ts \
  app-mobile/src/audio/usePrefetchNext.test.ts
git commit -m "$(cat <<'EOF'
feat(mobile): 锁定播放接线并停用原生队列预填

EOF
)"
git push
```

---

## Spec coverage checklist

| Spec 项 | Task |
|---------|------|
| 输入框右、与收藏对齐 | 3 |
| 仅 playing 显示 | 3 |
| 循环同曲、不推下一首 | 2 |
| 重生 rationale + lockPlayCount | 1, 2 |
| 切歌/新输入退出 | 2 |
| 上一首退出 | 2 |
| 暂停不触发播完循环 | 2（沿用 existing pause guard） |
| 清空 native 下一首队列 | 4 |
| 不持久化 | 2（仅内存字段） |
| 与 moodLocked 正交 | 全程不碰 |
| patch turn 不插空壳 | 2 |
| playFile 重播 | 2 |

## Self-review notes

- 无 TBD；重播与 patch 策略已在 Task 2 锁死。
- `lockPlayCount` / `trackLocked` / `setTrackLock` 命名全任务一致。
- `clearNextTrack` 已存在于 `LyraAudio` / Swift，无需新原生 API。
