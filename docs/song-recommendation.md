# 歌曲推荐功能架构梳理（重点：iOS App）

> 落地日期：2026-07-15（代码基线：`ed36b62`）
> 最近更新：2026-07-15（已实施 moodLocked 心情锁定、歌名优先匹配、移除轨迹预测）
> 覆盖范围：Lyra 从「理解用户情绪」到「选歌 → 播放 → 反馈回流」的整条推荐闭环，重点说明 iOS App（`app-mobile/`）侧的接入方式
> 目的：让新贡献者 / 未来的自己在 10 分钟内建立推荐功能的完整心智模型
> 关联文档：`docs/emotional-computing.md`（情绪感知 → 音乐回应的闭环，本文档聚焦选歌链路本身）

---

## 0. 一句话总结

Lyra 的推荐是 **「意图分流 → 情绪分析 → 上下文构建 → 规则预筛 → LLM 最终选歌 → 原生播放队列 → 反馈回流」** 的闭环：

1. **意图分流**：输入先查**歌名**（如「山丘」→ 本地/B站匹配 → 直接播放），未命中才当心情处理；
2. **EmotionAgent** 把用户一句话解析成 PAD 情绪坐标 + 中文情绪标签；
3. **buildRecommendationContext** 汇总播放历史 / 疲劳度 / 反馈统计 / 时间上下文 / 灵魂状态，并携带 `moodLocked`（心情锁定）标记；
4. **LibraryAgent.prefilter** 用**纯规则打分**（无 LLM）从曲库预筛出 ≤30 首候选；**锁定心情时心情相关权重 0.70，惩罚与多样性收敛**；
5. **CompanionAgent**（LLM）在候选里挑 1 首，并生成 15–40 字的推荐理由；
6. iOS 上首曲直接播放，后续歌曲通过 **prefetch 补队列**进入原生 AVPlayer FIFO 无缝连播；
7. 播完/跳过信号写回 `track_feedback` 表，下次推荐时变成疲劳/反馈惩罚。

**心情锁定（moodLocked）**：用户输入心情后锁定，后续连播全部围绕该心情，直到用户明确说出新心情才切换；「点我试试」不锁定。**已彻底移除轨迹预测**——不会再因 LLM 猜测情绪走向而悄悄偏离你设定的心情。

**iOS 上没有原生推荐逻辑**——选歌、打分、LLM 全部在 JS 层（`@lyra/core`），原生 Swift 只负责播放、锁屏与「补队列请求 / 自动切歌回传」两个信号。

---

## 1. 代码分层

| 层 | 位置 | 职责 |
|---|---|---|
| iOS UI / 驱动 | `app-mobile/src/` | React 界面、用户输入入口、队列补货驱动、播放历史面板 |
| 推荐核心 | `packages/core/src/recommendation/` | 上下文、历史、疲劳、多样性、时间、画像打分等纯逻辑 |
| 编排层 | `packages/core/src/turn/Orchestrator.ts` | 状态机：`pickNextSong` 汇聚所有选歌路径 |
| Agent | `packages/core/src/agents/` | EmotionAgent（情绪）、LibraryAgent（预筛）、CompanionAgent（LLM 选歌）、MusicProfileAgent（歌曲画像） |
| 平台桥 | `packages/platform-ios/` | Capacitor 插件 `LyraAudio` 的 JS 封装、SQLite、bundle 资源 |
| 原生 | `app-mobile/ios/App/App/LyraAudioPlugin.swift` | 单实例 AVPlayer + FIFO 队列、锁屏、后台任务 |

> 桌面端（`app/`，Tauri）复用同一套 `@lyra/core`，但它有自己的 Orchestrator 副本和 ProactiveEngine（`app/src/App.tsx`），iOS 侧不跑 proactive 引擎，只消费 `proactive-pending` 状态。

---

## 2. 数据从哪来（曲库 / 画像 / 音频特征）

### 2.1 曲库（元数据）
- **iOS bundle 种子**：首次启动 `seedMobileLibraryIfNeeded()`（`app-mobile/src/db/seedLibrary.ts:5-21`）在本地曲库不足 50 首时，导入 `app-mobile/public/library-seed.json`（约 405KB，B 站「百万豪装录音棚」频道元数据快照，`id=bili:BVxxx`，只有元数据、无音频 URL）。
- **B 站搜索全量同步**：空库冷启动时，重写后的 `library.prefilter`（`packages/core/src/turn/createOrchestrator.ts:128-247`）调 `searchBilibili("百万豪装录音棚", 9999)`，一次性把全部元数据 `batchInsertTracks` 进 SQLite（:191-201），随后用真实 prefilter 重跑打分。
- **按歌手导入**：`artistFilter` 时按歌手把曲目拉进本地库（createOrchestrator.ts:86-126）。
- **音频 URL 惰性解析**：曲目 `path` 是 `bili:__pending__:BVxxx`，播放时经 `resolvePlayPath` → `getVideoCid` + `getAudioUrl`（durl MP4 优先、DASH AAC 兜底）现拉真实 URL（createOrchestrator.ts:254-277，`packages/core/src/bilibili/api.ts`）。

### 2.2 歌曲画像（music_profile）
- LLM 对单曲产出结构化画像：genre / mood / energy_level / tempo_feel / time_color / space_color / instrumentation / vocal_style / lyrical_themes / emotional_curve / best_for / pad_estimate（`packages/core/src/agents/MusicProfileAgent.ts:70-131`）。
- 种子：bundle 里的 `lyra.db`（含部分画像与反馈种子，`packages/platform-ios/src/db.ts`）。
- 增量：`scheduleBackgroundProfiling`（`packages/core/src/recommendation/backgroundProfiling.ts`）在每次 prefilter 后 fire-and-forget 给缺画像/旧画像的候选曲（≤8 首）补全画像（createOrchestrator.ts:153、:206、:230）。

### 2.3 真实音频特征（FFT PAD）
- `packages/core/src/bilibili/audioFeatures.ts`：对音频波形做 FFT，把 energy / valence / bpm 映射成 PAD（`featuresToPAD`，:108-115），缓存进 `lyra-audio-features.json`。
- iOS 只读 bundle 缓存；每次 prefilter 时把 `audioPadMap` 注入候选（createOrchestrator.ts:134-146），供打分与 LLM 使用——这是「硬数据」，优先级高于 LLM 猜测的 `pad_estimate`。

---

## 3. 推荐链路详解

### 3.1 情绪分析（EmotionAgent）
`EmotionAgent.analyze`（`packages/core/src/agents/EmotionAgent.ts:97-153`）用 `EMOTION_SYSTEM_PROMPT`（`packages/core/src/agents/prompts/emotion.ts`）返回：
`{ pad: {p,a,d}, labels: string[], confidence, source }`，PAD 值域 [-1,1] 校验。（轨迹预测 `predicted_trajectory` 已于 2026-07-15 彻底移除）
`onUserInput` 里 `blendEmotionWithBias` 混合后更新 `sessionMoodAnchor`（Orchestrator.ts:688-695、:1156-1169）——**会话心情锚点**保证连播不走样。

### 3.2 推荐上下文（buildRecommendationContext）
`packages/core/src/recommendation/buildContext.ts:25-73`，每次选歌调一次：

| 字段 | 来源 | 说明 |
|---|---|---|
| `excludeIds` | `buildExcludeSet`（playHistory.ts:39-68） | 硬排除最近 **20** 首（`HARD_EXCLUDE_WINDOW`），曲库极小时放松到 3 |
| `fatigueByTrack` | `buildFatigueMap`（playHistory.ts:74-99） | 扫描最近 **60** 轮（`FATIGUE_WINDOW`），指数衰减的软疲劳度 [0,1] |
| `recentPlays` | `extractPlayHistory`（playHistory.ts:9-32） | 最近播放列表（newest first），喂给 Companion prompt |
| `feedbackStats` | `getFeedbackStats`（musicProfileRepo.ts） | 每曲 completed / skipped / repeated 计数 |
| `noveltySeeking` | `soul.musical_taste_base.aesthetic_axes.novelty_seeking` | 灵魂审美轴，clamp [0,1]，决定「多样性 vs 情绪匹配」权衡 |
| `timeContext` | `computeTimeContext`（timeContext.ts） | 季节 / 星期 / 时段 / 上班休息 → 中文标签 + pseudoTarget |
| `emotionLabels` | EmotionAgent | 供预筛 mood 匹配 |

历史扫描上限 `HISTORY_SCAN_LIMIT = 80` 轮（types.ts:51-60）。

### 3.3 规则预筛（LibraryAgent.prefilter）—— 唯一无 LLM 的环节
`packages/core/src/agents/LibraryAgent.ts:190-274`：
1. `listAll()` 全量曲库 → 排除 `excludeIds`（或按 `artistFilter` 过滤 + 会话去重/循环，:203-231）；
2. 逐曲打分 `profileScore`（:96-156），权重如下：

| 维度 | 普通模式 | moodLocked | 说明 |
|---|---|---|---|
| PAD 距离 | **0.28** | **0.38** | 用户情绪 PAD ↔ 歌曲 PAD（真实 FFT 优先，其次 `pad_estimate`） |
| mood 标签重合 | **0.22** | **0.32** | `tagOverlap`（profileScoring.ts，含中英互译） |
| 歌词主题 | 0.10 | 0.08 | lyrical_themes 重合 |
| 流派亲和 | 0.08 | 0.06 | `genreAffinityScore`（对 soul 底色） |
| 能量匹配 | 0.07 | 0.06 | `energyMatchScore`（对 PAD.a 维度） |
| 时间维度 | **0.12** | 0.06 | `timeContextScore`（季节/时段/best_for/time_color），退化回小时×time_color |
| 场景 | 0.10 | 0.04 | 用户 query 分词 vs `best_for` |
| 随机扰动 | 0.08 + novelty×0.18 | 0.04 + novelty×0.06 | 多样性注入（锁定期间收敛） |

3. `applyRecommendationAdjustments`（:158-176）：减疲劳惩罚 `fatigue × fatiguePenaltyWeight(novelty)`（0.45→0.20）+ 反馈惩罚 `feedbackPenalty`（diversity.ts:23-35，最多 0.30）；
4. 无画像曲目走 `profileSearchHaystack` 关键词兜底（profileScoring.ts:86-105，中文 bigram tokenize）；
5. **`stratifiedSample` 分层抽样**（diversity.ts:52-82）：top 高分带 + 多样性随机带（15%~70% 来自高分带之外，随 novelty 变化），最终返回 **≤30 首**候选。

### 3.4 LLM 最终选歌（CompanionAgent.choose）
`packages/core/src/agents/CompanionAgent.ts:239-299`，prompt 在 `packages/core/src/agents/prompts/companion.ts:4-101`（`COMPANION_SYSTEM_PROMPT`）：

- 输入：用户话语 + 当前情绪(PAD+labels) + 灵魂状态（音乐底色/心情/共同记忆） + **30 首候选**（每首带 music_profile + 真实音频 PAD + 近期已播 + 时间上下文 + 上一首 DJ 转场上下文）；
- 输出：`{ song_id, target_profile, rationale, needed_shift }`，rationale 是 15–40 字的推荐理由（展示为 SmallNote）；
- **校验与降级**：song_id 不在候选内重试一次（:269-286）；仍失败则 `pickFallbackSongId` 取最低疲劳候选（:291-296）；
- `writeTrace` 记录推理轨迹到 `reasoning_traces` 表（:260-266）。

### 3.5 选歌汇聚点（Orchestrator.pickNextSong）
`packages/core/src/turn/Orchestrator.ts:344-421`——**所有推荐路径的唯一汇聚点**（用户输入、自动连播、proactive 都走它）：
```
buildRecommendationContext(soul)  →  library.prefilter(target, pad, 30, ctx)
→  musicProfileRepo.getBatch + getMemoryContext()  →  companion.choose({...})
→  candidates.find(chosen.song_id) → { song, rationale }
```
调用它的路径：
- `runTurnWithEmotion`（:456-508）：用户输入/连播/开场，选完歌 `turnRepo.insertTurn` + `audio.playFile`（iOS 上仅用于**第一首**，见 3.6）；
- `prefetchMore`（:892-944）：iOS 队列补货，用**会话心情锚点**做 pseudoTarget 连选 N 首（逐首 exclude 已入队 id）；
- `fulfillProactive`（:527-599）：proactive 意图只预选不播放，emit `proactive-pending`，等用户输入落地；
- `onNativeAutoAdvanced`（:960-1041）：原生已自动切歌时补 rationale（miss 时用单候选跑一次 companion 生成真实文案，:1049-1078）。

### 3.6 iOS 播放与队列（重点）
iOS 是「**JS 选歌 + 原生播放**」架构：

```
usePrefetchNext.ts（4 路触发）
  ├─ 新歌开始（song-start）→ clearNextTrack + clearPrefetchedNext + refill
  ├─ 原生 refillQueue 事件（后台/播放中，native 请求补货）
  ├─ 原生 nativeAdvanced 事件（原生已切歌）
  └─ 前台每 45s 定时补货
        ↓
refillPlaybackQueue.ts：TARGET_QUEUE_DEPTH = 5
  getPlaybackQueueInfo() 查当前队列 → need = 5 - count
  → orchestrator.prefetchMore(need, songIds)   // JS 选歌 + 解析 URL
  → LyraAudio.appendToPlaybackQueue({tracks})  // 进原生 FIFO
```

原生侧（`app-mobile/ios/App/App/LyraAudioPlugin.swift`）：
- **不是 AVQueuePlayer**，而是单实例 `AVPlayer` + 自维护 FIFO `pendingNextTracks`（:43、:75），实现无缝队列；
- 播放带 bilibili UA/Referer；流失败或静音 10s → `startDownloadFallback` 下载本地 m4s 再播（:494-566）；
- `handlePlaybackEnded`（:712-730）：有下曲 → `playPrefetchedNext` 无缝切歌并 `requestQueueRefill` 请求 JS 补货；队列空 → `emitEnded` + 后台任务让 JS 跑 LLM 选下一首；
- 后台：`beginRefillBackgroundTask` + `installEndProximityObserver`（:910-932）在后台播放结束前 **20s** 开 background task，保证 JS 有充足时间跑 LLM；锁屏 Now Playing + 远程控制（:943-990）；Live Activity 已禁用（:1008-1009）。

状态同步：`useAutoAdvance.ts`（ended→`onSongComplete`、`nativeAdvanced`→`onNativeAutoAdvanced`、前台 `drainNativeAdvanced`/`getPendingEnded` 兜底）、`useNowPlaying.ts`（锁屏元数据 + 远程命令回路由）、`useProgress.ts`（500ms 轮询）。

### 3.7 反馈回流（闭环）
```
播完 ended / 跳过 skip
  → Orchestrator.onSongComplete / onSkip
  → finalisePreviousTurn → turnToFeedback（Orchestrator.ts:1178-1207）
  → musicProfileRepo.insertFeedback（track_feedback 表）
  → 下次 buildRecommendationContext → feedbackPenalty 惩罚被跳过的歌
另外：灵魂情绪 soulStore.apply(delta) 演进（Orchestrator.ts:245-249）；SalientMoment 写入 shared_memory（moments/salient.ts）
```

### 3.8 UI 展示（iOS）
| 组件 | 展示内容 |
|---|---|
| `SmallNote.tsx` | LLM 推荐理由 `rationale`（永远完整显示） |
| `SongInfo.tsx` | 《标题》· 艺人（Marquee） |
| `ThinkingNote.tsx` | thinking 态「Lyra 正在想…」 |
| `HistoryOverlay.tsx` | 播放历史面板：`listRecentTurns(50)` + 当时 rationale + 情绪色块；点击 → `onReplaySong` 重播 |
| 分享 | `share.ts` 用 `metadata.bvid` 拼 B 站视频链接 |

---

## 4. 关键参数速查

| 参数 | 值 | 位置 |
|---|---|---|
| 候选池上限 | 30 | Orchestrator.ts:381 / LibraryAgent.ts:22 |
| 历史扫描窗口 | 80 轮 | recommendation/types.ts:55 |
| 硬排除窗口 | 20 首（最小 3） | types.ts:53,59 |
| 疲劳衰减窗口 | 60 轮 | types.ts:57 |
| iOS 目标队列深度 | 5 首 | app-mobile/src/audio/refillPlaybackQueue.ts:6 |
| 前台定时补货 | 45s | app-mobile/src/audio/usePrefetchNext.ts:77-84 |
| 后台预补货提前量 | 播放结束前 20s | LyraAudioPlugin.swift:910-932 |
| 单次后台画像补全 | ≤8 首 | createOrchestrator.ts:155 |
| 分层抽样多样性带 | 15%–70%（随 novelty） | diversity.ts:6 |
| 疲劳惩罚权重 | 0.45–0.20（随 novelty） | diversity.ts:13 |
| 反馈惩罚上限 | 0.30 | diversity.ts:19 |

---

## 5. 已知限制与注意事项

1. **iOS 反馈信号只有 completed / skipped**：`onListenProgress` 在 app-mobile 无调用点（桌面端才有），所以 `listen_duration_ms` / `repeated` 恒为 0，`repeated` 反馈维度在 iOS 上不生效。
2. **B 站 CDN 不稳**：音频 URL 每次现拉，原生侧有 UA/Referer + 下载兜底双保险。
3. **冷启动**：本地库 <50 首时靠 bundle 种子；完全空库时首次 prefilter 会触发一次全量 B 站搜索同步（较慢）。
4. **LLM 依赖**：选歌最终一步依赖 LLM（默认 SenseNova 免费模型），失败链路有重试 + 最低疲劳兜底；无 provider 注册时 `createDefaultOrchestrator` 返回 null。
5. **proactive 引擎不在 iOS**：iOS 只消费 `proactive-pending` 状态展示，不自己触发意图。
6. 推荐理由 `rationale` 是 LLM 生成，仅在候选校验失败降级时才可能缺失（此时 SmallNote 展示降级文案）。
7. **歌名匹配 = 本地 + B 站兜底（始终只搜频道）**：`resolveSongIntent` 先本地 title 匹配（含《》强制点歌），未命中走 B 站兜底——**始终只搜「百万豪装录音棚」频道**（`searchBilibili("百万豪装录音棚", 5, "百万豪装录音棚")`，不附加歌名、不做标题过滤，本地没有就从频道取最新一首顶上），命中入库并直接播放（`source="bilibili"`，URL 由 `lazyPlayFile` 现拉）；搜索失败时静默降级为心情推荐。
8. **心情锁定不持久化**：`moodLocked` 为会话级状态（`sessionMoodAnchor.locked`），App 重启后回到时间驱动，不会沿用上次的心情锁定。

---

## 6. 代码路径索引

```
iOS 驱动
  app-mobile/src/App.tsx                       启动链（seed → migrations → boot → orchestrator）
  app-mobile/src/turn/useTurn.ts               useTurn(orc) 桥接
  app-mobile/src/home/MobileHomeView.tsx       主界面（handleSubmit/handleLyraStart）
  app-mobile/src/audio/usePrefetchNext.ts      队列补货 4 路触发
  app-mobile/src/audio/refillPlaybackQueue.ts  补货实现（目标深度 5）
  app-mobile/src/audio/useAutoAdvance.ts       播完/原生切歌状态同步
  app-mobile/src/audio/useNowPlaying.ts        锁屏元数据 + 远程命令
  app-mobile/src/db/seedLibrary.ts             本地曲库种子

推荐核心
  packages/core/src/recommendation/buildContext.ts    上下文构建
  packages/core/src/recommendation/playHistory.ts      历史/排除/疲劳
  packages/core/src/recommendation/diversity.ts        分层抽样/惩罚
  packages/core/src/recommendation/timeContext.ts      时间上下文
  packages/core/src/recommendation/profileScoring.ts   画像打分纯函数
  packages/core/src/recommendation/backgroundProfiling.ts  后台补画像

编排 / Agent
  packages/core/src/turn/Orchestrator.ts       状态机（pickNextSong:344 / prefetchMore:892 / onSongComplete:1091）
  packages/core/src/turn/createOrchestrator.ts 组装 + B 站 fallback（:128-247 / :254-277 / :293-313）
  packages/core/src/agents/EmotionAgent.ts     情绪分析
  packages/core/src/agents/LibraryAgent.ts     规则预筛打分
  packages/core/src/agents/CompanionAgent.ts   LLM 选歌
  packages/core/src/agents/prompts/companion.ts 选歌 prompt
  packages/core/src/agents/MusicProfileAgent.ts 歌曲画像生成

原生
  packages/platform-ios/src/nativeAudio.ts     LyraAudio 插件 JS 封装
  app-mobile/ios/App/App/LyraAudioPlugin.swift 单 AVPlayer + FIFO 队列 + 后台/锁屏
```
