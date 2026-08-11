# 锁定播放（单曲循环 + 文案重生）设计

**日期：** 2026-08-11  
**范围：** `app-mobile` UI + `@lyra/core` Orchestrator / Companion 文案路径  
**状态：** 对话设计已批准；待文档确认后进入实现计划

## 目标

让用户把当前歌「锁住」循环播放：播完不切下一首，同曲从头再播；每次循环重新生成 Companion `rationale`（小纸条），并带上**本次锁定内的当前遍数**及其他现有生成参数。

## 非目标

- 桌面端 `app` UI（可后续跟进）
- 跨会话持久化锁定状态
- 与「心情锁定」`moodLocked` 合并或共用开关
- 改变收藏 / 推荐打分 / 历史统计语义（锁定循环可记 `repeated`，但不另造推荐权重）
- 锁定期间禁用下一首 / 左滑（已拍板：切歌仍可用，一切即退出锁定）

## 已拍板决策

| 项 | 决策 |
|----|------|
| 切歌 | 下一首 / 左滑仍可用；一切歌自动退出锁定 |
| 上一首 | 同样退出锁定（与切歌一致） |
| 播完 | 不推下一首；同曲重播 |
| 文案 | 每次循环重生 `rationale`；静默不推新歌，但要写新纸条 |
| 遍数 | 本次锁定会话内当前是第几遍；关锁或切歌清零；首播为第 1 遍 |
| 按钮位置 | 输入框右侧，与收藏按钮垂直对齐的右列 |
| 显示时机 | 仅 `playing`（含暂停）显示；idle 不出现 |
| 沉浸态 | 随 dock 一并隐藏 |

## UI

播放中 dock：

```
[历史]     [上一首][播放][下一首]     [收藏]
[========= 输入框胶囊 =========]     [锁定]
```

- 锁定钮与收藏同规格：约 38×38 圆形 frosted 按钮。
- 输入行改为「胶囊 `flex:1` + 右侧锁定钮」，右列与上方收藏对齐（同 `right` 边距）。
- 点亮 = 锁定开启（`aria-pressed`）；轻触 `lightTap`。
- 图标：单曲循环语义（一条带箭头的循环），避免与「心情锁定」文案/锁头混淆；`title` / `aria-label` 用「锁定播放」/「取消锁定播放」。

## 行为状态机

```
unlocked ──点锁定──► locked (playCount = 1, 当前正在播的那一遍)
locked ──点锁定──► unlocked (playCount 清零)
locked ──下一首/左滑/上一首/用户新输入──► unlocked，再走原有切歌/回合逻辑
locked ──自然播完──► 同曲 seek/replay；playCount += 1；重生 rationale；仍 locked
```

补充：

- 用户在输入框提交新意图 → 退出锁定，走正常 `onUserInput`。
- App 进程被杀不恢复锁定。
- 手动暂停优先：暂停中不触发「播完循环」。

## 核心数据流

### Orchestrator

新增会话态（不落库）：

```ts
trackLock: {
  enabled: boolean;
  songId: string | null;
  /** 本次锁定内当前遍数；开启时从 1 起 */
  playCount: number;
} | null;
```

API 建议：

- `setTrackLock(enabled: boolean): void` — UI 开关；开启时绑定 `currentSong.id`，`playCount = 1`。
- `isTrackLockEnabled(): boolean`
- `getTrackLockPlayCount(): number`

`onSongComplete` 分支：

1. 若 `trackLock.enabled` 且 `currentSong.id === trackLock.songId`：
   - 不 `pushPlayStack` 到「下一首」路径；不清心情锚点。
   - 不消费 `nativeQueuePlan`、不 `runTurnWithEmotion` 选新歌。
   - `playCount += 1`。
   - 同曲重播（`audio.playFile` 同 URL，或 seek(0)+play；以现有 iOS 插件能力选更稳的一条）。
   - 调用「仅重生文案」路径（见下），更新 `currentTurn.agent_response.rationale` 并 `emit({ kind: "playing", ... })`（或专用 patch 事件，保证 SmallNote 刷新）。
2. 否则：维持现有 auto-advance。

`onSkip` / `onPrevious` / `onUserInput` / `onReplaySong`（点历史换歌）入口：先 `clearTrackLock()`。

### 原生队列（iOS）

锁定开启时：

- 清空或停止预填 native playback queue（`invalidatePlaybackQueueRefills` + clear queue），避免 AVPlayer 先跳到下一首。
- `useAutoAdvance` 的 `nativeAdvanced`：若锁定中且 advanced 到别的 songId，应视为异常——优先 seek 回锁定曲或立即 `clearTrackLock` 并同步 UI；**实现时以「锁定期间队列深度为 0 / 仅当前曲」为第一防线**。

锁定关闭且仍在播放：恢复正常 `refillPlaybackQueue`。

### Companion 文案重生

- **文案 = `rationale`（SmallNote）**。
- 不新开「选歌」语义：候选固定为当前曲，或提供 `rewriteRationale` 专用 brief，强制 `song_id = 当前 id`。
- `CompanionInput`（或等价入参）增加：

```ts
/** 锁定播放：本次锁定内当前遍数。仅锁定循环重生文案时设置。 */
lockPlayCount?: number;
```

- `buildBrief` 在存在 `lockPlayCount` 时追加类似：

  > 锁定播放模式：用户正在循环同一首歌。这是本曲锁定播放的第 N 遍。请换一个全新角度写 rationale，不要复述上一句；不要建议切歌。

- 仍传入现有参数：情绪、灵魂、时间上下文、记忆、`previousRationale`（上一遍文案，强制换角度）等。
- **不要**走「上一首刚播完 → 选下一首」的 auto-advance 叙事；`previousSong` 在锁定循环路径上可省略或明确为同一首，以免模型写成过渡到下一首。

## 与现有概念的边界

| 概念 | 关系 |
|------|------|
| `moodLocked`（心情锁定） | 正交；锁定播放不改心情锚点逻辑 |
| 歌手会话 `artistFilter` | 正交；切歌退出锁定后仍可保留歌手会话 |
| `behavioral.repeated` | 锁定循环完成一遍可记一次 repeated（与现有 fold 对齐即可，不单独开表） |

## 测试要点

- Orchestrator：锁定下 `onSongComplete` 不换 `songId`，`playCount` 递增，rationale 更新；`onSkip` 清除锁定。
- Companion brief：含 `lockPlayCount` 与换角度提示。
- UI：播放中显示锁定钮；点按切换 `aria-pressed`；与收藏右列对齐；idle 无按钮。
- 原生：锁定时队列不预填下一首（单测或插件层可测部分）。

## 实现范围文件（预期）

- `packages/core`：`Orchestrator`、`CompanionAgent` / `CompanionInput`、相关测试
- `app-mobile`：`MobileHomeView`、输入行布局 / CSS、`PlayerControls` 或旁路锁定钮、`useAutoAdvance` / queue refill 门控、图标

## 开放实现细节（计划阶段选定即可）

1. 同曲重播用 `playFile` 重入 vs `seek(0)` — 以 iOS 插件现有 API 为准，选不触发 `nativeAdvanced` 的方案。
2. rationale 更新是 patch `currentTurn` 还是插入轻量 turn 行 — 优先 patch 当前 turn 的 `agent_response.rationale` 并 upsert，避免历史里堆出「同曲空壳回合」。
