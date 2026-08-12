# 锁定播放心理旁白文案 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 锁定循环重生 `rationale` 时改为越听越深的心理旁白（可修辞问/高遍数偶发真问），不再以拆歌/拆歌词为主菜。

**Architecture:** 仅改 `CompanionAgent` 锁定 brief：抽出 `lockDepthGuidance(n)` 按遍数注入深度与发问规则；`buildBrief` 删除旧「编曲/歌词意象」切入点。Orchestrator / UI / system prompt 不动。

**Tech Stack:** TypeScript、Vitest、`@lyra/core` CompanionAgent

## Global Constraints

- **只改文案路径**：`CompanionAgent` brief + 测试；不动锁定状态机、UI、选歌、原生队列、`COMPANION_SYSTEM_PROMPT`
- 口吻：朋友旁白；禁止诊断术语、禁止拆歌词/编曲当主菜、禁止复述情绪 labels
- 深度随 `lockPlayCount`：1–2 轻触无问；3–4 下探可修辞问；5–7 深+修辞问；8+ 可偶发真问
- 真问仅小纸条文本；用户接话沿用现有退出锁定（本版不加新协议）
- 改完 core 后按仓库规则：`cd app-mobile && pnpm build && pnpm cap:sync`（文案进 WebView 包）

## File map

| File | Responsibility |
|------|----------------|
| `packages/core/src/agents/lockDepthGuidance.ts` | **Create** — 纯函数：遍数 → 深度/发问指引字符串 |
| `packages/core/src/agents/lockDepthGuidance.test.ts` | **Create** — 阶段边界单测 |
| `packages/core/src/agents/CompanionAgent.ts` | **Modify** — 锁定分支改用心理指引，删拆歌切入点 |
| `packages/core/src/agents/CompanionAgent.test.ts` | **Modify** — 锁定 brief 断言随遍数变化 |

Spec: `docs/superpowers/specs/2026-08-12-lock-play-psych-copy-design.md`

---

### Task 1: `lockDepthGuidance` 纯函数 + 单测

**Files:**
- Create: `packages/core/src/agents/lockDepthGuidance.ts`
- Create: `packages/core/src/agents/lockDepthGuidance.test.ts`

**Interfaces:**
- Produces: `export function lockDepthGuidance(lockPlayCount: number): string`

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, it, expect } from "vitest";
import { lockDepthGuidance } from "./lockDepthGuidance";

describe("lockDepthGuidance", () => {
  it("1–2: light touch, no questions", () => {
    for (const n of [1, 2]) {
      const s = lockDepthGuidance(n);
      expect(s).toMatch(/轻触|停住|锁住/);
      expect(s).toMatch(/禁止发问|不要发问|不许发问/);
      expect(s).not.toMatch(/真问|可回/);
    }
  });

  it("3–4: deeper motive, rhetorical ok", () => {
    for (const n of [3, 4]) {
      const s = lockDepthGuidance(n);
      expect(s).toMatch(/下探|确认|回避/);
      expect(s).toMatch(/修辞/);
      expect(s).not.toMatch(/可回的真问|真问许可/);
    }
  });

  it("5–7: deep, rhetorical primary", () => {
    for (const n of [5, 7]) {
      const s = lockDepthGuidance(n);
      expect(s).toMatch(/深|还在转|松|硬/);
      expect(s).toMatch(/修辞/);
    }
  });

  it("8+: peak, occasional real question allowed", () => {
    const s = lockDepthGuidance(8);
    expect(s).toMatch(/真问|可回/);
    expect(s).toMatch(/近期|已经问过|别再问/);
  });
});
```

- [ ] **Step 2: Run tests — expect FAIL**

Run: `cd packages/core && pnpm exec vitest run src/agents/lockDepthGuidance.test.ts`

Expected: FAIL（模块不存在）

- [ ] **Step 3: Implement `lockDepthGuidance`**

```ts
/** 锁定循环：按遍数注入心理深度与发问规则（写入 Companion brief）。 */
export function lockDepthGuidance(lockPlayCount: number): string {
  const n = Math.max(1, Math.floor(lockPlayCount));
  const lines: string[] = [
    "主写：为什么还停在这首、心里可能在发生什么（沉浸/确认/回避/卡住或松动）。朋友旁白，禁止诊断术语与咨询腔。",
    "禁写：拆歌词或编曲当主菜；复述情绪 labels；同义改写旧句。歌名或整体氛围最多一笔带过。",
  ];

  if (n <= 2) {
    lines.push(
      `深度阶段=轻触（第 ${n} 遍）：点「为什么会锁住 / 想停在这」的感觉。禁止发问（修辞问与真问都不行）。`,
    );
  } else if (n <= 4) {
    lines.push(
      `深度阶段=下探（第 ${n} 遍）：写可能在确认或回避什么、反复碰哪一块。可偶发一句修辞问；不要真问（不要求她回答）。`,
    );
  } else if (n <= 7) {
    lines.push(
      `深度阶段=深（第 ${n} 遍）：点出「还在转」本身说明了什么；心里可能在松或在硬。修辞问为主；不要真问。`,
    );
  } else {
    lines.push(
      `深度阶段=顶（第 ${n} 遍）：少而重的一刀。可偶尔抛一个可回的真问；若近期小注里已经问过，则禁止再问。真问要短、有重量，不要连环追问。`,
    );
  }

  return lines.join("\n");
}
```

- [ ] **Step 4: Run tests — expect PASS**

Run: `cd packages/core && pnpm exec vitest run src/agents/lockDepthGuidance.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/agents/lockDepthGuidance.ts packages/core/src/agents/lockDepthGuidance.test.ts
git commit -m "$(cat <<'EOF'
feat(core): 锁定播放按遍数生成心理深度指引

EOF
)"
```

---

### Task 2: 接线 `buildBrief` + Companion 测试

**Files:**
- Modify: `packages/core/src/agents/CompanionAgent.ts`（锁定分支约 153–172 行）
- Modify: `packages/core/src/agents/CompanionAgent.test.ts`

**Interfaces:**
- Consumes: `lockDepthGuidance(lockPlayCount: number): string`
- Produces: 锁定 brief 含心理指引；不再含「编曲细节 / 某句歌词意象」切入点列表

- [ ] **Step 1: Update failing / stronger tests in `CompanionAgent.test.ts`**

替换/扩展现有 `includes lock-play brief when lockPlayCount is set`：

```ts
  it("includes lock-play psych brief (no song-dissection angles) at count 3", async () => {
    const p = stub(validResponse);
    const a = new CompanionAgent({ provider: p });
    await a.choose({
      ...input,
      candidates: [candidates[0]!],
      lockPlayCount: 3,
      previousRationale: "上一句文案",
      lockRecentRationales: ["第一遍小注", "上一句文案"],
      previousSong: { title: "ShouldNotAppear", artist: "X" },
    });
    const msgs: ChatMessage[] = (p.chat as any).mock.calls[0][0];
    const userMsg = msgs[1].content as string;
    expect(userMsg).toMatch(/锁定播放/);
    expect(userMsg).toMatch(/第 3 遍/);
    expect(userMsg).toMatch(/下探|确认|回避/);
    expect(userMsg).toMatch(/修辞/);
    expect(userMsg).toContain("第一遍小注");
    expect(userMsg).toContain("上一句文案");
    expect(userMsg).toMatch(/角度全部禁用|已经写过/);
    expect(userMsg).not.toMatch(/上一首刚播完/);
    expect(userMsg).not.toMatch(/编曲细节/);
    expect(userMsg).not.toMatch(/某句歌词意象/);
  });

  it("lock-play brief forbids questions at count 1", async () => {
    const p = stub(validResponse);
    const a = new CompanionAgent({ provider: p });
    await a.choose({
      ...input,
      candidates: [candidates[0]!],
      lockPlayCount: 1,
    });
    const userMsg = (p.chat as any).mock.calls[0][0][1].content as string;
    expect(userMsg).toMatch(/禁止发问|不要发问|不许发问/);
    expect(userMsg).not.toMatch(/可回的真问/);
  });

  it("lock-play brief allows rare real question at count 8+", async () => {
    const p = stub(validResponse);
    const a = new CompanionAgent({ provider: p });
    await a.choose({
      ...input,
      candidates: [candidates[0]!],
      lockPlayCount: 9,
      lockRecentRationales: ["还在转。"],
    });
    const userMsg = (p.chat as any).mock.calls[0][0][1].content as string;
    expect(userMsg).toMatch(/真问|可回/);
    expect(userMsg).not.toMatch(/编曲细节/);
  });
```

- [ ] **Step 2: Run CompanionAgent tests — expect FAIL on new assertions**

Run: `cd packages/core && pnpm exec vitest run src/agents/CompanionAgent.test.ts`

Expected: FAIL（仍含旧切入点 / 缺心理阶段词）

- [ ] **Step 3: Wire `buildBrief` 锁定分支**

在 `CompanionAgent.ts` 顶部：

```ts
import { lockDepthGuidance } from "./lockDepthGuidance";
```

将锁定分支改为（保留 recent 禁用列表逻辑）：

```ts
  if (i.lockPlayCount != null && i.lockPlayCount > 0) {
    parts.push(
      `锁定播放模式：用户正在循环同一首歌（候选已固定，song_id 必须仍是当前这首）。这是本曲锁定播放的第 ${i.lockPlayCount} 遍。`,
    );
    parts.push(
      "你的任务不是换歌，只是重写 rationale：写越听越深的心理旁白，不要拆歌。",
    );
    parts.push(lockDepthGuidance(i.lockPlayCount));
    const recent = (i.lockRecentRationales?.length
      ? i.lockRecentRationales
      : i.previousRationale
        ? [i.previousRationale]
        : []
    ).filter((s) => s.trim());
    if (recent.length > 0) {
      parts.push("以下小注已经写过，角度全部禁用（连相近都不行）：");
      recent.forEach((r, idx) => {
        parts.push(`${idx + 1}. "${r}"`);
      });
    }
  } else if (i.previousSong) {
    // ... unchanged
```

- [ ] **Step 4: Run tests — expect PASS**

Run: `cd packages/core && pnpm exec vitest run src/agents/CompanionAgent.test.ts src/agents/lockDepthGuidance.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/agents/CompanionAgent.ts packages/core/src/agents/CompanionAgent.test.ts
git commit -m "$(cat <<'EOF'
feat(core): 锁定循环 brief 改为心理深度旁白

EOF
)"
```

---

### Task 3: 移动端同步（core 文案进 WebView）

**Files:** 无源码改动；构建同步

- [ ] **Step 1: Build + cap sync**

Run: `cd app-mobile && pnpm build && pnpm cap:sync`

若 `cap sync` 仅因 CocoaPods 失败但 Copying web assets 已成功：再跑 `pnpm exec cap copy ios`，并告知用户原生依赖未更新。

- [ ] **Step 2: Commit sync artifacts only if the repo tracks them and they changed**

若 `ios/App/App/public` 等有 diff 且仓库跟踪：一并提交；否则跳过空提交。

```bash
git status
# 如有跟踪的同步产物：
git add -A app-mobile/ios/App/App/public  # 仅当确有变更且应提交
git commit -m "$(cat <<'EOF'
chore(mobile): sync web assets after lock-play psych copy

EOF
)"
```

- [ ] **Step 3: Push**（若用户本轮要求提交即推；否则在最终交付时推）

---

## Spec coverage checklist

| Spec 项 | Task |
|---------|------|
| 全程心理向 / 禁拆歌 | Task 2 brief |
| 遍数加深 1–2 / 3–4 / 5–7 / 8+ | Task 1 `lockDepthGuidance` |
| 修辞问 → 真问 | Task 1 + Task 2 断言 |
| 只改文案路径 | 全 plan 无 Orchestrator/UI |
| 单测 brief 阶段 | Task 1 + 2 |
| iOS WebView 同步 | Task 3 |

## Self-review

- 无 TBD；函数名 `lockDepthGuidance` 前后一致
- 真问「每 3–4 遍最多一次」由 prompt 约束（看近期小注），本版不加计数器 —— 符合 spec「真问仅文本 / 不新协议」
