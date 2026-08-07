# 推荐策略改造技术方案（三条原则）

> 日期：2026-07-15（代码基线：`ed36b62`）
> 状态：✅ **已实施**（M1–M4 全部落地，`@lyra/core` 测试 166 passed；实施摘要见文末）
> 适用范围：iOS App（`app-mobile/`）+ 推荐核心（`packages/core/`）；桌面端共用 `@lyra/core`，改动自动覆盖
> 关联文档：`docs/song-recommendation.md`（现有推荐架构）、`docs/emotional-computing.md`

---

## 0. 需求与决策摘要

用户提出三条推荐策略原则，关键决策已确认：

| # | 原则 | 已确认决策 |
|---|---|---|
| 1 | 「点我试试」用当前时间/天气/日期推荐 | **天气本期不做**；时间/日期/季节驱动现状已具备，仅补齐文案与入口一致性 |
| 2 | 用户输入心情后，所有推荐围绕该心情、不能放松、权重要高 | **彻底移除轨迹预测**；心情锁定到用户再次明确说新心情才切换；锁定期间心情打分权重提高、惩罚/多样性收敛 |
| 3 | 优先按歌名匹配（如「山丘」），命中作为第一首播放 | **本地曲库匹配 + B 站搜索兜底**，都未命中才降级为心情推荐 |

---

## 1. 原则 1：「点我试试」时间/日期驱动

### 1.1 现状（已满足大部分）

`Orchestrator.onLyraStart`（`packages/core/src/turn/Orchestrator.ts:718-758`）已经：
- `computeTimeContext()` 计算季节 / 星期几 / 时段（早通勤→深夜）/ 是否上班；
- 用 `timeCtx.defaultMoodTags` 当情绪 labels、`timeCtx.pseudoTarget`（如「夏日的周三下午，上班时间」）当推荐目标；
- `buildBrief`（`packages/core/src/agents/CompanionAgent.ts:146-153`）已把「现在是什么时候」注入 LLM，rationale 会应景。

### 1.2 差距与改动

| 差距 | 改动 |
|---|---|
| 无天气（本期明确不做） | 在 `TimeContext` 类型上预留 `weather?: WeatherContext` 扩展点（`{ condition, tempC, source }`），不实现取数逻辑；后续接 wttr.in / Open-Meteo + 定位时只改取数层 |
| 入口文案重复 | 建议把 `timeCtx.pseudoTarget` 同时透传给 UI 首屏（`ThinkingNote` 过渡态可显示「夏日的周三下午，给你挑一首」），改动在 `MobileHomeView.tsx` 读取 `state.turn.agent_response` 时带上时间上下文（小改，可选） |

**结论：原则 1 基本是"保持现状 + 预留天气接口"，工作量最小。**

---

## 2. 原则 2：心情锁定 + 高权重 + 移除轨迹预测

### 2.1 现状的三处"放松"

1. **轨迹预测漂移**：`EmotionAgent` 返回可选 `predicted_trajectory`（emotion prompt `emotion.ts:83-88` 生成，`EmotionAgent.ts:54-72` 校验）；`computeAutoAdvanceBaseEmotion`（`Orchestrator.ts:423-439`）在连播 ≥3 分钟且在 horizon 内时，用**预测 pad 替换真实心情 pad** 去选歌 → 用户感知"越听越不对味"。
2. **权重固定**：`LibraryAgent.profileScore` 打分权重写死（pad 0.28 / mood 0.22 / …），无"心情锁定"概念。
3. **惩罚与多样性稀释**：疲劳惩罚（0.45~0.20）、反馈惩罚（≤0.30）、分层抽样多样性带（15%~70% 来自高分带之外）都会冲淡心情匹配。

### 2.2 改动 A：彻底移除轨迹预测

| 文件 | 改动 |
|---|---|
| `packages/core/src/agents/prompts/emotion.ts:83-90` | 删除 `predicted_trajectory` 的 prompt 说明与示例 |
| `packages/core/src/types/dialogue.ts:9-11` | 删除 `CurrentEmotion.predicted_trajectory` 字段 |
| `packages/core/src/agents/EmotionAgent.ts:54-72` | 删除轨迹预测的解析/校验分支 |
| `packages/core/src/turn/Orchestrator.ts:423-439` | 删除 `computeAutoAdvanceBaseEmotion` 的轨迹分支，**直接返回 `endedEmotion`**（函数保留，逻辑退化为恒等；或删除函数、调用点直用 `endedEmotion`） |
| `packages/core/src/db/codec/emotionSnapshot.ts:38` | 更新注释（字段已不存在） |
| `packages/core/src/turn/Orchestrator.ts:763` | 更新 `onSkip` 注释（不再有"不带轨迹预测"的特殊说明） |

> 验证：`Orchestrator.test.ts` / 相关单测里若有 `predicted_trajectory` 用例一并删除；`pnpm --filter @lyra/core test` 全绿。

### 2.3 改动 B：心情锁定模式（moodLocked）

**核心思路**：新增一个贯穿上下文 → 预筛 → 打分的"心情锁定"开关。有锁定时，选歌情绪永远来自锚点，权重向心情倾斜，惩罚与多样性收敛。

**B1. 上下文标记**：`RecommendationContext` 新增 `moodLocked?: boolean`（`packages/core/src/recommendation/types.ts`），`buildRecommendationContext`（`buildContext.ts`）增加 `opts.moodLocked` 透传；Orchestrator 调用时传 `this.sessionMoodAnchor?.locked === true`。

**B2. 锚点改造**（`Orchestrator.ts`）：
- `sessionMoodAnchor` 增加来源标记：`{ labels, pseudoTarget, locked: boolean }`。
- 用户输入心情（`onUserInput`，:688-695）：`locked = true`（直到用户说新心情）。
- 「点我试试」（`onLyraStart`，:742）：`locked = false`（时间驱动不锁定，随时段变化走）。
- **锚点更新策略**：仅当本轮输入被判定为"心情表达"时才更新锚点（见原则 3 的意图分流）；点歌/闲聊不覆盖锚点。
- `prefetchMore`（:908-911）与 `onSongComplete`（:1133）已用锚点 pseudoTarget，保持；锁定时 emotion 用锚点情绪本身（`sessionMoodAnchor` 存下当时 `pad`，避免依赖 endedEmotion）。

**B3. 打分权重随 moodLocked 切换**（`LibraryAgent.ts`）：
- `profileScore` 增加 `moodLocked` 参数；锁定时的权重：

| 维度 | 普通模式 | moodLocked |
|---|---|---|
| PAD 距离 | 0.28 | **0.38** |
| mood 标签重合 | 0.22 | **0.32** |
| 歌词主题 | 0.10 | 0.08 |
| 流派亲和 | 0.08 | 0.06 |
| 能量匹配 | 0.07 | 0.06 |
| 时间维度 | 0.12 | 0.06 |
| 场景 | 0.10 | 0.04 |
| 随机扰动 | 0.08 + novelty×0.18 | **0.04 + novelty×0.06** |

（权重合计保持 ≈1，仅重心移向心情；数值为建议值，实施时以单测校准）

**B4. 惩罚与多样性收敛**（`diversity.ts` / `LibraryAgent.applyRecommendationAdjustments`）：
- `fatiguePenaltyWeight` / `feedbackPenalty` 传入 `moodLocked`：锁定时疲劳权重 0.45→0.15、反馈上限 0.30→0.10（跳过信号仍应有效，只是权重降低）；
- `stratifiedSample` 锁定时 `diversitySplit` 多样性带 15%~70% → **5%~20%**（近 80% 从高分带取，保证贴近心情）。

**B5. LLM 侧强化**：`CompanionAgent.buildBrief` 增加一行锁定提示（如「用户当前处于心情锁定状态，选歌必须严格贴合 labels=[…] 与 PAD，不要偏离」），并在 prompt 中要求 rationale 呼应锁定的情绪。

### 2.4 行为示例

```
用户: 我很累
  → EmotionAgent: pad=(0.1, -0.3, -0.5), labels=[疲惫], anchor.locked=true
连播 #1/#2/#3: 一律用 锚点pad + pseudoTarget("我很累 疲惫") 选歌，
               无轨迹漂移，mood/pad 权重 0.70，疲劳/反馈/多样性收敛
用户: 来点开心的
  → EmotionAgent: labels=[开心], anchor 更新为 开心, locked 仍 true
用户: 点我试试 (在播放中)
  → 不覆盖锚点（仅初始入口设置锚点）
```

---

## 3. 原则 3：歌名优先匹配（本地 + B 站兜底）

### 3.1 现状

- 无歌名匹配：`parseTrackIdentity`（`packages/core/src/library/parseTrackIdentity.ts`）是**入库时**解析 B 站标题的工具，其中 `unwrapBookTitle` 已能从 `《山丘》` 提取歌名，可复用；
- `searchBilibili`（`packages/core/src/bilibili/api.ts:54-67`）已有 hint 机制：query 为 2-12 字符、无空格、非情绪词时，会搜 `百万豪装录音棚 <hint>`——**B 站歌名兜底可直接复用**；
- `libraryRepo` 只有 `listAll/getTrack/findByPath`，**没有按 title 查询**。

### 3.2 设计

**新增 `packages/core/src/library/songIntent.ts`**，导出：

```ts
type SongIntentResult =
  | { kind: "song"; song: LibraryTrack; source: "local" | "bilibili" }
  | { kind: "mood"; reason?: string }; // 未命中 → 走心情推荐

export async function resolveSongIntent(
  text: string,
  opts: { library: LibraryRepoLike; fetchBilibili?: boolean },
): Promise<SongIntentResult>;
```

匹配流程（优先级：**歌名 > 歌手 > 心情**）：

```
用户输入 text
 ├─ 1) 提取歌名候选：`《...》`（unwrapBookTitle）或去除歌手/请求语气后的短语
 ├─ 2) 本地匹配 findByTitle(候选)：
 │       ● title 归一化（去【】/歌词/频道名噪音、去空格、大小写折叠）
 │       ● 候选串 ∈ title 或 title 核心词包含候选（如「山丘」命中《山丘》）
 │       ├─ 命中 → kind:"song", source:"local"  （多个命中取播放量最高/最近未播）
 │       └─ 未命中 ↓
 ├─ 3) B 站兜底 searchBilibili(`百万豪装录音棚 <候选>`, limit 5)：
 │       ├─ 命中 → batchInsertTracks 入库 + resolvePlayUrl 拿音频 URL → kind:"song", source:"bilibili"
 │       └─ 未命中/失败 → kind:"mood"
```

配套改动：

| 文件 | 改动 |
|---|---|
| `packages/core/src/db/repo/libraryRepo.ts` | 新增 `findByTitle(candidates: string[]): Promise<LibraryTrack[]>`（SQL `title LIKE` 归一化匹配；曲库规模小，可 `listAll` + 内存归一化匹配起步） |
| `packages/core/src/turn/Orchestrator.ts` | `onUserInput` 最前调用 `resolveSongIntent`：命中 → 走**点歌 turn**（`playSongByIntent` 新私有方法，见下）；未命中 → 现有 `runTurnWithEmotion` 心情路径，并保留 `emotionAgent.analyze` 结果更新锚点 |
| `packages/core/src/agents/prompts/companion.ts` | prompt 增加点歌模式说明（可选，点歌 rationale 也可用模板） |

**点歌 turn（`playSongByIntent`）**：
1. 记录 turn（`modality: "text"`，`agent_response.song_id = 命中曲目`）；
2. rationale 生成：优先用 Companion 单候选调用生成「《山丘》…」应景文案；失败用模板「你点的《山丘》」；
3. `audio.playFile` 直接播放（iOS 首曲路径）或 `prefetchMore` 入队；
4. **不更新心情锚点**；播完后连播回到锚点/时间驱动（原则 2 逻辑）；
5. 命中曲目加入本次会话 exclude（避免紧接着重复）。

### 3.3 边界与歧义处理

- **含《》必然点歌**；无《》时先本地匹配，命中才点歌，未命中按心情——避免把「来点开心的」误判为歌名。
- 本地多首命中：按 `play_count` 降序取最高（曲库来自 B 站，play_count 是有效信号）。
- B 站兜底失败（网络/无结果）：静默降级心情推荐，不打断用户体验。
- 与现有 `artistFilter`（「歌手的歌」）共存：`resolveSongIntent` 只处理歌名；歌手意图仍走 `parseArtistIntent`，歌名判定优先于歌手判定。
- 「山丘」类短词命中《山丘》的概率高；但注意误报（如「童话」），可加最小长度（≥2 字符）与排除词（情绪词/功能词）过滤。

---

## 4. 实施顺序与验证

### 4.1 建议实施顺序（每步独立可回退）

1. **M1 移除轨迹预测**：删 prompt 字段/类型/校验/使用分支 → 跑 `@lyra/core` 单测 + 相关集成测试。
2. **M2 歌名匹配**：`libraryRepo.findByTitle` → `library/songIntent.ts`（**本地 + B 站兜底均已落地**：本地 title 匹配 → 未命中 `searchBilibili` 搜歌名 → 标题包含过滤 → 入库）→ `Orchestrator.onUserInput` 接入 + `playSongByIntent` → 单测覆盖命中/未命中/B站命中/降级。
3. **M3 心情锁定**：`RecommendationContext.moodLocked` → 锚点改造（来源标记 + 更新策略）→ LibraryAgent 权重/惩罚/多样性收敛 → buildBrief 锁定提示 → 单测校准权重。
4. **M4 入口文案与天气预留**：`TimeContext.weather?` 扩展点 + UI 首屏时间文案（可选）。

### 4.2 验证方式

| 项 | 方式 |
|---|---|
| 权重/惩罚/多样性 | `LibraryAgent.test.ts` / `diversity.test.ts` 单测断言 moodLocked 下分数序（疲惫歌 > 欢快歌） |
| 歌名解析 | `songIntent.test.ts`：`山丘`→本地命中；`《X》`→强制点歌；冷门歌→B 站命中；情绪词→mood |
| 轨迹预测移除 | grep 全仓 `predicted_trajectory` 应为 0 命中；`Orchestrator.test.ts` 无相关用例 |
| 端到端 | iOS 真机/模拟器：输入「山丘」首曲为《山丘》→ 连播仍围绕原心情；「点我试试」文案应季 |
| 回归 | `pnpm --filter @lyra/core test`、`pnpm --filter lyra-mobile test`（app-mobile） |

### 4.3 风险

- **B 站兜底延迟**：点歌命中 B 站路径要现拉 URL，可能 1-3s；先显示「thinking」态，超时降级心情推荐。
- **moodLocked 误锁**：用户说「随便放点」会被当心情锁定吗？→ 语义分析层（EmotionAgent labels 置信度低时不锁定，`confidence < 阈值` 不设锚点）。
- **歌名误报**：「童话」命中《童话》但用户本意是心情 → 提供历史面板/播放中可跳过，靠反馈惩罚自愈。

---

## 5. 涉及文件清单

**移除轨迹预测**
- `packages/core/src/agents/prompts/emotion.ts`
- `packages/core/src/types/dialogue.ts`
- `packages/core/src/agents/EmotionAgent.ts`
- `packages/core/src/turn/Orchestrator.ts`（`computeAutoAdvanceBaseEmotion`）
- `packages/core/src/db/codec/emotionSnapshot.ts`

**心情锁定**
- `packages/core/src/recommendation/types.ts`（`moodLocked`）
- `packages/core/src/recommendation/buildContext.ts`
- `packages/core/src/recommendation/diversity.ts`（moodLocked 惩罚/多样性）
- `packages/core/src/agents/LibraryAgent.ts`（权重切换）
- `packages/core/src/agents/CompanionAgent.ts`（buildBrief 锁定提示）
- `packages/core/src/turn/Orchestrator.ts`（锚点来源标记 + 更新策略）

**歌名匹配**
- `packages/core/src/library/songIntent.ts`（新增）
- `packages/core/src/db/repo/libraryRepo.ts`（`findByTitle`）
- `packages/core/src/library/parseTrackIdentity.ts`（复用 `unwrapBookTitle`，可选导出规范化函数）
- `packages/core/src/turn/Orchestrator.ts`（`onUserInput` 分流 + `playSongByIntent`）
- `packages/core/src/bilibili/api.ts`（复用 hint 机制，可能补 `searchBilibiliByTitle` 薄封装）

**入口/天气预留（可选）**
- `packages/core/src/recommendation/timeContext.ts`（`weather?` 扩展点）
- `app-mobile/src/home/MobileHomeView.tsx` / `ThinkingNote.tsx`（首屏时间文案）

---

## 6. 实施摘要（2026-07-15）

M1–M4 已全部落地，14 个文件改动，`@lyra/core` 测试 **166 passed**（唯一失败为 pre-existing 的 `Orchestrator.integration.test.ts`，缺 `../reflect/trigger`）：

| 里程碑 | 落地情况 |
|---|---|
| **M1 移除轨迹预测** | `predicted_trajectory` 全仓 **0 hits**：prompt 字段 / `dialogue.ts` 类型 / `EmotionAgent` 校验 / `computeAutoAdvanceBaseEmotion` 恒等化 / `emotionSnapshot` 注释 + 3 个测试文件 |
| **M2 歌名匹配** | `libraryRepo.findByTitle`（大小写不敏感子串 + play_count 排序）、新增 `library/songIntent.ts`（《》强制点歌 + 短文本启发式 + 情绪词过滤 + **B 站兜底**：`searchBilibili` 新增 `forceKeyword` 参数，**始终只搜「百万豪装录音棚」频道**（不附歌名、不标题过滤，取频道最新一首）→`bilibiliTrackToLibrary`→入库→`source="bilibili"`）、`Orchestrator.playSongByIntent`（单候选 companion 文案 / 模板兜底、不覆盖心情锚点）、`onUserInput` 最前分流 |
| **M3 心情锁定** | `moodLocked` 贯穿 `RecommendationContext → buildContext → LibraryAgent 打分（pad 0.28→0.38 / mood 0.22→0.32）→ diversity 惩罚（疲劳 0.45→0.10 / 反馈 0.30→0.10 / 多样性 70%→20%）→ Companion buildBrief 锁定提示`；锚点加 `locked:boolean`（用户输入心情=锁定，点我试试=不锁定） |
| **M4 天气预留** | `WeatherContext` 类型 + `TimeContext.weather?` 扩展点 + index 导出；取数逻辑待接（wttr.in / Open-Meteo + 定位） |

**验收命令**：`cd packages/core && npx vitest run`（20 passed / 1 pre-existing failed / 1 skipped）。
**iOS 同步**：`cd app-mobile && pnpm build && pnpm cap:sync`（core 改动经 vite alias 自动进入 bundle）。
