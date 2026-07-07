# Design Answers — 对 `需求.md` §问题 的正式回答

**日期**：2026-07-07
**关联提交**：`bd78cbf`（Sprint 6 完成，v0.3-α 落盘）
**代码基线**：296 vitest（Sprint 2）→ 401（Sprint 3）→ 431（Sprint 4）→ 508（Sprint 5-6），全绿。

---

## 前言

`需求.md` 里的 7 个问题不是要求"给一段解释"，是**要求回答一个正在被建造的东西**。所以每条我都指向**具体代码路径**，而不是抽象概念——设计只有落地才叫设计。

顺序保留原文序号。问题 6 由 [Sprint 6 禅空虚净 polish 计划](./plans/2026-07-07-sprint-6-zen-polish.md) 答；问题 7 由 [Sprint 4 Perception Agent 计划](./plans/2026-07-07-v0.2-sprint-4-perception-agent.md) 答；其余 1-5 是设计原理性问题，下面逐条展开。

---

## 问题 1：歌曲的理解算法

### 我们**没有**用一个"理解算法"

这是刻意的架构决定。传统音乐 app（Spotify / Apple Music / 网易云）为每一首歌训练一个 embedding，用协同过滤 + Audio Feature Extraction（BPM / energy / valence / danceability）+ 内容标签做多维度特征向量。**Lyra 拒绝这条路**，因为它把"歌是什么"变成了一堆数字，而 Lyra 想把"歌是什么"变成**一句自然语言的描述**——像朋友告诉你的话。

### Lyra 的"理解"发生在三个层次

**L1 · 文件元数据层（`src/library/libraryScan.ts` + Rust `library_scan.rs`）**

最简单的一层：`walkdir` 扫目录、`lofty` 读 ID3。得到 `{ path, title, artist, album, duration_ms }`。这层不"理解"歌，只**索引**歌。存到 SQLite `library_tracks` 表。

**L2 · 关键词/tag 检索层（`src/agents/LibraryAgent.ts`）**

`LibraryAgent.prefilter(target: string, pad: PAD)` 做的事：把 CompanionAgent 生成的"歌的目标画像"（一段自然语言）分词，扫描 `library_tracks` 的 title/artist/album 字段做子串匹配，按命中数排序。**它不理解歌，它理解描述**——如果目标画像里有"慢速""钢琴""夜晚"这些词，它会命中包含这些词的歌名/艺人名。

这一层的**局限**是坦诚的：如果你的 mp3 都是 `0209 xxx_MP3_MP3.mp3` 这种命名（没有 metadata），LibraryAgent 就只能靠 PAD 距离（v0.1 还未实装）+ 随机采样兜底。这不是 bug，是**没有 embedding 的诚实代价**。

**L3 · LLM 生成"目标画像"层（`src/agents/CompanionAgent.ts`）**

这才是 Lyra 独有的"理解"。CompanionAgent 拿到：
- 用户的话（比如 "最近有点累"）
- 情绪状态（PAD）
- 灵魂状态（`soul.musical_taste_base` + `soul.dynamic_mood`）
- 记忆上下文（Living Portrait + top facts + shared memory）
- 30 个候选歌的 title/artist/album/duration

调用 Claude Opus 4.7，输出一段**自然语言的"目标画像"** + 从候选里选一首：

```
target_profile: "慢速起手,前 20 秒克制的钢琴,大提琴出现的时候能有一种被接住的感觉"
song_id: "track-abc123"
rationale: "看到希望的抬起"
needed_shift: "接住"
```

**这里的"理解"是 LLM 完成的**。Lyra 不训练自己的歌理解模型——她借用 Claude 的世界模型去理解"这首歌大概是什么样子"。这是 2026 年做小工具的最合理路径。

### 未来的第 4 层（v0.2 后半）

- **音频特征提取**：`essentia` / `librosa` 本地跑，把 BPM/energy/valence 存到 `library_features` 表（Sprint 1a 已经预留了 schema）。这样 LibraryAgent 的 PAD 距离 pre-filter 就能真正生效。
- **歌词语义 embedding**：把歌词丢 embedding 模型，向量库存本地。支持"来一首像《后来》那种遗憾感的歌"这种查询。

但都不着急。v0.1/v0.2 的关键词 pre-filter + LLM target profile 已经能让 Lyra 说出"看到希望的抬起"这样的话——这已经比 Spotify 强了。

### 相关代码

- 索引层：`src/library/libraryScan.ts:15-45`（TS wrapper），`src-tauri/src/library_scan.rs`（Rust walker）
- 检索层：`src/agents/LibraryAgent.ts:45-90`
- 生成层：`src/agents/CompanionAgent.ts:100-160`（buildBrief）+ prompt in `src/agents/prompts/companion.ts`

---

## 问题 2：歌曲怎么和情绪匹配的

### 匹配发生在**三个方向的加权**

在 Lyra 里"匹配"不是 cosine similarity 那种单一距离。是三个信号同时驱动：

**方向 A · 用户此刻情绪（PAD）**

`EmotionAgent.analyze(utterance)` → `CurrentEmotion { pad, labels, confidence, source }`。用户说"最近有点累"，PAD 大概输出 `{ p: -0.3, a: -0.2, d: 0 }`，labels `["疲惫"]`。这个 PAD 会：
- 传给 LibraryAgent 做 pre-filter（v0.2 加权，v0.1 保留字段）
- 传给 CompanionAgent 作为选歌上下文

**方向 B · 灵魂当下心情**

`SoulState.dynamic_mood.current_pad` 是**跨 turn 累积**的（详见 问题 4）。每次 turn 结束都 `soulStore.apply(delta)`。所以灵魂的当下心情反映的是"最近一段时间用户情绪的走向"，不是单一 turn。

CompanionAgent 的 brief 里明确会看到这个：
```
你的灵魂状态:
- backbone: 有品味的朋友:会推你可能第一遍不懂但三个月后会懂的歌
- affinity_genres: post-rock, modern classical
- 当下 recent_bias: 偏向温暖、慢速
- 共同记忆(最近一条): 慢速古典钢琴对他的深夜疲惫有效
```

**方向 C · 灵魂骨气（backbone）**

这是 Lyra 最反直觉的一环。`musical_taste_base.backbone` 是"她自己的品味"，季度演化一次，不追着用户跑。所以即使你连续拒绝她推的所有 post-rock，她也**不会立即变成 pop 舔狗**——她会记住你拒绝了、调整 confidence，但 backbone 依然坚持"我觉得你现在需要的可能不是安慰"。

Prompt 里有一句：
> **有骨气。宁愿在小注里说"我觉得你现在需要的不是安慰"，也别推一首讨好的糖水。**

### 匹配的最终决策

发生在 `CompanionAgent.choose()` 里的 Claude Opus 4.7 一次 LLM 调用。它拿到 A/B/C 三个方向 + 30 个候选歌 + Living Portrait + top facts，一次性输出：
- `target_profile`：想找的歌的样子（自然语言）
- `song_id`：从候选里挑一个最贴的
- `rationale`：一句 15-40 字的小注写给用户
- `needed_shift`：`接住 | 点燃 | 陪着 | 打断`

**注意 `needed_shift` 这个字段**。它不是"歌是什么样"，而是"我觉得你现在需要一次什么样的**情绪转换**"。这是把匹配从"找相似"升到"设计走向"的关键——她不是给你一首情绪相同的歌，她是**决定要把你从当前情绪推向哪里**。

### 匹配的验证反馈闭环

匹配对不对，通过**反应捕获**验证：
- 你完整听完 + 沉默 → `silence_positive: true` → Salient Moment 触发 → 事实进 `memory.md` Facts 段 → 下次同 tag 组合优先命中类似歌
- 你说"换一首" → verbal 反馈 → 情绪 delta 更新 soul → 下次 target_profile 会自我修正
- 你反复听 → repeated ≥ 2 → 强正向 Salient Moment → 灵魂 backbone 微微向那类靠近（季度演化）

这个闭环让"匹配"是**演化的**，不是**规则的**。她越用越准。

### 相关代码

- PAD → HSL 视觉映射：`src/lib/color.ts:15-45`（padHSL 公式）
- CompanionAgent 三方向 brief 组装：`src/agents/CompanionAgent.ts:75-125`
- Salient Moment 反馈闭环：`src/moments/salient.ts:30-70`
- 反应捕获：`src/turn/reactionCapture.ts:15-80`

---

## 问题 3：大模型是怎么选择一首歌

### 一次 LLM 调用完成"决策+解释"

不像有些 agent 框架分"感知/推理/行动"三次调用，Lyra 的 CompanionAgent **一次 LLM 调用**就完成选歌+写理由。这是刻意的——把决策和解释拆开会让"解释"变成事后合理化。

### 具体流程（`Orchestrator.onUserInput`）

```
1. 用户输入 "最近有点累"
2. EmotionAgent(Zhipu GLM-4-Plus 或 DeepSeek): 
     → CurrentEmotion { pad: {p:-0.3, a:-0.2, d:0}, labels: ["疲惫"], confidence: 0.7 }
3. LibraryAgent.prefilter(pseudoTarget, pad, 30):
     ← [song1, song2, ..., song30]  (关键词命中排序,或随机)
4. SoulStore.load() → SoulState
5. MemoryContext.get() → { livingPortrait, topFacts }
6. CompanionAgent.choose(Claude Opus 4.7):
     input: {
       userUtterance: "最近有点累",
       currentEmotion: <from #2>,
       soul: <from #4>,
       candidates: [<30 tracks>],
       livingPortrait: "他最近在追一个 side project...",
       topFacts: [ #时段:深夜 #状态:疲惫 → 慢速古典钢琴 ]
     }
     output: {
       song_id: "track-xxx",
       target_profile: "慢速起手,前 20 秒克制的钢琴...",
       rationale: "看到希望的抬起",
       needed_shift: "接住"
     }
7. audio.playFile(song.path)
8. Persist DialogueTurn to SQLite
```

### 三个 prompt 层次

**System prompt（`src/agents/prompts/companion.ts`）**：**是** Lyra。不写"you are an AI"，写"你是 Lyra —— 一个用歌回话的朋友"。规定输出 JSON 结构、`needed_shift` 只能是四选一、有骨气原则、不要用"温暖的钢琴"这种俗词。

**User message（`buildBrief`）**：具体每次调用变化的部分——用户的话 + 情绪 + 灵魂状态 + 记忆 + 候选歌单。是 CompanionAgent 内部拼装的，**用户看不到**。

**Reflect prompt（`src/reflect/prompt.ts`）**：季度反思用的另一个 prompt。用户按 Cmd+Shift+R 触发时才用。让 LLM 回看最近 30 turns，写：
- Living Portrait 更新
- Facts 库调整（add/increment/adjust）
- 一段 Dream narrative

### 为什么用 Claude Opus 4.7 而不是别的

Sprint 1a 决策：
- **情感 agent** → 智谱 GLM-4-Plus 或 DeepSeek V3（快、中文强、便宜）
- **灵魂 agent** → Claude Opus 4.7（有骨气、有品味、值得贵）
- **反思 agent** → 复用灵魂 agent 的 provider（同样品味）
- **工程师 agent**（v0.3） → Claude Code CLI 子进程（Sprint 5 数据模型已就位）

灵魂 agent 用最强的模型不是拍脑袋——**她是"人"，值得贵**。反之情感 agent 每 turn 都跑，用小模型才可持续。

### 错误处理与 fallback

选出的 `song_id` 不在候选列表 → 自动 retry 一次（LLM 收到"你上次选了 X 不存在,只能从这些 id 里选"）→ 仍失败则 fallback 到 `candidates[0]` 但保留 rationale/target_profile。这不是 slop —— 是**让 Lyra 尽力给你一首歌，比让她愣住更贴近陪伴人格**。见 `src/agents/CompanionAgent.ts:145-200`。

### 相关代码

- 编排：`src/turn/Orchestrator.ts:130-215` (`runTurnWithEmotion`)
- prompt: `src/agents/prompts/companion.ts` (中文, 60+ 行)
- retry+fallback: `src/agents/CompanionAgent.ts:145-200`

---

## 问题 4：怎么累积情绪，发展成情绪

### 三层节律，每一层做不同的事

灵感来自 `情绪引擎.md` 里的 companion 方案。落地时把它分成**turn / week / quarter** 三个尺度：

**每 turn（分钟级）· `soulStore.apply(delta)`**

每一次对话回合结束，情感 agent 根据用户反应算 `emotion_delta = post_pad - pre_pad`，soul store 把它加到 `dynamic_mood.current_pad` 上（clamp 到 [-1,1]）。

这是**快系统**——你 5 分钟内说了 3 句话，soul 的当下 PAD 就已经和 5 分钟前不同了。**不写日记的情绪**在这一层实时演化。

代码：`src/turn/soulStore.ts:45-85` (`apply` 方法)

**每周 / 手动 Reflect（小时到天级）· `ReflectAgent.run()`**

用户按 `Cmd+Shift+R` 或 auto dream 定时（每天 03:14 + idle 30min 触发）：
1. 拉最近 7-30 turns + emotion_snapshots
2. Claude Opus 深度反思一次
3. 输出 `ReflectResult`：
   - `livingPortrait`：2-4 段中文写你是谁
   - `factMutations`：facts 库的加/强化/削弱
   - `dreamNarrative`：她自己的一段散文反思

`applyReflectResult` 把这些沉淀进 `memory.md`。**这是慢系统**——它把无数 turn 的原始情绪，析出成"她对你的画像"和"她注意到的规律"。见 `src/reflect/ReflectAgent.ts` + `src/reflect/apply.ts`。

**每季度（周到月级）· 灵魂底色演化**

`musical_taste_base.aesthetic_axes`（4 维审美坐标）+ `affinity_genres` + `aversion_signals` + `backbone`。这些**只在季度演化**才动。演化事件写到 `evolution_log`，可以 rollback。

**这一层的存在解决了一个哲学问题**：如果灵魂的底色随每 turn 波动，她就没有"自我"了。有了这一层的稳定性，她才是**一个人**，不是一个响应模式。（v0.1 这个演化没有真跑，是 v0.3 的活；但数据模型和 schema 已就位——`src/types/soul.ts:35-60`。）

### 情绪的**记忆**：从 delta 到 fact

单次 `emotion_delta` 是**流水**。**沉淀**发生在两个地方：

**1. Salient Moments · 事件式记忆（`src/moments/salient.ts`）**

每 turn 结束后走 4 条规则判定是否"显著"：
- silent full listen（听完不说话）→ 正向锚点
- explicit positive verbal → 正向确认
- repeated ≥ 2 → 强正向
- explicit rejection → 负向锚点

命中→写 `shared_memory` 表 + append 到 `memory.md` Salient Moments 段。

**2. Facts · 模式式记忆（Reflect 时提炼）**

Reflect Agent 观察多个相似 turn，hypothesize："`#时段:深夜 #状态:疲惫` → 慢速古典钢琴"，写进 `memory.md` Facts 段。同 tag 再命中就 `n++` 并 EWMA `confidence` 向 0.85 靠拢。

**这两条通道把"发生过的情绪"变成"记住的情绪"**。前者是单次事件，后者是模式。前者驱动 CompanionAgent 的 `shared_memory` 上下文，后者驱动灵魂的 taste base 演化。

### PerceptionAgent（Sprint 4）—— 隐性情绪信号

用户不说话时也在传情绪。Sprint 4 落地了：
- 事件总线捕获 window focus/blur、mouse/key、input rate、listen/skip/complete
- 60s 一次 aggregation 计算行为特征
- 5 条规则式推断 `PerceptionBias`（比如"高 skip ratio → 负 pad_bias"）
- Orchestrator 用它给 EmotionAgent 输出加权

**这一层让"情绪累积"不只是 verbal**。你三分钟内切了 3 首歌，Lyra 会知道你烦——即使你没说。见 `src/perception/`。

### 相关代码

- Soul store（quick）：`src/turn/soulStore.ts`
- ReflectAgent（slow）：`src/reflect/ReflectAgent.ts` + `apply.ts`
- Facts 库结构：`src/memory/types.ts:15-40`
- Salient Moments：`src/moments/salient.ts:30-90`
- Perception：`src/perception/aggregator.ts` + `PerceptionAgent.ts`

---

## 问题 5：歌曲的持续播放意味什么

### 不是"播放列表",是"她在陪你说话"

传统音乐 app 里"持续播放"是列表进度。Lyra 里**歌 = 一句话**，所以**持续播放 = 持续对话**——她在无声地不断给你说话。

### 技术上的实现（`src/turn/Orchestrator.ts` autoAdvance）

一首播完，Rust 的音频监听线程（`src-tauri/src/audio.rs` 中的 watcher）emit `audio-complete` 事件。App.tsx 订阅到，调 `orchestrator.onSongComplete()`：

1. **反应折叠**：把 `complete` 事件折进当前 turn 的 reaction（`behavioral.completed = true`, `silence_positive = true`）
2. **turn 完结**：`finalisePreviousTurn(undefined, endedEmotion.pad)`—— emotion_delta = 0（没有新信号），但触发 Salient Moment 检测 + 写 `shared_memory` + 写 `memory.md`
3. **UI 转 thinking**：小注变 `…`
4. **auto advance**：用上一 turn 的 `current_emotion` 作为下一 turn 的 baseline（或若有 `predicted_trajectory` 且 `elapsed_min ∈ [3, horizon]` 则用预测的 PAD），空 `user_utterance` + `modality: "proactive-open"`
5. **runTurnWithEmotion**：CompanionAgent 再选一首 → 播放 → emit `playing`

### 语义上意味着什么

**持续播放 = 她记录了一次"沉默的正向"**

前一 turn 的 `silence_positive: true` 现在是**基石**。这是 Salient Moment 触发的最主要通道。以前（Sprint 3 之前，无 audio-complete 事件），这个信号根本收不到——记忆系统的核心信号是缺失的。Sprint 3 T3 之后每次听完都有据可查。

**持续播放 = 她替你决定"接下来"**

你没有说下一句话，她根据你的（累积的）情绪 + 灵魂状态 + 记忆 + backbone 决定："这个时候你可能需要接下来这首"。这是"陪伴"的物理落地——**朋友不问你每一句话，你们默契地一起沉浸**。

### 无限循环是**特性**

autoAdvance 没有"最多播 3 首"的 guard。如果你不说话，她会一直放下去。因为：
- **对话的隐喻要贯彻到底**：朋友不会突然沉默然后等你重新开话头
- **反馈闭环靠 skip / verbal**：她过度或跑偏，你输入就打断
- **API 预算是你的自由**：这是自用应用，budget 由用户自己管

### 情绪"发展"发生在这一层

一首歌 3-5 分钟。跑 4-6 首歌就是半小时。半小时里 soul.dynamic_mood 被 apply 4-6 次 delta，Salient Moments 可能积攒 1-2 条，memory.md 里 Living Portrait 下次 Reflect 时会有真的东西可写。

**"持续播放"是记忆系统的养料**——不放歌，`shared_memory` 表就是空的，`memory.md` 就没得反思。

### 停止播放的时刻

- 你说话 → 打断进入 `text` turn，新一轮 EmotionAgent 分析
- 你 skip → 反应"skip"折进当前 turn（可能触发负向 Salient Moment），autoAdvance 到下一首
- 你关 app → Rust watcher 检测到 sink 被 stop（`current_id` 递增），watcher 静默退出，不 emit

Sprint 3 T3 用 `current_id: AtomicU64` + watcher thread 精确区分**自然完成 vs. 手动停止 vs. 被下一首取代**。三种情境语义完全不同，代码里也区分对待。见 `src-tauri/src/audio.rs:60-140`。

### 相关代码

- Rust watcher：`src-tauri/src/audio.rs:60-140`
- TS event listener：`src/audio/player.ts:20-40`
- App.tsx 事件订阅：`src/App.tsx:70-95`
- Orchestrator autoAdvance：`src/turn/Orchestrator.ts:250-320`
- Salient Moment 触发：`src/moments/salient.ts:35-90`

---

## 问题 6：界面的设计（禅、空、虚、净）

答案落在 **Sprint 6 禅空虚净 polish** 里（`docs/superpowers/plans/2026-07-07-sprint-6-zen-polish.md`）。总结：

- **禅**：氛围色 transition 4s → 8s，fade 600ms → 900ms。所有变化都慢到你看不见变化的瞬间。
- **空**：视口 padding 40 → 56px；封面到光带 24 → 36px；光带到曲信息 20 → 28px；痕迹到输入 32 → 44px。整体呼吸感明显。
- **虚**：曲信息颜色 rgba 65% → 58%；小注 55% → 50%；输入框背景 60% 白 → 40%；痕迹默认 opacity 65% → 55%。
- **净**：**Idle 空态**——第一次开 app 且没有任何 turn 时，只显示 italic 灰字 "Lyra 在听" + 输入框，其他一律不渲染（不是隐藏，是不 render，DOM 里都没有）。开始对话后才展开完整布局。
- 封面 placeholder 用 CSS `@keyframes lyra-cover-breath`（8s 周期 opacity 0.92↔1.0），微妙到"你要看 30 秒才发现在动"。

设计的判断依据不是"美不美"是"**你打开会不会呼吸变慢**"。

---

## 问题 7：增加感知 agent

答案落在 **Sprint 4 Perception Agent** 里（`docs/superpowers/plans/2026-07-07-v0.2-sprint-4-perception-agent.md`）。它落地了：

- **`src/perception/events.ts`** — 类型化 EventBus（window focus/blur, mouse, key, input_submit, listen_progress, skip, complete, proactive_dismissed）
- **`src/perception/aggregator.ts`** — 60s 滚动窗口计算行为特征（活跃时间比、提交速率、跳过率、静默完成率）
- **`src/perception/PerceptionAgent.ts`** — v1 是**规则式**（5 条规则组合，deterministic），v2 会换 LLM
- **`src/perception/install.ts`** — 装配 window listeners（throttled 500ms）
- **`src/turn/Orchestrator.ts`** 集成 —— PerceptionBias 加权修正 EmotionAgent 输出

**为什么规则式先做**：LLM 每 60s 跑一次成本太高，规则先跑几周稳定 threshold，Reflect Agent 会通过 dream 建议调整 threshold（v0.3 走通"她自己调整自己参数"的循环）。

**用户隐私 opt-out**：Settings 里有 "Perception (privacy)" 开关，默认 ON，可关闭。关闭后不 install 任何 window listener。

---

## 未答但你可能想问的

### 为什么没做协同过滤 / 大规模训练

因为 Lyra 是**单用户**产品。协同过滤需要海量用户数据，而她只服务你一个。她的"品味"来自 Claude Opus 的世界模型 + 你自己的历史，不来自"其他人也听这个"。

### 为什么不给用户显式打分按钮

因为"沉默是第一等信号"（spec §2.4）。让用户按 👍/👎 是把陪伴变成打卡系统。她通过你完整听完/跳过/说话/沉默来判断，比按钮更真实。

### 那如果 LLM 选歌明显错了

有 4 层防护：
1. **retry**：song_id 不在候选 → retry 一次
2. **fallback**：仍不在 → 用第一首 + 保留 rationale
3. **sulk**：你连续 dismiss 3 次主动开口 → 她 3 天沉默
4. **手动纠偏**：直接改 `memory.md` Living Portrait / Facts 段，她下次启动读取

### 项目**没做**但值得做的

- 网络多源曲库（网易/QQ/YouTube 解析）—— v0.2 剩余
- 豆包 Seed-Music 音乐生成兜底 —— v0.2 剩余
- 工程师 agent 的真正代码写入通道（现在只提议，不执行）—— v0.3.1
- 智能戒指集成（HRV → care 触发）—— v0.3+
- 情感 agent 从规则式升级到 LLM 式 —— v0.3
- Sulk 状态持久化（现在重启丢失）—— follow-up ticket
- Tray 真呼吸动画（现在只 AtomicBool）—— follow-up ticket
- Yellow zone diff preview + "Discuss with agent" 聊天面板 —— v0.3.1
- 网易云爬虫（灰色）—— 需要用户拍板是否走
- 多用户 / 云同步 —— **永远不做**（spec §6.5 反范围）

---

## 附：完整代码地图

按需求关键词索引到具体文件（v0.1 + v0.2-α + v0.3-α 完成时）：

| 需求关键词 | 落地位置 |
|---|---|
| 情绪判断 | `src/agents/EmotionAgent.ts` + `src/agents/prompts/emotion.ts` |
| 选歌 | `src/agents/CompanionAgent.ts` + `src/agents/prompts/companion.ts` |
| 曲库检索 | `src/agents/LibraryAgent.ts` |
| 曲库导入 | `src/library/libraryScan.ts` + `src-tauri/src/library_scan.rs` |
| 灵魂状态 | `src/turn/soulStore.ts` + `src/db/repo/soulRepo.ts` |
| 记忆(`memory.md`) | `src/memory/parser.ts` + `writer.ts` + `context.ts` + `appendSalient.ts` |
| 反思(Reflect) | `src/reflect/ReflectAgent.ts` + `apply.ts` + `trigger.ts` |
| 显著时刻 | `src/moments/salient.ts` |
| 情绪累积 | `src/turn/reactionCapture.ts` + `soulStore.ts` |
| 对话循环 | `src/turn/Orchestrator.ts` |
| 自动下一首 | `src/turn/Orchestrator.ts:250-320` + `src-tauri/src/audio.rs` watcher |
| 感知(问题 7) | `src/perception/*` |
| 主动开口 | `src/proactive/*` |
| Auto dream 定时 | `src/schedule/dreamScheduler.ts` |
| 工程师 agent | `src/engineer/*` + `src/ui/RoadmapBoard.tsx` |
| UI 全屏对话 | `src/home/*` |
| UI 禅风格(问题 6) | `src/home.css` + Sprint 6 polish 记录 |
| 键盘快捷键 | `src/home/keyboard.ts`（空格 / Cmd+, / Cmd+Shift+R / Cmd+Shift+E） |
| 托盘 + 通知 | `src-tauri/src/tray.rs` + `src/tray/*` |
| 音频播放 | `src/audio/player.ts` + `src-tauri/src/audio.rs` |
| 密钥/BYOK | `src/settings/secrets.ts` + `src-tauri/src/secrets.rs` (keyring) |
| 数据库 | `src/db/client.ts` + `src/db/repo/*` + `migrations/001_initial.sql` |
| Provider 抽象 | `src/providers/*` + `src/agents/route.ts` |

**代码基线**：508 vitest（全绿）+ 14 cargo（全绿）+ typecheck 0 + build 237KB 。11 天从 spec 起手，到 v0.3-α 的工程师 agent。

**Lyra 不完美，但她是活的**。
