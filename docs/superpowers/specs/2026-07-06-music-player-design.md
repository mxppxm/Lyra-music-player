# 音乐播放器设计文档

**日期**：2026-07-06
**状态**：Draft — 待用户 review
**作者**：daoyu × Claude (brainstorming pair)
**版本**：v0（对应 v0.1 MVP 目标）

---

## 引言与愿景

需求文件里写了 5 个关键词：轻量、时尚、懂用户、智能推荐、自我迭代进化。经过 6 轮头脑风暴，这个项目的真正定位被重新表述为：

> **一个由情绪引擎驱动、能通过"歌 = 一句话"的对话与用户交流、并伴随用户成长的音乐 agent。**
>
> 播放器只是它的外壳。它的心是四个协同的 agent，它的记忆是一份不断加厚的 `memory.md`，它的成长是两个并行 loop 的耦合演化。

它**不是**一个推荐器，也**不是**又一个音乐流媒体客户端。它是用户的 [`情绪引擎`](../../../情绪引擎.md) 的第一个输出通道，同时也是情绪引擎的高质量传感器。

### 核心价值命题

| 命题 | 拒绝的旧范式 | 采纳的新范式 |
|---|---|---|
| 定位 | 又一个音乐推荐器 | 情绪调节器 / 音乐 agent |
| 交互 | 歌单/浏览/列表 | 对话（歌 = 一句话）|
| 智能 | 协同过滤 + embedding 匹配 | LLM 生成"歌的目标画像"→ 曲库 agent 检索/生成 |
| 记忆 | 播放历史 + 收藏夹 | `memory.md` 双存储 + auto dream |
| 演化 | 无 / 权重在线学习 | 双 loop 并行（灵魂 × 工程师）+ 三色边界 |
| 主动 | 无 / 推送轰炸 | 有分寸的主动版（6 条硬闸）|

### 技术栈总览

- **UI 与 orchestration**：React + TypeScript
- **系统集成**：Tauri（Rust）
- **存储**：SQLite（source of truth） + `memory.md`（叙事视图）
- **LLM providers**：Claude / 智谱 GLM / DeepSeek / 豆包（可插拔）
- **音乐生成**：豆包 Seed-Music（v0.2 引入）
- **自进化载体**：Claude Code CLI 子进程（v0.3 引入）

---

## 第 1 节：系统骨架与 Agent 拓扑

### 1.1 顶层原则：Agent 是心脏，播放器是外壳

传统音乐 app 的心脏是"播放器 + 曲库 + 推荐引擎"。本项目的心脏是**四个 agent**，播放器只是它们的**输出通道**（音频渲染）和**输入通道**（用户反应）。因此"轻量时尚"是结构性的：复杂度都在 agent 里，UI 层可以极简。

### 1.2 四个 Agent 的分工

**🌙 灵魂 Agent（Companion）**
"和你一起成长的音乐朋友"。维护音乐人格状态（`musical_taste_base` / `dynamic_mood` / `shared_memory`），决定选哪首歌、写小注、判断是否主动开口。每一次对话回合都跑它。

**💗 情感 Agent（Emotion）**
专职的情绪感知/预测模型。从用户话语 + 历史抽取当前 PAD 状态，从用户反应反推 `emotion_delta`，是灵魂 agent 的"眼睛"。v0.1 只做感知，v0.2 加入预测通道。

**📚 曲库 Agent（Library）**
灵魂 agent 的"歌的检索接口"。屏蔽三车道的复杂性：
- 车道 1：本地库检索（v0.1）
- 车道 2：网络多源解析（v0.2）
- 车道 3：调多模态生成模型（v0.2）

**🔧 工程师 Agent（Engineer）**
软件自己的 PM+ 工程师。读日志/崩溃/用户吐槽 → 维护活的 roadmap → 生成实现 → 提交给用户 review → 合入沙盒。v0.3 引入。

### 1.3 Agent 间通信

四个 agent **不直接互相调用**，通过同一个 SQLite + `events` 事件表通信。松耦合，可独立迭代。

### 1.4 技术栈决策

```
┌─────────────────────────────────────────────┐
│  React + TS 前端 (全屏对话 UI)              │
│   ├─ 灵魂 agent orchestration                │
│   ├─ 情感 agent orchestration                │
│   ├─ 曲库 agent orchestration                │
│   └─ 主动性引擎 (触发定时器 + 规则)         │
└────────────┬────────────────────────────────┘
             │ Tauri IPC
┌────────────▼────────────────────────────────┐
│  Tauri 后端 (Rust)                          │
│   ├─ 音频渲染 (rodio)                        │
│   ├─ 文件 IO / 曲库文件                      │
│   ├─ SQLite (tauri-plugin-sql + sqlite-vec) │
│   ├─ 系统集成 (tray / 通知 / focus mode)    │
│   └─ 生成 Claude Code 子进程 (工程师 agent) │
└─────────────────────────────────────────────┘
             │
     ┌───────┴───────┐
     ▼               ▼
  LLM APIs      音乐生成 APIs
```

**为什么不引入 Python sidecar**：所有 LLM/生成都是 HTTPS API 调用，不需要 Python 生态。全 TS + Rust 两个运行时，分发极轻（Tauri 打包后几十 MB）。

**为什么工程师 agent 用 Claude Code 子进程**：借力 OMC 生态的 executor/verifier 能力，不重复造轮。

### 1.5 数据存储主表

| 表 | 内容 | 谁写 | 谁读 |
|---|---|---|---|
| `dialogue_turns` | 一次对话回合的完整原子记录 | 灵魂 | 灵魂+情感+工程师 |
| `emotion_snapshots` | 每 turn 的 PAD 状态快照 | 情感 | 情感+灵魂 |
| `soul_state` | 音乐人格：底色/当下/演化史 | 灵魂 | 灵魂 |
| `shared_memory` | 共同记忆事件（歌+意义+时间） | 灵魂 | 灵魂 |
| `library_tracks` | 曲库 metadata + embedding | 曲库 | 灵魂+曲库 |
| `library_features` | 音频特征（BPM/能量/情绪） | 曲库 | 曲库 |
| `roadmap` | 工程师 agent 维护的活项目板 | 工程师 | 工程师+用户 |
| `feature_requests` | 灵魂/情感/曲库 → 工程师 的能力请求 | 各 agent | 工程师 |
| `events` | 事件总线（agent 间异步通信） | 全部 | 全部 |
| `engineer_audit` | 工程师执行的完整审计流水 | 工程师 | 用户 |

### 1.6 关键决策 & 替代方案

| 决策 | 选择 | 备选 | 理由 |
|---|---|---|---|
| Agent 拓扑 | 四 agent 松耦合 | 单一 monolith agent | 避免人格污染；可独立演化 |
| 编排位置 | React 前端 (TS) | Python sidecar / Rust 内嵌 | 无 Python 依赖，分发轻；Rust 生态对 LLM 不友好 |
| 数据主权 | 全本地 SQLite | 云 | 纯自用无需云；情绪数据敏感度极高 |
| 生物信号 | 预留 port，v0 不接 | v0 集成戒指 | 用户显式指定戒指为 post-MVP |
| 工程师 agent 载体 | Claude Code 子进程 | 自研 executor | 复用 OMC 生态 |

---

## 第 2 节：对话协议与灵魂状态模型

### 2.1 DialogueTurn：所有下游功能的原子单元

```typescript
type DialogueTurn = {
  id: string;
  timestamp: number;

  // ── 情感 agent 提供（本 turn 开始时的用户状态） ──
  current_emotion: {
    pad: { p: number; a: number; d: number };
    labels: string[];               // "疲惫" "有一丝焦虑" "克制的开心"
    confidence: number;
    source: "emotion-agent-inferred" | "user-declared" | "ring-signal";
    predicted_trajectory?: {         // v0.2 加入
      horizon_min: number;
      predicted_pad: { p: number; a: number; d: number };
    };
  };

  // ── 你说的话 ──
  user_utterance: {
    modality: "text" | "voice" | "proactive-open";
    content: string;                 // proactive-open 时为空
  };

  // ── 它说的歌 ──
  agent_response: {
    song_id: string;
    rationale: string;
    proactive_kind?: "morning" | "care" | "anniversary" | "share" | "rhythm";
    generation_meta?: {
      generator: "doubao-seed" | "…";
      prompt: string;
      duration_ms: number;
    };
  };

  // ── 你的反应 ──
  user_reaction: {
    behavioral: {
      listen_duration_ms: number;
      completed: boolean;
      skipped: boolean;
      repeated: number;
      volume_delta: number;
    };
    verbal?: {
      content: string;
      parsed_valence: "positive" | "negative" | "neutral";
    };
    silence_positive: boolean;       // 沉默 + 完整听完 = 高置信度正向
  };

  // ── 情绪 delta（由情感 agent 计算） ──
  emotion_delta: { p: number; a: number; d: number };
};
```

**核心设计**：这一个结构一次性承担四件事——推荐反馈、情绪日记、共同记忆的原料、工程师 agent 的分析样本。**"沉默是第一等信号"**在这里落地为 `silence_positive: true`，不是缺失，是明确的信息。

### 2.2 灵魂状态模型：一个会呼吸的 JSON

```json
{
  "agent_id": "lyra_001",
  "created_at": "2026-07-06",

  "musical_taste_base": {
    "// 底色：季度演化一次": "",
    "aesthetic_axes": {
      "restraint_vs_expression": 0.7,
      "narrative_vs_atmospheric": 0.6,
      "polished_vs_raw": -0.3,
      "novelty_seeking": 0.5
    },
    "affinity_genres": ["post-rock", "modern classical", "ambient electronica"],
    "aversion_signals": ["over-produced pop", "loudness-war master"],
    "backbone": "有品味的朋友:会推你可能第一遍不懂但三个月后会懂的歌"
  },

  "dynamic_mood": {
    "// 心情：每 turn 更新": "",
    "current_pad": { "p": 0.3, "a": -0.2, "d": 0.1 },
    "attention_to_user": 0.85,
    "recent_bias": "偏向温暖、慢速"
  },

  "shared_memory": [
    {
      "timestamp": "2026-11-03T02:47",
      "song_id": "nuvole_bianche_ludovico",
      "context": "深夜加班疲惫,我放了这首,他没跳",
      "significance": "慢速古典钢琴对他的深夜疲惫有效"
    }
  ],

  "evolution_log": [
    {
      "quarter": "2026-Q3",
      "summary": "他今年开始搜'环境音乐'越来越频繁",
      "adjustment": "affinity_genres 加入 ambient; novelty_seeking 0.4→0.5",
      "rollback_id": "evo-2026Q3-a1b2"
    }
  ],

  "proactive_budget": {
    "daily_limit": 3,
    "sulk_until": null,
    "kind_budgets": {
      "morning": 1, "care": 1, "anniversary": 1, "share": 1, "rhythm": 2
    }
  }
}
```

**核心节律**：底色季度变，心情每 turn 变。

### 2.3 选歌算法：三步思考，非匹配

灵魂 agent 的选歌链路是**三步理解**，不是"取相似向量"：

1. **诊断当下** —— `user_utterance + current_emotion` → LLM 输出：
   `{ parsed_emotion, salient_context, needed_shift }`
   `needed_shift` 是关键：**需要被接住？需要一点力气？需要陪你待着？需要被打断？**

2. **形成"歌的目标画像"（一段自然语言，不是向量）**
   例：*"慢速起手、前 20 秒克制、大提琴出现的时候情绪要能抬起来一点，但不能高兴，是那种'看到了希望'的抬起。"*

3. **交给曲库 agent**：曲库拿这段画像做语义检索（embedding + 音频特征过滤 + 生成兜底），返回 3~5 首候选，灵魂 agent 选一首并写小注。

**为什么"目标画像"是自然语言不是向量**：保住 agent 的"人味"——它不在做数值优化，它在**理解**。这段自然语言也可以暴露给用户（"我原本是想找..."），实现完全可解释。

### 2.4 反馈捕获：三源合成一个情绪 delta

| 源 | 内容 | 处理 |
|---|---|---|
| **行为** | listen_duration / skip / repeat / volume | 直接量化 |
| **口头** | 你的下一句话 | 情感 agent 解析极性 + 具体反馈 |
| **沉默** | 无口头 + listen_duration > 阈值 | **视为高置信度正向** |

三源合成 → 情感 agent 推断本次 `emotion_delta` → 写入 `dynamic_mood`。

### 2.5 演化机制：自主执行 + 用户随时纠偏

三层节律：

- **每 turn**：`dynamic_mood` 更新（快、自动）
- **每周**：LLM 扫描本周 turns，往 `shared_memory` 里挑显著事件
- **每季度**：LLM 深度复盘 → **自主更新** `musical_taste_base` → 写入 `evolution_log` → 在 `memory.md` 打一条演化通告

**用户纠偏三种通道**：
- **命令式**：菜单里 `Rollback last evolution` 一键撤销上一次演化
- **对话式**：口头说"你把 novelty_seeking 拉得太高了" → 情感 agent 识别为纠偏 → 灵魂 agent 修正
- **硬编辑**：直接改 `memory.md` 或 `soul_state` 字段，灵魂 agent 下次启动读取

**审计留痕**：每一次演化 + 每一次纠偏都写入 `evolution_log`，构成"成长史"。

---

## 第 3 节：记忆系统

### 3.1 双存储：SQLite 是骨架，`memory.md` 是叙事

| 存储 | 形态 | 谁用 | 特点 |
|---|---|---|---|
| **SQLite** | 结构化 | agent 查询、分析、条件检索 | source of truth |
| **`memory.md`** | 自然语言 tag 化 | 用户随时读/改；灵魂 agent 也读 | 叙事视图 + 人类编辑面 |

**双向同步**：结构化数据变更 → 触发 `memory.md` 相关段落重生成；用户手工编辑 `memory.md` → 灵魂 agent 定期扫描并同步 SQLite（LLM 做冲突消解）。

### 3.2 `memory.md` 结构（tag 化 facts 库）

放在项目根目录：

```markdown
# Lyra Memory

## Facts (Conditional Preferences)
> tag 化的条件事实。灵魂 agent 每次决策先扫这里。
> 格式：`#tag1 #tag2 ... → 偏好/结论 (置信度, 验证次数, 最近验证)`

- #天气:雨天 → 佛教音乐 / 环境音乐 (conf: 0.82, n=6, 2026-06-30)
- #时段:周一下午 → 昂扬、节奏鲜明 (conf: 0.71, n=4, 2026-07-01)
- #时段:深夜 #状态:疲惫 → 慢速古典钢琴 (conf: 0.87, n=9, 2026-07-06)
- #活动:写代码 #时段:上午 → 无人声电子 (conf: 0.72, n=12)
- #活动:通勤 → 独立摇滚、中等能量 (conf: 0.65, n=8)
- #心情:被卡住 → 有节奏但不喧嚣，比如 lo-fi (conf: 0.6, n=3)
- #情绪:强正向后 → 敢推还没验证过的新方向 (元规则, conf: 0.9)

## Aversions (强负信号)
- #风格:过度修饰的流行 (n=7 次跳过)
- #时段:深夜 #风格:高激励 EDM (n=3 次跳过)

## Salient Moments
> 单次显著事件的完整叙事记录。

- **2026-07-06 02:47** #时段:深夜 #状态:疲惫
  → 《Nuvole Bianche》完整听完，沉默正向。

## Living Portrait
> 你的画像，我持续覆写。

- 音乐坐标：偏克制、叙事性、原生质感
- 深夜情绪信号：疲惫但不封闭
- 最近三个月新兴趣：环境音乐

## Dreams
> 我的每日反思。

- **2026-07-07 03:14** 回想昨天…

## Evolutions
- **2026-Q3** novelty_seeking 0.4→0.5 —— 撤销：`Rollback 2026-Q3`

## Our Songs (共同记忆的曲目)
- 《Nuvole Bianche》 - Ludovico Einaudi → 深夜疲惫锚点
```

**Fact 生命周期**：
- 诞生：agent 从多次相似 turn 里提取 hypothesis → 首次验证进入 facts 段，标 `n=1`
- 强化：同 tag 组合发生相符行为 → n++，conf 上调
- 削弱：相反行为 → conf 下调；conf < 0.3 且 n>5 → 移入 archived section
- 人工纠偏：直接改 markdown

**Tag 词典（v0.1 命名空间）**：
- `时段/天气/活动/心情/情绪/位置/同伴/事件`
- 允许灵魂 agent 在 dream 中自主发明新维度并写入

**v0.1 中 `memory.md` 段落覆盖**：Facts、Aversions、Salient Moments、Living Portrait 上线；Dreams 段落存在但只有手动触发内容；Evolutions 段落空占位（v0.3 季度演化上线后填充）；Our Songs 从 Salient Moments 中的显著回合自动派生。工程师 agent（v0.3）上线后会在 `memory.md` 追加 "Engineer's Log" 段落记录日报和周报。

**查询流程**：情感 agent 给出当前 tag 集 → grep facts 段拿匹配条目 → 塞进灵魂 agent prompt。**不用向量检索，纯 tag 命中**——快、准、可解释。

### 3.3 情绪提取子系统

情感 agent 每 turn 做两件事：
1. **State extraction**：抽取 PAD + labels → `emotion_snapshots` 表
2. **Moment tagging**：判断本 turn 是否"显著"（强正/强负/意外/破纪录时长）→ 显著则写 `shared_memory` + `memory.md` Salient Moments

**回溯 query 支持**：
- "过去一个月我周三下午的情绪基线？"
- "上季度我情绪最低谷时听的三首歌？"
- SQLite 直接完成，不用 LLM，秒返回

### 3.4 Auto Dream：让 agent 有 REM 睡眠

灵感：Stanford Generative Agents 的 reflection，MemGPT 的 background consolidation。

**触发模式（可组合）**：

| 模式 | 描述 | 默认 |
|---|---|---|
| 固定时段 | 每天某时段（默认 03:14） | ✓ 开 |
| 空闲侦测 | 系统空闲 >30 min 且非睡眠时段 | ✓ 开 |
| 手动触发 | 菜单一键 "Dream now" | ✓ 开 |
| 事件触发 | 显著情绪波动/强反馈后触发短梦 | v0.2 开 |

**并发保护**：一次 dream 进行中不能起第二次。24h 内固定时段模式不再重复触发。

**梦分两种**：
- **Deep dream**（每日一次）：回顾 24h，可产出 hypothesis update / new tag / proactive plan
- **Micro dream**（事件触发，v0.2）：只回顾最近 30 min，只更新 `dynamic_mood` 和当日 Salient Moments

**Dream 流程**：

```
1. Fetch 近 24h + 7d 的 turns + emotion_snapshots
2. LLM (深度模型) prompted as 灵魂 agent:
   "回顾这一天/一周。有什么模式？有什么变化？
    有什么我原来没注意到的？有什么想调整的假设？"
3. 输出 (JSON):
   {
     dream_narrative: "一段自然语言反思",
     insights: [
       { type: "hypothesis_update", target: "...", new_value: "..." },
       { type: "new_shared_memory", song_id: "...", significance: "..." },
       { type: "mood_recalibration", pad_delta: {...} },
       { type: "proactive_plan", kind: "care", when: "tomorrow morning", song_hint: "..." }
     ]
   }
4. 应用 insights (受限于沙盒规则)
5. dream_narrative 写入 memory.md 的 Dreams section
```

**Dream 的边界**：可以改 `dynamic_mood`、可以加 `shared_memory`、可以埋主动开口种子；**但不能改 `musical_taste_base`（底色）**——底色只能走季度演化通道。

### 3.5 情感 Agent 与 Model Provider 抽象层

情感 agent 用大模型（智谱 GLM / DeepSeek / 豆包 Pro / Claude / GPT）。

**系统级 Model Provider 抽象**（适用于所有四个 agent）：

```typescript
interface ModelProvider {
  id: "zhipu" | "deepseek" | "doubao" | "anthropic" | "openai" | "local-ollama";
  chat(messages, opts): Promise<Response>;
  embed?(text): Promise<number[]>;
  music_gen?(prompt): Promise<Track>;
}
```

**默认路由**：

```json
{
  "agent_routing": {
    "emotion":   { "primary": "zhipu:glm-4-plus",  "fallback": "deepseek:v3" },
    "companion": { "primary": "anthropic:claude-opus-4-7", "fallback": "zhipu:glm-4-plus" },
    "library":   { "primary": "deepseek:v3",       "embed": "zhipu:embedding-3" },
    "engineer":  { "primary": "claude-code-cli" },
    "music_gen": { "primary": "doubao:seed-music-v1" }
  }
}
```

- 情感用国内大模型：语义精准、中文强、快
- 灵魂用最强模型：它是"灵魂"，值得
- 曲库用中等模型 + embedding
- 工程师用 Claude Code CLI
- 生成用豆包 Seed-Music

**BYOK & 本地兜底**：所有 key 存 Tauri 系统 keychain。可选 ollama 本地兜底（DeepSeek-R1 蒸馏版），断网时降级。

---

## 第 4 节：主动性引擎（Proactive Engine）

### 4.1 五种主动开口的规约表

| 种类 | 触发条件 | 语气 | 每日预算 | 冷却期 |
|---|---|---|---|---|
| 🌅 **morning** | 早上第一次打开（当日首次） | "早" 一样淡的开场 | 1 | 24h |
| 💗 **care** | 情感 agent 预测低谷 / 熬夜 >02:00 / 长时间高压 / (post-MVP: HRV 骤降) | 关切、克制、不问诊 | 1 | 6h |
| 📅 **anniversary** | 命中 `shared_memory` 日期锚点、共听曲目周年 | 温柔的追忆感 | 1 | 30d 内不重同锚点 |
| 🎁 **share** | 曲库发现符合底色的新曲；或 dream 里种下 | 有品味朋友的随口分享 | 1 | 12h |
| ⏳ **rhythm** | 连续工作/专注 >90min；一个 flow 结束的自然节点 | 提示性、松一口气 | 2 | 90min |

**总日预算 = 3**（是**总量**，不是 5 种都跑）。

### 4.2 触发架构：信号 → 意图 → 分寸门 → 呈现

```
Signal Sources → Trigger Rules → ProactiveIntent[] → Politeness Gate
                                                          ↓
                                                    Fulfillment
                                                    (dream seed 优先)
                                                          ↓
                                                    Presentation
                                                    (Tray 呼吸 / 通知)
                                                    ★ 绝不自动播放 ★
```

**Signal Sources**（v0.2 全量，v0.1 只做 SystemClock + AppLifecycle）：
- SystemClock / AppLifecycle / Calendar / Weather / OSFocus / Idle / EmotionAgent / DreamSeed / Ring(post-MVP)

**关键设计**：Fulfillment 优先用 dream seed——灵魂 agent 昨夜"梦"里想好的意图，跑触发时秒取秒开口，不用等 LLM。

### 4.3 分寸门 6 条硬闸

```typescript
function politenessGate(intent: ProactiveIntent, state: SoulState): boolean {
  if (state.today_proactive_count >= state.proactive_budget.daily_limit) return false;
  if (state.today_kind_count[intent.kind] >= state.proactive_budget.kind_budgets[intent.kind])
    return false;
  if (now() - state.last_kind_fire[intent.kind] < COOLDOWNS[intent.kind]) return false;
  if (isFocusOrSleep() && !(intent.kind === "care" && intent.urgency >= 0.85))
    return false;
  if (state.sulk_until && now() < state.sulk_until) return false;
  if (isCurrentlyPlayingOtherSource()) return false;
  return true;
}
```

### 4.4 呈现层：真正的"分寸"发生在这里

**绝不自动播放。绝不弹窗。**

三档呈现：

- **档 1（最克制）**：仅 Tray 图标呼吸 + 菜单栏小圆点
- **档 2（默认）**：+ 一条低调系统通知："💬 我想给你放一首"（不含歌名）
- **档 3（陪伴）**：+ 微弱音效（可选）

用户点开 → 进入对话界面 → 看到候选歌 + 小注 → **手动按播放**才响。

**有效期**：意图有 `valid_until`（默认 30 min）。超时未点开计为"消极忽略"（非拒绝非接受）。

### 4.5 Sulk Mode：拒绝反馈闭环

追踪最近 N 次主动开口的反应：Accepted / Dismissed / Ignored / Rejected

- 连续 3 次 `Dismissed` 或 `Rejected` → **进入 Sulk Mode 3 天**（所有主动开口关闭）
- 连续 5 次 `Ignored` → **降低 daily_limit 到 1**（保守模式）
- 用户主动打开对话 + 说话 → 立即结束 Sulk Mode

### 4.6 主动开口后的 turn 回填

主动开口后无论用户什么反应都写一次 `DialogueTurn`：
- `user_utterance.modality = "proactive-open"`, `content = ""`
- `agent_response.proactive_kind = ...`
- `user_reaction` 记录 Accepted/Ignored/Dismissed/Rejected
- 完整参与情绪 delta 推断、facts 强化/削弱、shared_memory 更新

**主动开口与被动回应共享同一份数据模型。**

---

## 第 5 节：自进化闭环（身体层 / 工程师 Agent）

### 5.1 边界地图：三色区

```
🟢 GREEN ZONE  (工程师完全自主)
   agents/*/prompts/**, agents/*/config.json, themes/**,
   scripts/scrapers/**, plugins/**, content/**,
   docs/generated/**, memory.md 部分段落

🟡 YELLOW ZONE  (必须 PR + 用户 review 才合入)
   agents/*/orchestration.ts, agents/*/state_machine.ts,
   db/migrations/**, src/api/**, new agent 定义

🔴 RED ZONE  (绝对禁止，尝试即失败)
   src/audio/**, src/security/**, src/engineer/** (自改),
   .env*, config/secrets/**, db/schema.sql 核心表,
   boundary_map.yaml (元规则本身)
```

**Enforcement 由 Tauri 后端把关**（不是靠 agent 自觉）：Rust 侧检查 path 是否在允许列表，Red 直接返回 EACCES，Yellow 强制进 review 队列。**硬闸不是软劝**。

### 5.2 工程师 Agent 的日循环 + 周循环

```
日循环 (每天 04:00 或用户指定时段):
  1. Ingest    (读 24h logs / turns / crashes / feature_requests)
  2. Reflect   (LLM 生成 daily digest → memory.md 追加)
  3. Plan      (roadmap 打分排序，选出今日可跑任务)
  4. Execute   (spawn Claude Code CLI 跑 Green 任务)
  5. Verify    (跑 tests + verifier agent 判断)
  6. Present   (Tray 呼吸，通知今日进度)

周循环 (每周日 21:00):
  Deep reflection → Roadmap 大扫除 → "本周变化" 写入 memory.md
```

### 5.3 Roadmap 数据模型

```typescript
type RoadmapItem = {
  id: string;
  created_at: number;
  created_by:
    | "engineer-daily" | "engineer-weekly"
    | "user-verbal" | "user-explicit"
    | "soul-request" | "dream-seed";

  title: string;
  rationale: string;
  evidence: string[];

  proposed_change: {
    zone: "green" | "yellow";       // red 直接拒收
    files: string[];
    summary: string;
  };

  status: "proposed" | "queued" | "in_progress" | "review" | "merged" | "abandoned" | "failed";
  priority: number;
  effort: "S" | "M" | "L";
};
```

**Red zone 处理**：涉及 red zone 文件路径的意图在 Ingest 阶段直接被剔除并 log 到 `engineer_audit.blocked_intents`，不会进入 roadmap。这样 red zone 违规在最早的入口就被拦下，永远不会进入执行链路。

### 5.4 灵魂 → 工程师 请求通道

灵魂/情感/曲库 agent 可以写 `feature_requests`：

```typescript
type FeatureRequest = {
  from_agent: "companion" | "library" | "emotion";
  when: number;
  desire: string;
  observed_pattern: string;
  urgency: "nice_to_have" | "important" | "blocking";
};
```

工程师 Ingest 阶段消费 → 转 RoadmapItem。

**这形成灵魂 ⇄ 身体闭环**：灵魂发现需要 → 身体实现 → 灵魂用上新能力 → 用户反馈流回灵魂 → 灵魂再发现下一件需要。

### 5.5 Claude Code CLI 集成

```rust
// src-tauri/src/engineer.rs
#[tauri::command]
async fn engineer_execute(task_id: String, prompt: String) -> Result<String, String> {
    // 1. 建 git branch: engineer/YYYY-MM-DD-<task_id>
    // 2. spawn `claude` CLI with restricted --allowed-tools
    // 3. Stream stdout → 前端可视化
    // 4. 完成后 verify (unit tests + boundary check + verifier agent)
    // 5. Green Zone 通过 → auto merge
    //    Yellow Zone 通过 → 进 review 队列
    // 6. 失败 → 打 "failed"，回滚 branch
}
```

Claude Code 跑时读一个特殊 `AGENTS.md`，声明"engineer sandbox 规则"。

### 5.6 用户交互面：Roadmap 看板

```
🔧 Engineer's Roadmap                  [Autopilot: ON] [Cadence: Daily]

🌱 Proposed  (12)
📋 Queued    (3)
🔧 In Progress: "Add Bandcamp ambient scraper" (est 8 min left)
👀 Review    (2)   ← Yellow Zone，需要你一票
✅ Merged    (145 this quarter)
🗑 Abandoned (7)
```

每条 Yellow Zone 提议有 `[Approve] [Reject] [Discuss with agent]`。Discuss 打开对话框，用户可以对着 PR 说话，工程师会修改提议。

### 5.7 安全阀

- 每一次 session 独立 git branch：`engineer/YYYY-MM-DD-<task_id>`
- 每次 merge 是真实 commit，可 `git revert`
- **紧急刹车**：`.omc/PANIC` 文件存在时，工程师全线停摆
- **预算护栏**：每月 LLM 花费上限 $20，超限进入静默
- **审计留痕**：完整流水存 `engineer_audit`

### 5.8 双 Loop 耦合结构

灵魂 loop 与工程师 loop **并行运行、互为信号源**。

```
┌─────────────────────────────────────────────┐
│  🌙 灵魂 Loop (Existential Evolution)        │
│  turn: dynamic_mood                           │
│  week: shared_memory                          │
│  quarter: taste_base                          │
└──────┬──────────────────────────▲────────────┘
       │ ①feature_request         │ ④改动生效
       ▼                          │
┌──────┴──────────────────────────┴────────────┐
│  🔧 工程师 Loop (Capability Evolution)        │
│  day: roadmap + Green auto-execute           │
│  week: deep reflect + roadmap 重排           │
└──────────────────────────────────────────────┘
       ▲                          ▲
       │ ②灵魂纠偏 (verbal)        │ ③能力纠偏 (verbal/UI)
       └─── 用户 ──────────────────┘
```

**四条耦合通道**：
- ①灵魂 → 工程师：`feature_requests` + dream seeds
- ②用户 → 灵魂：verbal → 情感 agent 识别 → 直接改 taste/mood
- ③用户 → 工程师：verbal/UI → 生成 roadmap item
- ④工程师 → 灵魂：git merge → 灵魂 restart 加载新配置

**三大风险与锚点**：

| 风险 | 描述 | 锚点 |
|---|---|---|
| A. 正反馈失控 | 工程师改灵魂 → 短期指标改善 → 继续改 → 灵魂扁平化 | 季度 report 检测 `aesthetic_axes` 方差；收窄超阈值则冻结灵魂 prompt 改动一季度 |
| B. 写冲突 | 季度演化与工程师改 prompt 同时发生 | SQLite `soul_lock` 表；灵魂 evolution 期间加写锁 |
| C. 反馈稀释 | 一句话应影响两个 loop，只走一条会漏 | 情感 agent 抽取 verbal 时输出 `{soul_correction, engineer_task, both}` 三种；一句话拆两条信号下发 |

**时间尺度覆盖三种成长节律**：turn（分钟）情绪响应 / day-week 认知积累 / quarter 身份演变。两 loop 每周对齐一次，输出并排的"这周变化了什么"与"这周能力多了什么"，构成活的成长档案。

---

## 第 6 节：MVP 切片

### 6.1 v0.1 一句话定义

> **一个能用你的本地曲库、和你以"歌为一句话"聊天、并且在 `memory.md` 里越来越懂你的桌面 app。**

不主动开口、不自我改代码、不生成音乐、不接戒指、不接互联网曲源。**但核心对话循环是完整的、真的运作起来的。**

### 6.2 In / Out 矩阵

| 模块 | v0.1 | 何时进 |
|---|---|---|
| Tauri 壳 + 全屏对话 UI | ✅ | v0.1 |
| SQLite + `memory.md` 双存储 | ✅ | v0.1 |
| 灵魂 agent（选歌 + 小注 + dynamic_mood） | ✅ 基础版 | v0.1 |
| 情感 agent（每 turn 抽 PAD 状态） | ✅ 基础版 | v0.1 |
| 曲库 agent（仅本地车道） | ✅ | v0.1 |
| DialogueTurn 完整数据模型 | ✅ | v0.1 |
| Facts 提取写 memory.md | ✅ | v0.1 |
| Model provider 抽象（Claude + DeepSeek） | ✅ | v0.1 |
| 音频渲染（mp3/flac/wav） | ✅ | v0.1 |
| Shared memory + Salient moments | ✅ | v0.1 |
| Auto dream | ⚠️ 手动按钮 | Auto 版留 v0.2 |
| 网络多源解析 | ❌ | v0.2 |
| 音乐生成（豆包） | ❌ | v0.2 |
| 主动开口引擎 | ❌ | v0.2（先只做 morning） |
| 工程师 agent + Claude Code | ❌ | v0.3 |
| 季度演化 + evolution log | ❌（数据不够） | v0.3 |
| 智能戒指 | ❌ | v0.3+ |
| 情感 agent 预测通道 | ❌ | v0.2 |

### 6.3 v0.1 里程碑（4 个 sprint，各约 1 周）

**Sprint 0：骨架**
- Tauri + React 初始化
- Rust 侧 rodio 播放最小验证
- SQLite schema + tauri-plugin-sql 打通
- Model provider 抽象 + Claude/DeepSeek adapter
- 空壳 UI 能播本地文件

**Sprint 1：核心对话循环**
- 全屏对话 UI（输入框 + 封面 + 小注）
- 灵魂 agent 最小版：文本 → 选歌 → 输出 rationale
- 情感 agent 最小版：文本 → 输出 `current_emotion`
- DialogueTurn 写 SQLite
- reaction 采集
- **验收**：连续跑 20 个 turn，数据都在库里

**Sprint 2：记忆与人格**
- `memory.md` 生成 + 双向同步
- Facts 提取：多次相似 turn → hypothesis → 写 tag 段
- Salient moments 判定与写入
- Soul state JSON 持久化
- 手动 "Reflect now" → 单次 deep dream
- **验收**：用一周后 `memory.md` 至少 5 条自动 fact

**Sprint 3：打磨**
- UI 时尚化（封面 + 一根光带表示情绪走向）
- 快捷键 / tray / 后台运行
- Bug 收敛 + 稳定性
- 设置面板（切 provider、看用量）
- **验收**：日均使用两次，用满两周不崩

### 6.4 验收剧本

**剧本 A：疲惫深夜**
1. 深夜说"最近有点累"
2. 情感 agent 识别为疲惫 + 低唤起
3. 灵魂 agent 选一首慢速温柔 + 写解释
4. 我听完不说话
5. Turn 存库，`silence_positive=true`
6. 一周内再触发相似状态，`memory.md` 有 `#时段:深夜 #状态:疲惫 → ...` fact

**剧本 B：换一首**
1. 说"想专注写代码"
2. Agent 给了一首但偏快
3. 我说"换一首，安静点"
4. Agent 有骨气地问一句或直接换更贴的
5. 反馈闭环 → 下次同场景不再犯

**剧本 C：手动反思**
1. 两周后点 "Reflect now"
2. 灵魂 agent 追加 Dream 到 `memory.md`
3. Dream 里至少一条**未意识到但一读就点头**的观察

### 6.5 反范围（v0.1 明确不做）

- **推荐列表 / 歌单浏览页 / 曲库管理页**：一律没有
- **社交/分享**：永远不做
- **多用户**：单 profile
- **移动端/Web 端**：只桌面
- **付费/账号系统**：不做
- **通用推荐算法**（协同过滤、embeddings 训练）：不做

### 6.6 v0.2+ 预告

- **v0.2 主题：让它主动 + 走出去**  
  网络多源曲库、morning 主动开口、auto dream、豆包 Seed-Music、情感 agent 预测通道
- **v0.3 主题：让它自己动手**  
  工程师 agent + Claude Code + 三色边界 enforcement + 季度演化
- **v0.4+ 主题：让它和身体连起来**  
  智能戒指、日历/天气/位置深度集成、对接 `情绪引擎` `电子宠物`
- **v1.0**：所有 flags 打开

---

## 附录 A：术语表

| 术语 | 释义 |
|---|---|
| DialogueTurn | 一次对话回合的原子记录，包含话/歌/反应/情绪 delta |
| Fact | tag 化条件偏好，如 `#时段:深夜 #状态:疲惫 → 慢速古典钢琴` |
| Dream | 灵魂 agent 的离线反思循环，每日一次 deep + 事件触发 micro |
| Sulk Mode | 灵魂 agent 被拒绝后的 3 天静默期 |
| Soul Loop | 灵魂 agent 的 turn/week/quarter 三层演化循环 |
| Engineer Loop | 工程师 agent 的 day/week 能力演化循环 |
| Green/Yellow/Red Zone | 工程师可修改文件的三色边界 |
| PAD | Pleasure/Arousal/Dominance 情感三维模型（源自 `情绪引擎.md`）|
| Dream Seed | Dream 中种下的下一天主动开口意图 |
| Politeness Gate | 主动开口前必过的 6 条硬闸 |

## 附录 B：外部依赖清单

- **Tauri 2.x**（Rust 后端 + WebView 前端框架）
- **rodio** 或类似 Rust 音频库
- **tauri-plugin-sql**（SQLite 集成）
- **sqlite-vec**（向量检索，可选，v0.2 用得多）
- **React 18+, TypeScript 5+**
- **智谱 GLM API / DeepSeek API / Claude API**（用户 BYOK）
- **豆包 Seed-Music API**（v0.2）
- **Claude Code CLI**（v0.3）
- **ollama + DeepSeek-R1 蒸馏版**（可选本地兜底）

## 附录 C：开放问题（写在这里，等下一轮 planning 决定）

1. **DialogueTurn 里"哭了/笑了"这种强情绪标记**是否单独一栏？目前塞在 `verbal.content` 由情感 agent 解析。
2. **memory.md 中 tag 词典的扩展权限**：允许 agent 自主发明新 tag namespace，还是只允许在既有 8 个命名空间内加新 tag？
3. **情感 agent 主/副模型的流量分配**：默认 primary 全走大模型，还是先跑小模型判 confidence，低 confidence 才升级到大模型？
4. **曲库 agent 的音频特征提取**：v0.1 是否要跑本地 essentia/librosa 提 BPM/energy？还是完全靠 LLM 从歌词/tags 推断？
5. **本地曲库大小假设**：如果用户有 5000 首本地曲，embedding 索引怎么增量维护？
6. **memory.md 冲突消解**：用户手改 + agent 自动改冲突时的处理策略（LLM 判断合并？三方 diff？）

---

## 修订历史

- **2026-07-06 v0**：初稿。从 `需求.md` + `情绪引擎.md` 出发，经过 6 轮结构化头脑风暴形成。
