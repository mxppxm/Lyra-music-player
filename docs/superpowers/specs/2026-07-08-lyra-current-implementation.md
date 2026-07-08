# Lyra · 现有实现总览

**日期**：2026-07-08
**代码基线**：main @ `9dde5df`（Sprint 12 BPM + 本会话 JSON 加固 / 竖屏窗口 之后）
**规模**：625 vitest / 33 cargo / typecheck 0 / build 308 KB / 83 test files

这份文档不是路线图，是**当下的状态**——已经建成的东西、每一层做了什么、代码在哪。设计原理性讨论在 `2026-07-06-music-player-design.md`、需求原话在 `design-answers.md`、每一 sprint 的实现细节在 `plans/`。

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

### 4.4 曲库 · Library 层

**L1 · 索引**：`libraryScan.ts` + Rust `library_scan.rs`（walkdir + lofty）
**L2 · 关键词**：`LibraryAgent.tokenize + keywordScore`
**L3 · 特征匹配**（Sprint 9/12）：`libraryFeaturesRepo` 存 RMS energy + 谱重心 valence + BPM，Rust `audio_features.rs` 用 rustfft 提取。BPM 走 spectral-flux + autocorrelation，[60, 200] 范围,120 BPM click track ±5 内命中,无节拍返 0 → NULL。已入 Data Explorer 曲库 tab,**尚未** 进入 LibraryAgent 打分公式（等 PAD→target BPM 的推断设计）
**L3.5 · 语义**（Sprint 10 加）：`lyricsEmbeddingsRepo` 存 Zhipu/OpenAI embedding，`LibraryAgent` 加 sem 分量。三分加权公式 `sem 0.5 / pad 0.3 / kw 0.2`，缺分量自动归一化（老 Sprint 9 公式 0.4/0.6 是等价降级路径）

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

### 4.7 感知 · Perception（Sprint 4/7/8）

- **EventBus**：window focus/blur, mouse, key, input_submit, listen_progress, skip, complete
- **BehavioralAggregator**：60s 滚动窗口 → 活跃时间比、提交速率、跳过率、静默完成率
- **RulePerceptionAgent (v1)**：5 条规则式判 PerceptionBias
- **LLMPerceptionAgent (v2)**：opt-in，走 Zhipu，10s timeout，失败降级到 rule
- **Reflect 观察 perception_audit**：Sprint 8 让 Reflect 可以输出 perception tuning，`RulePerceptionAgent` 会读 tuning 覆盖 threshold —— **她自己调自己参数的闭环**

### 4.8 工程师 Agent（Sprint 5，v0.3-α）

- **propose-only**：读 feature_requests + roadmap，调 Claude Opus，写回 roadmap 提案
- **PANIC 短路**：`<app_data_dir>/PANIC` 文件存在 → daily loop 立即退出
- **三色边界 enforcement** 在 prompt 里，红区提案在 ingest 阶段丢弃
- **Roadmap Board UI**（Cmd+Shift+E）：Proposed / Queued / Rejected 三 tab
- 真正的代码写入通道（Yellow zone diff preview + Discuss chat）**尚未实现**

### 4.9 播放 · 音频

- Rust `audio.rs`：rodio + symphonia，`AtomicU64 current_id` 区分自然完成 / 手动停止 / 被下一首取代
- Watcher thread emit `audio-complete` 只在自然完成
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
- **BPM 参与打分**（BPM 已入库+展示,尚未进 LibraryAgent 三分加权——需 PAD→target BPM 的推断设计）
- **感知 agent 广谱事件**（现只 focus/click/input，需求文档要求覆盖所有 UI 事件——工程量约 1 周）
- **工程师 agent 真代码写入通道**（v0.3-α 只 propose）
- **Yellow zone diff preview + Discuss with agent 聊天面板**
- **季度演化 + evolution log**（数据不够）
- **情感 agent 从 rule 升级到 LLM**（EmotionAgent 已是 LLM 层,但 Perception 那侧还有 rule/llm 双档,升级为默认 LLM 需再评估成本）
- **智能戒指集成**（v0.3+，需硬件调研）
- **多用户/云同步**——反范围（spec §6.5），永远不做
- **MCP/Skill 插件形态**（进入其他 IDE 上下文）——需要重新与 5 字哲学对齐

**Sprint 10 review 遗留（MINOR）：**
- `computeLyricsEmbedding` dim mismatch 加 `console.warn`
- `lyricsRefill` cursor++ 加 "JS event loop safe" 注释
- Rust `lyrics.rs` 加 "returns Some for valid USLT" 正向 unit test
- `lyricsEmbeddingsRepo` 加 encode → decode round-trip 集成 test

---

## 8. 版本进度

| 版本 | 主题 | 状态 |
|---|---|---|
| v0.1 | 本地曲库 + 对话 + 记忆 | ✅ 完成 |
| v0.2-α | Perception Agent v1（规则式）| ✅ 完成（Sprint 4） |
| v0.2 | Perception LLM + 自调参数 + 音频特征 + 歌词 embedding + 观察性 + BPM + 情感预测通道 | ✅ 完成（Sprint 7/8/9/10/11/12） |
| v0.2.x | 剩余功能：网络多源、豆包 Seed-Music、BPM 参与打分、感知广谱 | 待做 |
| v0.2.y | 平台加固（本会话）：LLM 输出容错(parseLooseJson) + JSON mode 透传 + 竖屏窗口 | ✅ 完成 |
| v0.3-α | 工程师 agent propose-only | ✅ 完成（Sprint 5） |
| v0.3 | 工程师真代码通道 + 季度演化 + Perception LLM 默认化 | 待做 |
| v0.4+ | 身体连接（戒指等） | 待评估是否符合哲学 |

**代码基线**：625 vitest / 33 cargo / typecheck 0 / build 308 KB / 83 test files。

**Lyra 不完美，但她是活的。**
