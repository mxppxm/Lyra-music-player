# 按日心情总结（日报 = 日窗 Mood Summary）设计稿

> 日期：2026-08-12  
> 状态：待用户审阅后进入实现计划  
> 范围：`@lyra/core` 日报生成主路径 + 移动端历史「日报」Tab 呈现；桌面 `/mood` 窗口对齐  
> 关联：既有 `docs/daily-digest-design.md`（v2 采集/锁定）、`packages/core/src/moodSummary/*`  
> **硬约束：不改推荐打分、锁定播放状态机、首页布局样式**

---

## 0. 产品一句话

**日报不是另一套歌单报表，而是把心情总结（原 `/mood`）的窗口从「近 60 轮」改成「按自然日结算」，并把已采集的听歌/行为数据全部喂进同一套总结。**

| 之前（偏航） | 现在（本设计） |
|---|---|
| `DailyMoodAgent` 日信壳 +「停过的歌」清单 | 与 `/mood` 同一骨架：轨迹 + 走心文案 + 时段 |
| 行为数据算了但不给用户看 | digest / 结论进简报与「读解」 |
| 近 60 轮即时窗 | **昨天整天** / **今天 00:00～此刻** |

---

## 1. 日窗与入口

### 1.1 结算窗口

| 场景 | 窗口 | 触发 |
|---|---|---|
| 自动日报 | 本地昨天 `00:00:00.000`～`23:59:59.999` | 约 08:00，或冷启动补跑 |
| 手动「今天」 | 今天 `00:00`～`now` | 历史弹窗日报 Tab 现有手动入口 |
| 桌面原 `/mood` | **改为按日**（默认昨天，或可选今天已听）；**不再** `listRecentTurns(60)` | slash `/mood` |

同一 `dayKey` 一份快照；「今天」允许覆盖重生成；「昨天」默认读盘，`force` 才重算。

### 1.2 入口并存方式

- **移动端**：历史弹窗「日报」Tab → 列表 / 详情 sheet / 分享（入口与壳保留）。  
- **桌面**：`/mood` 仍打开阅读器，但数据与渲染与按日总结同源。  
- **不**再维护两套对外文案产品（日信 vs 心情总结）。

### 1.3 稀少日

- 日窗几乎无 turn 且无有效播放 → 短空态（「几乎空白」），不硬出色带与读解堆砌。  
- 有听歌、情绪标签很少 → 弱轨迹 + 行为读解；文案禁止硬猜心情。

---

## 2. 数据用法（采集要吃满）

原则：**外壳是心情总结；肉是日窗全量可用信号。** 不用 = 白埋点。

每条信号走两路（可同时）：

1. **LLM 简报** → opener / body / song_note / forward  
2. **规则读解** → 用户可见 claim + 证据（非事件名堆砌）

| 数据 | 简报 | 读解 / 呈现 |
|---|---|---|
| turns：原话、标签、PAD、旁白、时间 | 轨迹 + 关键原话摘录 | 色带、起/终/波动、时段条 |
| play_sessions：听时、完成/跳过、后台、锁定遍数 | 听最久 / 锁到第 N 遍 / 跳得勤 | lock.deep、完成率、跳过、Top 听时（点名歌） |
| track_lock_on/off/loop | 故意循环 vs 碰巧连听 | 锁定沉浸 / 试了就关 |
| lyra_start / user_input / song_intent_* | 偏随便听听还是主动说 | meta 结论 |
| lyrics_* | 对词有停留 | 翻过歌词 |
| immersive_* | 沉浸使用 | 次数/时长够阈值才出 |
| favorite_* | 今天留下的歌 | 新收藏点名 |
| history_open / history_replay | 翻旧账回听 | 历史重播 |
| app_background/foreground + was_background_ms | 后台还在听 | 后台续播占比（够才出） |
| play_pause/resume/seek/progress | 聚合成听得碎 / 听得稳 | 模式明显时一条 |
| 天气（当日有感知则写） | 一句气象事实 | 可选；没有就不写 |
| shared_memory / 显著时刻（日窗内） | salient | 有则一条 |

**明确不做**

- 「停过的歌」无权重清单  
- 以秒表/事件名为主视觉的行为看板  
- 仅凭 PAD 均值下「你很难过」类无行为锚点结论  
- 把 `moodLocked`（心情锚点）说成锁定播放

---

## 3. 生成管线

```text
触发（昨天自动 / 今天手动 / force）
  → listTurnsBetween(dayBounds)
  → listActivityEventsByDay + listPlaySessionsByDay
  → buildDailyDigest → deriveConclusions
  → summarizeMood(turns)
  → buildDayMoodBrief（轨迹 + 原话 + 结论/行为要点 + Top 歌带听时/锁定）
  → MoodSummaryAgent（按日窗微调标题/一句窗口说明；可取代 DailyMoodAgent 主路径）
  → renderDayMoodHtml（心情总结骨架 + 读解区）
  → upsert daily_snapshots
```

### 3.1 模块职责

| 模块 | 职责 |
|---|---|
| `dayKey` / `dayKeyBounds` | 日窗边界（已有） |
| `buildDailyDigest` / `deriveConclusions` | **保留并加强喂料**；结论上限约 5 条进读解 |
| `summarizeMood` | 日窗 turns → 轨迹 + 时段（已有；调用方改按日） |
| `buildDayMoodBrief`（新或由 brief 改造） | 合并 mood 数据 + digest 要点 + 可读歌名，供 LLM |
| `MoodSummaryAgent` | 主文案；prompt 注明「自然日」而非「最近几天」 |
| `renderDayMoodHtml` | 对齐桌面 mood renderer 结构 + 读解区；抽到可共用位置 |
| `runDaily` | 改为上述主路径；旧 `daily-letter-v4` 快照可 force 重生成 |
| `DailyMoodAgent` / `buildDailyMoodBrief` / 日信壳 renderer | **退主路径**（删除或仅测后清理） |

### 3.2 LLM 输出形状（对齐现有 mood）

```ts
{
  opener: string;
  body: string;
  song_note: string;  // 有足够歌信号才非空；必须点名具体歌与行为依据
  forward: string;    // 可空
}
```

硬性文案规则沿用 `MoodSummaryAgent`：口语、禁套话、禁编造、情绪起伏要说清。  
简报须包含：PAD 轨迹摘要、时段、用户原话摘录、结论人话、带听时/锁定的候选歌（不是裸 id）。

### 3.3 失败与缓存

- LLM 失败 → 规则 fallback 文案 + **读解仍可展示**  
- 非 force 且快照已是新 layout 标记 → 读盘  
- 布局版本号：如 `day-mood-v1`（写入 HTML class 或快照元数据），用于失效旧日信页

---

## 4. 呈现

### 4.1 详情结构

```text
标题：昨天的心情 / 今天的心情 · 日期 · N 次对话
opener
情绪色带（起→终）
body
song_note（斜体，可无）
起点 / 现在 / 波动（人话为主；数值可次要）
时段条（仅有数据的区间）
【这一天的读解】规则条列，每条 claim + 一句证据
forward（可空）
```

### 4.2 分享

- 默认：opener + 色带 + body + song_note  
- 读解默认不进分享图（避免报表感）

### 4.3 UI 壳

- 保留 `DailyDigestSheet` / History「日报」Tab / 分享能力  
- 换 HTML 内容即可；不为日报重做首页

---

## 5. 与旧设计的关系

| 文档/实现 | 关系 |
|---|---|
| `docs/daily-digest-design.md` v2 | **采集、锁定事件、旁路零侵入仍有效**；呈现章节被本设计取代 |
| 已落地埋点 / `play_sessions` | **全部保留**，改为服务按日心情总结 |
| 已落地日信 +「停过的歌」 | **淘汰** |
| 桌面 `app/src/moodSummary/*` | 窗口改按日；renderer 与 core/mobile 对齐或抽取共用 |

---

## 6. 分期

| 期 | 交付 | 验收 |
|---|---|---|
| **P0** | `runDaily` 按日 turns + `summarizeMood` + MoodSummary 文案；HTML 无「停过的歌」；旧快照可重生成 | 有对话的昨天能出轨迹+文案；无「停过的歌」 |
| **P1** | brief 吃满 digest/结论；读解区上屏；song_note 绑定听时/锁定 | 锁 5 遍的歌出现在 song_note 或读解 |
| **P2** | 桌面 `/mood` 改按日；共用 renderer；清理 DailyMood 死路径 | `/mood` 与日报 Tab 同源结构 |
| **P3** | 天气/显著时刻进简报（有则写） | 无天气不编造 |

---

## 7. 测试

- `summarizeMood` + 日窗 turns fixture：跨日边界不串数据  
- brief：含锁定/跳过/原话；禁止 bili: 裸 id  
- 渲染：无「停过的歌」；有读解时 claim+证据成对  
- `runDaily`：sparse / LLM fallback / force 重生成  
- 回归：Orchestrator 锁定与推荐测试不动  

---

## 8. 非目标

- 邮件、推送、独立全屏阅读器重做  
- 把日报结论写回推荐或自动开锁  
- 用行为看板取代心情总结主视觉  
- 恢复近 60 轮作为日报/心情总结默认窗  

---

## 9. 默认假设（已与用户确认）

1. 日报 = 按日结算的心情总结，不是独立「日信产品」。  
2. 已采集行为数据必须进简报与读解，不能只落库。  
3. 删除「停过的歌」清单式呈现。  
4. 方案形态：心情总结骨架 + 规则读解（原方案 A，按日窗收敛）。  
5. 旁路零侵入：不改推荐与锁定状态机。
