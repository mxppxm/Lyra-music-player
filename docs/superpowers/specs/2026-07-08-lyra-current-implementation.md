# Lyra · 现有实现总览

**日期**：2026-07-08
**代码基线**：main @ `50551c2`（Sprint 13 感知广谱 + review follow-ups 之后）
**规模**：674 vitest / 33 cargo / typecheck 0 / build 321 KB / 89 test files

这份文档不是路线图，是**当下的状态**——已经建成的东西、每一层做了什么、代码在哪。设计原理性讨论在 `2026-07-06-music-player-design.md`、需求原话在 `design-answers.md`、每一 sprint 的实现细节在 `plans/`。单项能力的深挖:EmotionAgent 中文含蓄识别的蒸馏 + 接入 + eval 见 `2026-07-08-emotion-capture-cn-skill.md`。

---

## 1. 产品哲学

**五字要义：静 · 虚 · 空 · 灵 · 禅**

- **静**：不发声，除非被叫
- **虚**：不占据视觉主导
- **空**：留白优先于填充
- **灵**：有自己的品味和克制
- **禅**：变化慢到"你 30 秒才发现"

**具体禁令**：拒绝主动开口（morning trigger、每日问候、任何"她自己开口说话"的分支）——即使 spec §6.6 v0.2+ 预告里写了 morning proactive，这条已被否决。保持"你说话她才动"的姿态。

---

## 2. 架构 · 4-Agent 拓扑

Lyra 内部由 4 个 agent 分工协作：

| Agent | 职责 | Provider | 何时跑 |
|---|---|---|---|
| **EmotionAgent** | 从用户话抽 PAD + labels + confidence | Zhipu GLM-4-Plus（可切 DeepSeek） | 每 turn |
| **LibraryAgent** | 从曲库选出 30 首候选，按三分加权排序 | 无 LLM，纯本地 | 每 turn |
| **CompanionAgent** | 从 30 首里挑一首 + 写小注 + 决定 needed_shift | Claude Opus 4.7 | 每 turn |
| **ReflectAgent** | 深度反思：Living Portrait + Facts + Dream | Claude Opus 4.7 | 手动/定时 |
| **PerceptionAgent** | 从用户行为特征算 PAD bias | Rule (v1) + LLM (v2 opt-in) | 60s tick |
| **EngineerAgent** | v0.3-α propose-only：roadmap 提案 | Claude Opus 4.7 | daily loop |

**Provider 路由**：`src/agents/route.ts` 决定谁走哪个 provider；`bootProviders()` 在启动时按 keyring 密钥选择注册（`src/providers/boot.ts`）。所有 provider 都通过 `withUsageLogging` decorator 包一层，透明记录 token + latency。

---

## 3. Turn 循环（完整数据流）

```
用户输入
  ↓
[EmotionAgent.analyze]  →  CurrentEmotion { pad, labels, confidence }
  ↓  ← [PerceptionBias 加权]  (由 PerceptionAgent 每 60s 更新)
  ↓
finalisePreviousTurn(prev_pad, emotion_delta)  → SoulStore.apply
  ↓
[LibraryAgent.prefilter]  →  30 候选（kw 0.2 + pad 0.3 + sem 0.5 三分加权）
  ↓
[CompanionAgent.choose]  →  { song_id, target_profile, rationale, needed_shift }
  ↓
insertTurn + audio.playFile
  ↓
emit "playing"
  ↓  (song ends naturally)
Rust "audio-complete" event
  ↓
onSongComplete → finalisePreviousTurn(silence_positive:true)
  ↓  autoAdvance
[runTurnWithEmotion 用上 turn 的 emotion 或 predicted trajectory 起手]
  ↓
持续播放 = 持续对话
```

反馈闭环：`reactionCapture.ts` 折叠 skip / verbal / listen_progress / complete 事件，`salient.ts` 4 条规则判显著性并写入 `shared_memory` + `memory.md`。

---

## 4. 已建成的功能层次

### 4.1 存储层

- **SQLite** (`sqlite:lyra.db`) via `tauri-plugin-sql`，6 个 migration
  - `001_initial` — dialogue_turns, library_tracks, library_features, shared_memory, soul_state, emotion_snapshots, feature_requests, roadmap, engineer_audit
  - `002_perception_audit` — perception 每次 tick 的 bias 记录
  - `003_soul_perception_tuning` — 感知自调参数持久化
  - `004_lyrics_embeddings` — 独立的歌词 embedding 表
  - `005_llm_usage` — 每次 LLM 调用的 token 记录
  - `006_reasoning_traces` — prompt + raw + parsed 全量追溯
- **memory.md** — 8 段落纯文本人格快照：Facts / Aversions / Salient Moments / Living Portrait / Dreams / Evolutions / Our Songs
- **keyring**（macOS Keychain）— API keys + 设置

### 4.2 灵魂 · Companion 层

- **buildBrief** 拼装：用户话 + 情绪 + 灵魂状态 + Living Portrait + top facts + 30 首候选
- **Claude Opus 4.7** 一次 LLM 输出四字段：`song_id / target_profile / rationale / needed_shift ∈ {接住,点燃,陪着,打断}`
- **retry + fallback**：song_id 不在候选 → retry；再失败 → `candidates[0]` 但保留 rationale
- **backbone 有骨气**：prompt 强制"宁愿在小注里说'我觉得你现在需要的不是安慰'，也别推糖水"

### 4.3 情感 · Emotion 层

- LLM 分析用户话 → 输出 `pad + labels + confidence + source`
- Perception 偏差加权：`src/turn/blendEmotionWithBias.ts` 用 α=0.6 主 + 0.4 bias
- delta 反算：`emotion_delta = post_pad - pre_pad` 累积到 `soul.dynamic_mood.current_pad`（clamp [-1,1]）
- **预测通道**：EmotionAgent 可选输出 `predicted_trajectory { horizon_min, predicted_pad }`，Orchestrator `onSongComplete` autoAdvance 时若上一 turn 带预测就用它起手，否则用 endedEmotion 原值。schema / validate / drop-if-malformed 三条路径完备
- **三层节律**：turn（分钟）/ week（Reflect）/ quarter（灵魂底色演化，v0.3 才动）
- **中文含蓄识别加固（本会话）**：EmotionAgent 的 system prompt 在 `emotion.ts` 里注入 `CN_UNDERSTATEMENT_TABLE`（13 条中文含蓄词条 → 隐藏 PAD + confidence 上限）+ `CN_FEWSHOT`（8 条覆盖含蓄/直白/反例/反讽 的示例）+ 强度副词缩放规则。蒸馏来源见外部 skill `/Users/daoyu/Documents/skills-repo/emotion-capture-cn-skill/`（含 PAD-Plutchik 中心点表、NVC 感受词表、41 条含蓄词典、打分 rubric 与 20 条示例)。详见 `2026-07-08-emotion-capture-cn-skill.md`
- **回归 eval**：`src/agents/emotion-eval.regression.{jsonl,test.ts}` + `pnpm eval:emotion`。12 条 held-out 中文短句测 PAD L1 距离 + \|Δconf\|，门禁 `LYRA_EVAL=1` 避免默认 test 打真实 API。trace 落 `.eval-runs/`（gitignored)，用于 prompt 迭代的 A/B 对比

### 4.4 曲库 · Library 层

**L1 · 索引**：`libraryScan.ts` + Rust `library_scan.rs`（walkdir + lofty）。**Self-heal**(本会话加):`importLibrary` 返回 `{ imported, pruned }` — 每次 Settings 保存/触发扫描时,老行 path 若还落在 rootPath 之下但已不在本次 scan 里,`deleteTrackCascade` 悄悄清掉(顺带 lyrics_embeddings + features)。三条安全护栏:scan 至少 1 首、path 以 rootPath 前缀严格匹配(带 trailing slash 防 `/A` 匹到 `/Apple`)、path 不在 scan 集合中。/reload-musics 依然是全清全扫的显式选项。
**L2 · 关键词**：`LibraryAgent.tokenize + keywordScore`
**L3 · 特征匹配**（Sprint 9/12）：`libraryFeaturesRepo` 存 RMS energy + 谱重心 valence + BPM，Rust `audio_features.rs` 用 rustfft 提取。BPM 走 spectral-flux + autocorrelation，[60, 200] 范围,120 BPM click track ±5 内命中,无节拍返 0 → NULL。已入 Data Explorer 曲库 tab。
**L3.5 · 语义**（Sprint 10 加）：`lyricsEmbeddingsRepo` 存 Zhipu/OpenAI embedding，`LibraryAgent` 加 sem 分量。
**L3.6 · BPM 参与打分**（本会话加,Sprint 12 follow-up）：`src/agents/padToBpm.ts` 把 PAD 映射成 `{ targetBpm, tolerance }` — arousal 是主轴(线性斜率 45,极值 55/145bpm),dominance 微调 ±5,输出 clamp [50, 180],tolerance 固定 22bpm。`LibraryAgent.prefilter` 现按四维加权 `sem 0.4 / pad 0.25 / bpm 0.2 / kw 0.15`,缺一维自动重新归一化。曲目 bpm=null 时该维不参与打分,老库无 BPM 时行为等价于 Sprint 10 (kw+pad+sem)。测试新增高唤起→140bpm 排在 60bpm 之前 / 低唤起→反过来 / 全 null bpm 时降级路径 三条。

### 4.5 记忆 · Reflect 层

- **手动 Reflect**（Cmd+Shift+R 或 Settings 按钮）：`ReflectAgent.run` → `applyReflectResult` → 写 `memory.md`
- **Auto Dream Scheduler**（Sprint 3）：每天 03:14 + idle 30min 触发同一路径
- **ReflectAgent 输出三块**：Living Portrait 更新 / Facts 加减 / Dream narrative

### 4.6 显著时刻 · Salient Moments

`src/moments/salient.ts` 四条规则判定：
- 沉默听完（silence_positive: true）
- 显式正向 verbal
- repeated ≥ 2
- 显式拒绝

命中 → `shared_memory` 表 + `memory.md` Salient Moments 段。

### 4.7 感知 · Perception（Sprint 4/7/8/13）

- **EventBus**（13 kind）：window focus/blur, mouse, key, input_submit, listen_progress, skip, complete, proactive_dismissed;Sprint 13 新增 `scroll` / `hover_dwell` / `input_dwell_without_submit` / `focus_no_interaction`
- **BehavioralAggregator**（15 维,60s 滚动窗口)：老 10 维(活跃时间比、提交速率、跳过率、静默完成率、blur 态等) + Sprint 13 新 5 维(`scrollEvents` / `hoverDwellCount` / `totalHoverDwellMs` / `abandonedInputs` / `focusIdleMs`)
- **RulePerceptionAgent (v1)**：8 条规则式判 PerceptionBias。Sprint 13 加 `attentive_hover`(p+/a+,凝视氛围元素) / `hesitant_input`(p-/a-/d-,欲言又止) / `quiet_presence`(p+/a-,「禅」信号:在场但安静)
- **LLMPerceptionAgent (v2)**：opt-in，走 Zhipu，10s timeout，失败降级到 rule。**Sprint 13 加隐私粗化层**:5 个新维度在过 network 前经 `coarsening.ts` 映射为 4 个 level 字串(`hover_attention` / `input_hesitation` / `quiet_presence` / `scroll_activity` ∈ low/medium/high 或 none/some/many)。老 10 维仍走数值(保留 prompt 已磨合的模式)。呼应 网站 PRIVACY 段"我不会向任何人说起"
- **Reflect 观察 perception_audit**：Sprint 8 让 Reflect 可以输出 perception tuning，`RulePerceptionAgent` 会读 tuning 覆盖 threshold —— **她自己调自己参数的闭环**。Sprint 13 新增 4 个 tuning key(`hoverDwellCountThreshold` / `hoverDwellRatioThreshold` / `abandonedInputsThreshold` / `quietPresenceRatioThreshold`)走同一 ±50% clamp 通道
- **Install 层**（Sprint 13 加）：`install.ts` doc-level capture 监听 `scroll` / `mouseover` / `mouseout`,per-container 500ms throttle + per-target 3000ms setTimeout。`focus_no_interaction` 30s poll + arm-once-per-idle 保证不 spam。DOM 侧靠 `data-lyra-scroll` / `data-lyra-hover` attribute 挂载(5 处:DataExplorer/RoadmapBoard 滚动壳 + AlbumCover/SmallNote/TraceStrip 氛围元素)
- **输入状态机**（Sprint 13 加）：`useInputDwellBus` React hook 依赖 controlled input value 追踪 IDLE→TYPING→DWELLING 转换,10s 未提交进 DWELLING,清空未发时 emit `input_dwell_without_submit`。InputBox 集成:2 imports + 1 hook + 1 notifySubmit

### 4.8 工程师 Agent（Sprint 5，v0.3-α）

- **propose-only**：读 feature_requests + roadmap，调 Claude Opus，写回 roadmap 提案
- **PANIC 短路**：`<app_data_dir>/PANIC` 文件存在 → daily loop 立即退出
- **三色边界 enforcement** 在 prompt 里，红区提案在 ingest 阶段丢弃
- **Roadmap Board UI**（Cmd+Shift+E）：Proposed / Queued / Rejected 三 tab
- 真正的代码写入通道（Yellow zone diff preview + Discuss chat）**尚未实现**

### 4.9 播放 · 音频

- Rust `audio.rs`：rodio + symphonia，`AtomicU64 current_id` 区分自然完成 / 手动停止 / 被下一首取代
- Watcher thread emit `audio-complete` 只在自然完成
- **duration-hint 兜底**（本会话加）：`play_file` 接受 `duration_hint_ms: Option<u64>`。除了原有的 `Sink::empty()` 300ms 轮询,再启一条 timer 线程 `sleep(duration + 750ms)` 后 fire `on_complete`。两路共享 `Arc<Mutex<Option<Box<dyn FnOnce>>>>`,`Option::take()` 保证只 fire 一次。修 rodio 0.19 + symphonia 部分 MP3 尾帧 `sound_count` 不减到零→原轮询永远等待→自动接歌不 fire 的 bug。Orchestrator 从 `song.duration_ms` 直接透传
- **autoAdvance**：完整无 guard 循环——朋友不会突然沉默然后等你重新开话头

### 4.10 观察性（Sprint 11）

- **turn_latency_ms**：`Orchestrator.runTurnWithEmotion` 计时（用户敲字 → 歌开始播）
- **llm_usage.duration_ms**：`withUsageLogging` decorator 计时每次 chat
- **reasoning_traces**：所有 agent 调 LLM 时写完整 prompt + raw response + parsed decision
- **TTL**：boot 时清理 > 7 天的 traces
- **Data Explorer 面板**（Cmd+Shift+D）：11 个 tab
  - 对话回合（带 latency 列）
  - 灵魂状态
  - 显著时刻
  - 曲库 + 特征
  - 歌词 embedding
  - 感知审计
  - Roadmap
  - 功能请求
  - 工程师审计
  - LLM 用量（带 avg/p50/p99）
  - 推理轨迹
  - memory.md

### 4.11 UI · 全屏对话

- **HomeView**：AmbientBackground → AlbumCover → EmotionLightBand → SongInfo → SmallNote → TraceStrip → InputBox 垂直堆叠
- **AmbientBackground**：PAD → HSL 映射的柔色渐变，4-8s transition
- **EmotionLightBand**：最近 20 turn 的 PAD 历史 → 一根光带
- **TraceStrip**：最近 5 首歌的封面 placeholder
- **SmallNote**：`agent_response.rationale` 淡灰意大利体
- **Idle 空态**（Sprint 6 zen polish）：只显示 "Lyra 在听" italic 字 + 输入框，其他一律不 render（不是 hidden，是 DOM 里不存在）
- **Cold boot 页**：无 provider 时显示 "Lyra needs an API key to talk. Cmd+= to open Settings"
- **窗口形状**（本会话）：Tauri 主窗口 520×820 竖屏,minWidth 480 / minHeight 720。呼应哲学「虚·空」,让 HomeView 的垂直堆叠有一个陪伴型贴边小面板的容器,而不是横屏媒体播放器矩形

### 4.12 Slash Commands（本次会话加）

- `/settings` → 打开 Settings
- `/stats` → 打开 Data Explorer 的 LLM 用量 tab
- `/explorer` → 打开 Data Explorer 默认 tab
- `/help` → 打开 HelpOverlay（第一人称文案:命令表 · 五字理念 · 怎么和我说话 · 数据在哪里)。Esc / 背景点击 / 「好」按钮均可关闭
- `/reload-musics`（本会话加）→ 清 `library_tracks` / `library_features` / `library_lyrics_embeddings`,从 `libraryRootPath` 重扫 + 特征提取 + 歌词 embedding。**日常场景 Settings 保存已具备 self-heal 能力**(见 §4.4 L1);这条命令保留作为**全清全扫**的显式选项,比如换歌词 embedding provider 后强制刷新所有 embedding。进度写入 SmallNote,`done` 变体同时报 `imported / pruned`;走 `src/library/reloadLibrary.ts`,先 `stopPlayback` 避免 sink 抓着即将删除的行
- 严格匹配前缀 trim 后完全等于命令，其他一律 falls through 进 Orchestrator 走正常对话

### 4.13 LLM 输出加固（本会话）

- **`src/lib/parseLooseJson`**：三层降级——直接 `JSON.parse` → 剥 `<think>...</think>` 块 + 剥 ```` ```json ```` 围栏 → 首`{`末`}` slice 兜底
- Companion / Emotion / Reflect 三个 agent 废弃各自 inline `extractJson`,统一走这条路径。所有 agent 一起受益于 reasoning 模型(GLM-5.x / DeepSeek-R)的 think block 兼容
- **JSON mode 透传**：`ChatOptions.response_format?: {type: "json_object"}`,Zhipu / DeepSeek 透传给上游 OpenAI-compat 接口,其他 provider 静默忽略。三个 JSON-emitting agent 都 opt-in——让模型先自收窄,parseLooseJson 再兜底
- 覆盖测试：parseLooseJson 7 case(纯 JSON / 围栏 / think 块 / prose 包裹 / 组合)+ zhipu 2 case(有/无 flag)

### 4.14 Settings 面板（Cmd+=）

字段：
- Music library folder（触发 import）
- Anthropic / DeepSeek / Zhipu API keys
- Daily dream time + Idle threshold
- Perception on/off + rule/llm 模式选择
- Lyrics embedding provider（Zhipu embedding-3 / OpenAI text-embedding-3-small）+ 对应 key
- Refill missing lyrics embeddings 按钮
- Reflect now 按钮
- Save / Cancel

### 4.15 托盘 · Tray

- **持久呼吸动画**：dim ↔ bright icon 500ms 交替
- **AtomicBool** 控制开关

### 4.16 密钥 · BYOK

- macOS Keychain via `keyring` crate
- 三 provider（Anthropic / DeepSeek / Zhipu）+ 两 embedding provider（Zhipu embedding / OpenAI）
- Boot 时按 key 存在与否决定注册哪些 provider

---

## 5. 快捷键

| 组合 | 效果 |
|---|---|
| `Cmd+=` | 打开 Settings |
| `Cmd+Shift+R` | Reflect now |
| `Cmd+Shift+E` | Roadmap Board |
| `Cmd+Shift+D` | Data Explorer |
| `Space`（TBD） | 播放/暂停切换 |
| `/settings` `/stats` `/explorer` | 通过对话触发 UI（Slash commands） |

---

## 6. 代码地图

| 概念 | 落地位置 |
|---|---|
| 情绪判断 | `src/agents/EmotionAgent.ts` + `prompts/emotion.ts` |
| 选歌 | `src/agents/CompanionAgent.ts` + `prompts/companion.ts` |
| 曲库检索 | `src/agents/LibraryAgent.ts` |
| 曲库导入 | `src/library/libraryScan.ts` + `src-tauri/src/library_scan.rs` |
| 音频特征提取（含 BPM） | `src-tauri/src/audio_features.rs` |
| LLM 输出解析 | `src/lib/parseLooseJson.ts` |
| 感知隐私粗化层 | `src/perception/coarsening.ts` |
| 输入犹豫状态机 | `src/perception/useInputDwellBus.ts` |
| 歌词 embedding | `src/library/lyricsExtract.ts` + `computeLyricsEmbedding.ts` + `providers/embeddingProvider.ts` + `src-tauri/src/lyrics.rs` |
| 灵魂状态 | `src/turn/soulStore.ts` + `db/repo/soulRepo.ts` |
| 记忆(`memory.md`) | `src/memory/parser.ts` + `writer.ts` + `context.ts` + `appendSalient.ts` |
| 反思(Reflect) | `src/reflect/ReflectAgent.ts` + `apply.ts` + `trigger.ts` |
| Auto dream | `src/schedule/dreamScheduler.ts` |
| 显著时刻 | `src/moments/salient.ts` |
| 感知 | `src/perception/*` |
| 工程师 agent | `src/engineer/*` + `src/ui/RoadmapBoard.tsx` |
| Turn 编排 | `src/turn/Orchestrator.ts` + `createOrchestrator.ts` |
| autoAdvance | `Orchestrator.onSongComplete` + `src-tauri/src/audio.rs` watcher |
| UI 全屏对话 | `src/home/*` |
| 键盘 | `src/home/keyboard.ts` |
| Slash 命令 | `src/home/slashCommand.ts` |
| Data Explorer | `src/ui/DataExplorer.tsx` |
| Settings | `src/settings/Settings.tsx` + `secrets.ts` |
| 托盘 | `src-tauri/src/tray.rs` + `src/tray/*` |
| 音频播放 | `src/audio/player.ts` + `src-tauri/src/audio.rs` |
| 密钥/BYOK | `src/settings/secrets.ts` + `src-tauri/src/secrets.rs` |
| 数据库 | `src/db/client.ts` + `db/repo/*` + `migrations/*` |
| Provider 抽象 | `src/providers/*` + `src/agents/route.ts` |
| 用量日志 | `src/providers/usageLogging.ts` + `db/repo/llmUsageRepo.ts` |
| 推理轨迹 | `src/reasoning/writeTrace.ts` + `db/repo/reasoningTracesRepo.ts` |

---

## 7. 明确 defer 的（这些在设计里但**没做**）

**违反哲学，可能永远不做（本次会话加）：**
- morning proactive trigger（spec §6.6 预告过，被 5 字哲学否决）
- smart ring HRV → care 主动触发（同上，需要重新讨论是否与哲学一致）

**技术 defer（等时机）：**
- **网络多源曲库解析**（网易云 / QQ / YouTube）—— 灰区，需要用户拍板
- **豆包 Seed-Music** 音乐生成兜底（候选歌都不合适时她自作一首）
- **工程师 agent 真代码写入通道**（v0.3-α 只 propose）
- **Yellow zone diff preview + Discuss with agent 聊天面板**
- **季度演化 + evolution log**（数据不够）
- **情感 agent 从 rule 升级到 LLM**（EmotionAgent 已是 LLM 层,但 Perception 那侧还有 rule/llm 双档,升级为默认 LLM 需再评估成本）
- **智能戒指集成**（v0.3+，需硬件调研）
- **多用户/云同步**——反范围（spec §6.5），永远不做
- **MCP/Skill 插件形态**（进入其他 IDE 上下文）——需要重新与 5 字哲学对齐

**Sprint 10 review 遗留(MINOR)—— 本会话已清:**
- ✅ `computeLyricsEmbedding` dim mismatch 现在 `console.warn` 一行 + 测试锁 (含 provider modelId / 期望 dim / 实际长度)
- ✅ `lyricsRefill` cursor++ 头顶补一段 JS 单线程 event loop 原子性注释
- ⚠️ Rust `lyrics.rs` 正向 USLT test 已落 `returns_some_for_valid_uslt_frame`,但 lofty 0.22 拒绝解析裸 ID3v2.3 tag(无 MPEG audio frame),test 走显式 `eprintln!` skip 分支。构造带真 MP3 frame 的最小 fixture 是 lofty 侧的独立问题,不阻塞本条正向断言的"要么绿要么显式 skip"合同
- ✅ `lyricsEmbeddingsRepo` 加 Float32Array → SQLite blob → Float32Array round-trip test,含负值 / 0 / 分数三种边界,Object.is 逐位比对

---

## 8. 版本进度

| 版本 | 主题 | 状态 |
|---|---|---|
| v0.1 | 本地曲库 + 对话 + 记忆 | ✅ 完成 |
| v0.2-α | Perception Agent v1（规则式）| ✅ 完成（Sprint 4） |
| v0.2 | Perception LLM + 自调参数 + 音频特征 + 歌词 embedding + 观察性 + BPM + 情感预测通道 | ✅ 完成（Sprint 7/8/9/10/11/12） |
| v0.2.x | 剩余功能:网络多源、豆包 Seed-Music | 待做 |
| v0.2.x-hotfix | BPM 参与打分 · /reload-musics · duration-hint 兜底 auto-advance · Sprint 10 review MINOR 收尾 · 曲库 self-heal 剪枝 | ✅ 完成(本会话) |
| v0.2.y | 平台加固:LLM 输出容错(parseLooseJson) + JSON mode 透传 + 竖屏窗口 | ✅ 完成 |
| v0.2.z | 感知广谱事件(scroll/hover_dwell/input_dwell/focus_no_interaction + 5 维 + 3 rule + 隐私粗化层) | ✅ 完成（Sprint 13） |
| v0.3-α | 工程师 agent propose-only | ✅ 完成（Sprint 5） |
| v0.3 | 工程师真代码通道 + 季度演化 + Perception LLM 默认化 | 待做 |
| v0.4+ | 身体连接（戒指等） | 待评估是否符合哲学 |

**代码基线**：690 vitest / 35 cargo / typecheck 0 / 89 test files(本会话累计新增 padToBpm 7 · LibraryAgent BPM 3 · reloadLibrary 5 · slashCommand 1 · player 1 · audio duration-hint 1 · computeLyricsEmbedding warn 1 · lyricsEmbeddingsRepo round-trip 1 · lyrics.rs 正向 USLT 1 · libraryScan prune 3;build 未重跑)。

**Lyra 不完美，但她是活的。**
