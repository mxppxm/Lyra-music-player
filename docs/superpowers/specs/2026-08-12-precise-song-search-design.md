# 精准搜歌模式（双 icon 分段发送）

日期：2026-08-12  
状态：已定稿

## 问题

Lyra 主输入把「说心情」和「按歌名找歌」混在同一条管线里：

- 裸歌名本地未命中会退回心情推荐，用户以为在搜歌却听到不相关的歌
- 《歌名》虽会走 B 站，但强制加「百万豪装录音棚」限定词，且点歌后用**歌名文案**当 `sessionMoodAnchor`，连播容易跑偏

需要：**显式搜歌意图** + **通搜播放量最高** + **从歌曲画像抽心情驱动下一首**。

## 目标

1. 输入右侧用双 icon 分段明确模式：`↑` 心情 · `♪` 精准搜歌
2. `♪` 路径只搜歌、不进心情管线；未找到只提示
3. B 站通搜（不加频道限定词），按播放量取最高
4. 下一首：用该曲 `MusicProfile` 的 mood / best_for / PAD 注入锚点（不拿歌名当心情）；画像未就绪时先播，后台补齐再注入（策略 A）
5. `↑` 路径保持现有心情推荐，不被短歌名劫持去打 B 站

## 非目标

- 不做独立搜歌结果列表页 / 多结果点选（首版自动播最高匹配）
- 不改桌面端除非共享 `InputBox`/`Orchestrator` 自然带上（优先 app-mobile）
- 不移除现有《》启发式（心情路径里可继续当彩蛋；与 `♪` 解耦）

## 交互

### 分段控件

- 替换 `InputBox` 内单一发送钮为两格分段：左 `↑`（现有箭头 SVG）、右 `♪`（音符 SVG）
- 无文字标签
- **默认**高亮 `↑`
- **点当前高亮** → 按该模式提交（有文本时；空内容 disabled，与现发送钮一致）
- **点另一格** → 只切换模式，不发送；占位符切换：
  - 心情：`和 Lyra 说点什么…`（保持现文案）
  - 搜歌：`输入歌名…`
- 键盘 Enter / `enterKeyHint`：跟随当前高亮模式

### 动效（丝滑）

- 高亮滑块在两格间位移动画（短时长，约 180–220ms，ease）
- 胶囊边框 / 轻着色在搜歌模式下过渡（不过度发光）
- 占位符淡入淡出或瞬时替换均可，避免布局跳动
- iOS 若已有触感封装：模式切换轻触一下；没有则跳过

## 架构

```
InputBox (mode: mood | song)
  ├─ mood  → orchestrator.onUserInput(text)          // 现状
  └─ song  → orchestrator.onSongSearch(text)         // 新入口
```

推荐独立 `onSongSearch`，避免把搜歌分支塞进 `onUserInput` 继续膨胀。

### `onSongSearch(text)` 流程

1. `enqueueTransition`（与其它播放切换互斥）
2. emit `thinking`
3. **本地**：`libraryRepo.findByTitle([trimmed])`（现有 `includes`）→ 有则取排序第一首 → `playResolvedSong(song, text, { source: "local" })`
4. **B 站**：`searchBilibiliOpen(title)`（见下）→ 有则 `bilibiliTrackToLibrary` + `batchInsertTracks` → `playResolvedSong`
5. **未命中**：emit `error`（文案如「没找到这首歌」），**不**调用 EmotionAgent / LibraryAgent / Companion 选歌
6. 埋点：`song_search_hit` / `song_search_miss`（可与现有 `song_intent_*` 区分或扩展 props）

### B 站通搜 `searchBilibiliOpen`

相对现有 `searchBilibili`（频道限定 + `order: pubdate`）：

| 项 | 现有频道搜 | 精准搜歌 |
|--|--|--|
| keyword | `百万豪装录音棚 …` | **仅歌名** |
| order | `pubdate` | **`click`（播放量）** |
| 取片 | 列表前几条 / 首条 | 按 `play_count` 最高一条 |
| 时长过滤 | 1.5–10 分钟 | **保留**（滤广告/短视频） |

实现偏好：给 `searchBilibili` 增加 options（`keyword` / `order` / `channelScoped`），或抽 `searchBilibiliByPlayCount(title)`，避免破坏预计算 / 艺人会话等调用方。

### 播放与下一首锚点（策略 A）

复用 / 收敛 `playSongByIntent` 为「已解析曲目播放」：

1. **立刻** `playFile` + 写 turn + emit `playing`（rationale 可用模板「你点的《…》」或 Companion 单候选；失败则模板）
2. **不要**用 EmotionAgent 分析用户输入的歌名来设 `sessionMoodAnchor`
3. 若本地已有可用 `MusicProfile`：立即 `injectAnchorFromProfile(profile)`
4. 否则：`scheduleBackgroundProfiling({ priorityTrackIds: [song.id], limit: 1 })`；profiling 完成后（或 Orchestrator 内 await 一次优先分析）再 `injectAnchorFromProfile`
5. 画像未到前：可用 soul 当前 PAD + 时段 `pseudoTarget` 作软锚，或暂不 `locked`；**禁止**把歌名写入 `labels` / `pseudoTarget`

`injectAnchorFromProfile(profile)`：

- `labels` ← `profile.mood`（可并入少量 `best_for`，避免过长）
- `pseudoTarget` ← labels / best_for 拼成的场景串（**不是**歌名）
- `locked: true`
- turn 的 `current_emotion.pad` 优先真实音频 PAD，否则 `pad_estimate`

之后 prefetch / `onSongComplete` 继续吃 `sessionMoodAnchor`，LibraryAgent 按标签相似推下一首——**现成连播逻辑，只换注入源**。

### 心情路径

- `onUserInput` 行为保持；短文本本地未命中仍回落 mood（**不**因本功能放开裸名打 B 站）
- 《》启发式可保留，与 `♪` 独立

## 主要改动面

| 区域 | 文件（预期） |
|--|--|
| UI | `app-mobile/src/home/InputBox.tsx` + `mobile.css`；`MobileHomeView` 按 mode 调不同 submit |
| Orchestrator | `packages/core/src/turn/Orchestrator.ts`：`onSongSearch`、锚点注入、与 `playSongByIntent` 对齐 |
| B 站 | `packages/core/src/bilibili/api.ts`：通搜 + `order=click` |
| 画像 | 复用 `scheduleBackgroundProfiling` / `MusicProfileAgent`；补「优先轨分析完回调注入」若现有 fire-and-forget 不够 |
| 测试 | `InputBox` 交互；`onSongSearch` 本地命中 / B 站命中 / miss；锚点不来自歌名；`searchBilibili` options 回归 |

## 错误与边界

- 空串：UI 不提交
- B 站超时/网络失败：等同 miss，友好提示，不进心情
- 多本地 `includes` 命中：保持现排序（play_count desc）取第一条
- 用户在搜歌播放中又 `↑` 发心情：现有 `onUserInput` 清锁 / 新锚点逻辑接管（不另开例外）

## 验收

1. 默认 `↑`，点 `♪` 只切换，占位符变为「输入歌名…」
2. 搜歌模式下输入存在的本地歌名 → 播到该曲（includes）
3. 本地没有 → B 站结果为通搜高播放，而非录音棚频道限定
4. 搜不到 → 提示没找到，不出现心情推荐歌
5. 搜到后连播：锚点来自歌曲 mood 标签，不把歌名当 labels
6. 模式切换动画无明显卡顿；空输入不能发送

## 决议记录

- 匹配：继续 `includes`，但搜歌意图不可退回心情
- 意图表达：输入侧双 icon 分段（非独立搜歌页）
- 图标：`↑` 心情 · `♪` 精准搜歌
- B 站：无频道限定词，`order=click`
- 下一首：从歌曲画像注入心情；冷启动策略 A（先播后补画像再注入）
