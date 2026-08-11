# 日报（Daily Digest）设计稿

> 日期：2026-08-11  
> 状态：待用户确认后进入实现计划  
> 范围：iOS + `@lyra/core` 为主，桌面复用同一套分析；**不改现有推荐/播放/UI 样式**

---

## 0. 大原则（唯一北极星）

**日报只陈述「昨天可核对的行为事实」，再由此推出「有证据的轻结论」；禁止用情绪均值或模型想象填空。**

展开成三条铁律：

1. **事实先于文案**：凡写入报告的句子，必须能回溯到 `activity_events` 或既有表字段；回溯不到就不写。
2. **结论必须可证伪**：每条结论绑定 ≥1 条证据（次数、时长、歌名、输入原文片段）；证据不足则输出「观察不足 / 昨天几乎没…」，不允许「感觉你有点累」这类无锚点判断。
3. **旁路零侵入**：埋点与日报是附加链路。不得改变选歌、打分、播放队列、现有组件视觉与交互；新 UI 仅新增入口（如 `/day`、设置开关），不改装首页布局。

---

## 1. 产品定义

| 项 | 决定 |
|---|---|
| 窗口 | 本地时区 **昨天** `00:00:00.000`～`23:59:59.999` |
| 自动 | 每天 **08:00** 生成昨天日报 |
| 手动 | `/day`（桌面）/ 设置或历史旁入口（移动可后置）：有文件则读盘，无则现生成 |
| 与 `/mood` | **并存**：`/mood` 仍为近 60 轮即时总结；日报是日历日落盘产物 |
| 与周报 | 周报继续管近 7 天长信；日报不管 Living Portrait 长对比 |
| 与 DreamScheduler 03:14 reflect | **分离**：reflect 仍做梦；日报另挂 08:00 |

---

## 2. 隔离边界（不能影响现有逻辑和样式）

### 2.1 允许碰

- 新增表 / repo / 包模块：`activity_events`、`daily_*`、`packages/core/src/daily/`、`app/src/daily/`（或 `app-mobile` 只接调度与打开）
- 在**现有调用点旁**追加 `trackActivity(...)`（fire-and-forget，失败只打日志）
- 新增 slash `/day`、Settings 里「日报」fieldset（仿周报，不改其它 settings 布局语义）
- 阅读器：**复用**现有 `WeeklyReader` iframe 壳展示 HTML（与 `/mood`、`/week` 相同），不新造一套视觉系统；日报 HTML **内部**可用与周报同源 token，但**不修改** `weeklyRenderer` / 首页 CSS

### 2.2 禁止碰

- `LibraryAgent` 打分权重、`moodLocked`、推荐 prompt、预筛抽样
- 播放器原生队列、锁屏、现有 `mobile.css` 首页沉浸样式（除非纯新增 class 且默认不启用）
- 改写 `/mood`、`/week` 的既有行为与文案
- 为了日报去「顺便重构」Home / SmallNote / History 的结构和样式

### 2.3 埋点写法约定

```ts
// 正确：不影响主路径
void trackActivity({ name: "lyrics_open", songId, props }).catch(() => {});

// 禁止：await 埋点导致选歌/翻页变慢；禁止因埋点 throw 打断播放
```

`lyra-start` modality 若要区分点我试试与连播：只扩展 **新 modality 值或并行事件**，自动连播路径语义不变。

---

## 3. 数据层

### 3.1 新建 `activity_events`（append-only）

| 字段 | 类型 | 说明 |
|---|---|---|
| id | text | uuid |
| ts | integer | epoch ms |
| day_key | text | 本地 `YYYY-MM-DD` |
| name | text | 见事件字典 |
| song_id | text null | |
| turn_id | text null | |
| props_json | text | |
| platform | text | `ios` / `desktop` |

索引：`(day_key, name)`、`(day_key, ts)`。

### 3.2 事件字典（P0 必接）

**入口元数据**：`lyra_start`、`user_input{char_count}`、`song_intent_hit|miss{query}`、`retry`  

**听歌**：`play_start{source}`、`play_complete{listen_ms}`、`play_skip{listen_ms}`、`play_pause`、`play_resume`  

**歌词**：`lyrics_open{surface}`、`lyrics_close{dwell_ms}`、`lyrics_refresh`  

**沉浸 / UX**：`immersive_enter|exit{dwell_ms}`、`history_open|close{tab,dwell_ms}`、`history_replay{song_id}`、`favorite_add|remove`  

**前后台**：`app_background|foreground{playing,song_id?}`  

`play_start.source` ∈ `user_input | lyra_start | auto_advance | song_intent | history_replay | previous`。

### 3.3 既有表窗口查询（P1）

- `dialogue_turns` / `track_feedback` / `favorites(favorited_at)` / `shared_memory` / `music_profiles` batch  
- 新增 `list*Between(startMs, endMs)`；**不改**现有 `listRecent*` 语义  

### 3.4 现状缺口（写进 data_quality，不装有）

| 信号 | 现状 | 处理 |
|---|---|---|
| 点我试试次数 | 与连播同为 `proactive-open` | 事件 + 可选 modality `lyra-start` |
| 歌词停留 | 无 | 新事件 |
| 沉浸模式 | 纯 UI | 新事件 |
| 听时长 | 移动端未接 `onListenProgress` | 事件区间 + 接线（不改播控逻辑） |
| 切后台 | 仅 reconcile | 新事件 |
| 打开历史 | 无 | 新事件 |

---

## 4. 从数据到「详细报告」再到「有效结论」（本方案核心）

先前方案偏「采集清单」；本节写明 **怎么出详细报告、怎么得出有效结论**。

### 4.1 三层产物（缺一不可）

```text
DailyDigest（结构化详细报告，机器可读）
    → FactCard（中文子弹事实，带 evidence_ids）
        → Conclusions（规则引擎产出的「有证据结论」，每条绑证据）
            → DailyAgent 日信（只改写 Conclusions+FactCard，不发明新事实）
                → HTML 详细报告页（表格/区块展示 Digest + 信）
```

用户看到的 HTML **同时包含**：

1. **详细报告区**（数字与列表，不靠 LLM）  
2. **结论区**（规则引擎条列，可点开证据）  
3. **日信区**（LLM 把结论写成可读短文，可选；失败则只展示 1+2）

### 4.2 详细报告 = `DailyDigest` 固定章节

分析器 `buildDailyDigest(dayKey)` 纯函数/无 LLM，章节固定：

| 章节 | 内容来源 | 报告里展示什么 |
|---|---|---|
| Meta | events + turns | 输入次数/原文摘要、点我试试次数、点歌命中/未命中、会话数、首末活跃、前台/后台时长、后台续播时长 |
| Listening | play_* + feedback + turns | 开播数、独特曲、完成/跳过/完成率、总听时长、按 source 分解、Top 曲表 |
| Lyrics | lyrics_* | 打开次数、涉及曲目、总/均停留、刷新、Top 查词曲 |
| Immersion | immersive_* + listening + lyrics + bg | 沉浸模式时长、长听次数、快跳次数、后台续播比、综合标签 |
| Library UX | favorite_* + history_* | 新藏/取消、打开历史次数与停留、历史重播 |
| Taste | profiles ⋈ 完成/收藏/长听加权 | Top mood/genre/theme/energy；回避信号 |
| Emotion | turns PAD/labels（辅） | 挂在 session/时段上的均值 + 对应 Top 歌（不单独出「波动度故事」） |
| Moments | shared_memory | 显著时刻列表 |
| Quality | 覆盖率标记 | 哪些信号缺失 |

「详细」指的是这些章节写全，而不是 LLM 写长。

### 4.3 有效结论 = 规则引擎 `deriveConclusions(digest)`

**原则**：结论模板化 + 阈值；不满足阈值 → 不产出该条。

每条结论结构：

```ts
type DailyConclusion = {
  id: string;                    // e.g. "immersion.deep"
  kind: "observation" | "pattern" | "anomaly" | "sparse";
  claim: string;                 // 中文结论句（可直接展示）
  evidence: Array<{              // 必须非空
    ref: string;                 // 指向 digest 字段路径或 event id
    display: string;             // 「完成率 58%（12 首里完成 7）」
  }>;
  confidence: "high" | "medium" | "low";
};
```

#### 规则目录（v1，可单测）

| id | 触发条件（示例阈值） | 结论方向 |
|---|---|---|
| `meta.lyra_start_driven` | `lyra_start_count ≥ 2` 且 `lyra_start` 来源播放占比 ≥ 40% | 昨天偏「点我试试」驱动 |
| `meta.input_heavy` | `input_count ≥ 3` | 昨天有明确心情/文本介入；附原文 Top |
| `listening.completion_high` | 完成率 ≥ 0.65 且 plays ≥ 5 | 听得完整 |
| `listening.skip_heavy` | 跳过率 ≥ 0.5 且 skips ≥ 3 | 挑选多 / 不契多 |
| `listening.quick_skip` | 快跳（listen_ms&lt;15s）≥ 3 | 碎听、难以停留 |
| `listening.long_form` | 长听（≥0.6 曲长或 ≥90s）≥ 3 | 愿意把歌听完 |
| `lyrics.engaged` | 查词曲 ≥ 2 或 总 dwell ≥ 60s | 对词有兴趣 |
| `immersion.deep` | 标签=沉浸 或（immersive_ms≥10min 且 background_play_ratio≥0.3） | 深度使用（含后台） |
| `immersion.fragmented` | 标签=碎听 | 多次短会话 |
| `library.favorited` | favorite_adds ≥ 1 | 点名收藏曲 |
| `library.history_revisit` | history_replays ≥ 1 | 主动翻历史回听 |
| `taste.dominant_mood` | Top mood 权重显著领先 | 昨天气质主调 |
| `taste.aversion` | 某 genre/mood 跳过显著 | 昨天回避某气质 |
| `sparse.day` | turns&lt;2 且 events 极少 | 昨天几乎没使用 → 整报降级 |
| `quality.partial` | 关键信号 coverage 低 | 结论标 low confidence |

**冲突处理**：`completion_high` 与 `skip_heavy` 可同时存在（不同时段）——按 session 拆开出结论，不平均抹掉。

**禁止规则**：任何「仅有 PAD 均值 &lt; 0 ⇒ 你很难过」——除非同时有输入原文或高跳过/负口头等行为证据。

### 4.4 LLM 日信（第三层，可失败）

输入：**仅** `FactCard` + `Conclusions[]`（含 evidence.display）+ Top 曲名。  

输出：短 JSON（greeting / body / closing）；body **必须改写已有结论**，不得新增无证据主张。  

校验：简单关键词/歌名检查可选；失败 → HTML 只渲染详细报告 + 结论列表。

### 4.5 HTML 信息架构（详细报告长什么样）

```text
标题：昨天 · YYYY-MM-DD
① 结论摘要（3～7 条 Conclusions，每条下挂证据一行）
② 日信（有则显示；无则跳过）
③ 详细数据
   - 昨天你怎么进来的（点我试试 / 输入 / 点歌判断）
   - 听歌（表）
   - 歌词与沉浸
   - 收藏与历史
   - 气质分布
   - 数据完整度
```

视觉：独立 `dailyRenderer.ts`，**复制**周报色带/字体 token，**不 import 修改** weekly 样式文件；首页 CSS 零改动。

---

## 5. 调度与存储

- `daily_snapshots(day_key, html_path, turn_count, event_count, fallback, created_at)`  
- 文件：`<appData>/dailies/daily_YYYY-MM-DD.html`  
- 08:00：`runDaily({ dayKey: yesterday })`；与 reflect/weekly **独立**错误边界  
- 稀疏自动跳过；手动可出「昨天几乎没打开」页  

---

## 6. 实现分期（全做 = S1）

| 期 | 交付 | 验收 |
|---|---|---|
| P0 | `activity_events` + `trackActivity` 全量接线；`lyra_start` 可计数；listen 进度接线 | 单测 + 真机打日志能看到事件 |
| P1 | `buildDailyDigest` + `deriveConclusions` + FactCard；窗口 repo | 给定假事件 fixture → 报告章节与结论快照稳定 |
| P2 | DailyAgent + `dailyRenderer` + 08:00 + `/day` + Settings；复用 WeeklyReader | 早 8 点出昨天 HTML；失败有降级 |
| P3 | 天气日快照、桌面 perception 并入、seek 等 | 标为增强，不挡 P2 |

---

## 7. 测试策略

- 分析器 / 结论规则：**纯函数单测**（无 LLM）  
- 埋点：关键路径 spy `trackActivity` 被调用，且主路径仍成功  
- 回归：现有 Orchestrator / LibraryAgent / 首页组件测试全绿；视觉以「首页截图不变」为人工检查项  

---

## 8. 非目标

- 不替换推荐系统  
- 不做跨设备云同步日报  
- 不把日报结论写回 `moodLocked` / soul（避免反馈环改变现网行为；若未来要做须另开 RFC）  

---

## 9. 待确认（本文件写定后的默认值）

若无异议，按下列默认执行：

- `/mood` 与日报并存  
- 结论以规则引擎为准，LLM 只润色  
- 首发平台：core 分析全平台；**iOS + 桌面**都接 P0 埋点；08:00 调度桌面先接、iOS 用本地通知或下次冷启动补跑（实现计划里写清）  
