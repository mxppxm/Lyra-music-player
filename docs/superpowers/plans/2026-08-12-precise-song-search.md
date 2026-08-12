# 精准搜歌双 icon 模式 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 输入侧用 ↑/♪ 分段区分心情与精准搜歌；搜歌通搜 B 站按播放量取最高，未命中不进心情；连播锚点从歌曲 MusicProfile 注入。

**Architecture:** `InputBox` 持有 `mood | song` 模式并双 icon 提交；`♪` 走 `Orchestrator.onSongSearch`（本地 includes → B 站 `order=click` 无频道词 → 播放）；播放后优先读 profile 注入 `sessionMoodAnchor`，否则后台 profiling 完成再注入。`↑` 仍走 `onUserInput`。

**Tech Stack:** TypeScript、React（app-mobile）、Vitest、现有 bilibili API / MusicProfile / Orchestrator。

**Spec:** `docs/superpowers/specs/2026-08-12-precise-song-search-design.md`

## Global Constraints

- 搜歌路径禁止 EmotionAgent 分析歌名来设锚点
- B 站 keyword 仅为歌名，不加「百万豪装录音棚」
- 冷启动策略 A：先播，画像就绪再注入锚点
- 优先改 `packages/core` + `app-mobile`；改完需 `pnpm build && pnpm cap:sync`

---

### Task 1: B 站通搜按播放量

**Files:**
- Modify: `packages/core/src/bilibili/api.ts`
- Test: `packages/core/src/bilibili/api.test.ts`（若无则创建）

**Interfaces:**
- Produces: `searchBilibili(query, limit?, forceKeyword?, options?: { order?: "pubdate" | "click"; channelScoped?: boolean })` 或等价 `searchBilibiliByPlayCount(title: string, limit?: number)`
- 精准搜歌：`keyword = title`，`order = "click"`，返回按 `play_count` 降序；保留 90s–600s 时长过滤

- [ ] 为通搜写失败用例（mock `fetchJson`）断言 keyword 不含「百万豪装」、order 为 click
- [ ] 实现 options / 新函数，不破坏现有 `searchBilibili("百万豪装录音棚")` 调用方
- [ ] 测试通过并提交

### Task 2: `onSongSearch` + 画像锚点注入

**Files:**
- Modify: `packages/core/src/turn/Orchestrator.ts`
- Modify: `packages/core/src/library/songIntent.ts`（可选：抽出 `searchBilibiliForSongOpen`）
- Modify: `packages/core/src/recommendation/backgroundProfiling.ts`（可选：完成回调 / 返回 profile）
- Test: `packages/core/src/turn/Orchestrator.test.ts`

**Interfaces:**
- Produces: `async onSongSearch(text: string): Promise<void>`
- Produces: `injectAnchorFromProfile(profile: MusicProfile): void`（private）
- 本地 miss → 通搜 → miss 则 `emit({ kind: "error", message: "没找到这首歌" })`，不跑 mood

- [ ] 测试：本地命中播放；B 站命中；双 miss 报错且不调用 emotion.analyze 设锚
- [ ] 测试：有 profile 时 labels 来自 `mood`，不含歌名纯文案锚
- [ ] 实现 `onSongSearch`；播放后 `getByTrackId` 或 `scheduleBackgroundProfiling` 后注入
- [ ] 测试通过并提交

### Task 3: InputBox 双 icon 分段

**Files:**
- Modify: `app-mobile/src/home/InputBox.tsx`
- Modify: `app-mobile/src/home/mobile.css`
- Test: `app-mobile/src/home/InputBox.test.tsx`（若无则创建）

**Interfaces:**
- Produces: `onSubmit: (text: string, mode: "mood" | "song") => void`
- 默认 mode `mood`；点高亮发送，点另一格只切换；占位符随 mode 变

- [ ] 测试切换与提交 mode
- [ ] 实现 UI + CSS 滑动高亮
- [ ] 测试通过并提交

### Task 4: 接线 MobileHomeView + sync

**Files:**
- Modify: `app-mobile/src/home/MobileHomeView.tsx`
- 若 desktop `app/src` 有 InputBox 共用则对齐（无则跳过）

- [ ] `handleSubmit(text, mode)` → mood/`onUserInput`，song/`onSongSearch`
- [ ] `cd app-mobile && pnpm build && pnpm cap:sync`（pod 失败则 `cap copy ios`）
- [ ] 提交

---

## Spec coverage

| Spec 项 | Task |
|--|--|
| 双 icon 交互 | 3–4 |
| onSongSearch 本地/B站/miss | 2 |
| B 站无限定词 + click | 1 |
| 画像注入锚点策略 A | 2 |
| 心情路径不变 | 2、4 |
