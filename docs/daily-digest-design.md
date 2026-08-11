# 日报（Daily Digest）设计稿 · v2

> 日期：2026-08-11（v2：纳入 **锁定播放 / 单曲循环**）  
> 状态：待用户确认后进入实现计划  
> 范围：iOS + `@lyra/core` 为主，桌面复用同一套分析  
> 关联：`docs/lock-play-design.md`（已实现：会话态 `trackLock` + 同曲重播 + 文案遍数）  
> **硬约束：不改现有推荐逻辑、锁定播放行为与首页样式**——日报只旁路采集与产出

---

## 0. 大原则

**日报只陈述「昨天可核对的行为事实」，再推出「有证据的轻结论」；禁止用情绪均值或模型想象填空。**

1. **采集尽力、结论克制**：播放秒数、反复、**锁定循环遍数**、歌词、沉浸、前后台等能记都记；缺测到的标在 `data_quality`。  
2. **事实先于文案**：每句可回溯到 `activity_events` / `play_sessions` / 既有表。  
3. **结论可证伪**：每条结论 ≥1 条证据；不够则「观察不足」。  
4. **旁路零侵入**：埋点 fire-and-forget；不改编排选歌、不改锁定状态机、不改首页 CSS；新入口独立。  
5. **两种「锁」必须分清（命名铁律）**：
   - `moodLocked` / `sessionMoodAnchor` = **心情锚点**（推荐权重）  
   - `trackLock` = **锁定播放 / 单曲循环**（用户主动锁当前曲）  
   日报文案与字段一律用「锁定播放 / 单曲循环」，禁止写成「心情锁定」。

---

## 1. 产品定义

| 项 | 决定 |
|---|---|
| 窗口 | 本地 **昨天** 自然日 |
| 自动 | 每天 **08:00** 生成昨天日报 |
| 手动 | `/day`（桌面）等；有文件读盘 |
| `/mood` | 并存（近 60 轮即时总结） |
| 周报 / reflect | 独立；不混 |

### 1.1 锁定播放在日报里是什么（相对 v1 的核心增量）

锁定播放（`setTrackLock`）已实现、**会话不落库**。对日报而言它是最强的「故意反复听」信号：

| 行为 | 现网 | 日报要记的 |
|---|---|---|
| 开锁 | `trackLock={songId, playCount:1}`，清 native 预填队列 | `track_lock_on` |
| 关锁 / 切歌 / 新输入 / 历史重播 / 上一首 | `clearTrackLock` | `track_lock_off{reason}` |
| 锁中自然播完 | 同曲重播，`playCount++`，重生 rationale，`repeated++` | `track_lock_loop{play_count}` + 新 `play_session`（`source=track_lock_loop`） |
| 锁中暂停 | 不循环 | 普通 pause（不算 loop） |

**不能**只靠「同歌连续 session」推断锁定——用户也可能未开锁却连听；必须以显式事件 / session 标记为准。

---

## 2. 隔离边界

### 2.1 允许

- 新表：`activity_events`、`play_sessions`、`daily_snapshots`  
- 新模块：`packages/core/src/daily/`、`trackActivity`  
- 在 `setTrackLock` / `onSongComplete` 锁定分支 / UI 锁定钮旁 **追加**埋点（不改分支语义）  
- `/day`、Settings「日报」；阅读器复用 `WeeklyReader` 壳  
- 独立 `dailyRenderer.ts`（可抄周报 token，不改 weekly/首页样式文件）

### 2.2 禁止

- 改 `LibraryAgent` / `moodLocked` / Companion 选歌 prompt  
- 改锁定播放状态机（切歌退锁、遍数、文案重生策略）  
- 改 `TrackLockButton` / 首页布局样式（埋点除外）  
- 把日报结论写回推荐或自动开锁  

### 2.3 埋点

```ts
void trackActivity({ name: "track_lock_on", songId, props }).catch(() => {});
```

---

## 3. 数据层（采集尽可能多 + 锁定）

### 3.1 `activity_events`

字段同前：`id, ts, day_key, name, song_id, turn_id, props_json, platform`。  
索引：`(day_key, name)`、`(day_key, ts)`、`(day_key, song_id)`。

### 3.2 `play_sessions`（一首歌一次连续播放）

| 字段 | 说明 |
|---|---|
| id / day_key / song_id / turn_id | |
| source | 见下（**含 `track_lock_loop`**） |
| started_at / ended_at | |
| listen_ms | 有效收听（扣 pause；后台默认算听） |
| pause_ms / duration_ms / max_position_ms / seek_count | |
| end_reason | `completed` / `skipped` / `replaced` / `stopped` / `lock_loop_boundary` |
| was_background_ms | |
| lyrics_open_count | |
| **under_track_lock** | bool：本 session 是否在锁定播放中 |
| **lock_play_count** | 锁定会话内遍数（开锁首遍=1；每次 lock loop 后递增）；非锁定为 null |
| consecutive_repeat_index | 同歌短间隙连续次数（**不含**是否开锁；与锁定正交） |

`source` ∈  
`user_input | lyra_start | auto_advance | song_intent | history_replay | previous | track_lock_loop | unknown`

锁定循环每一次「播完再起」= **新 session**（`source=track_lock_loop`，`under_track_lock=true`，`lock_play_count=N`），这样才能精确到「第 3 遍听了多少秒」。

### 3.3 事件字典

**入口**：`lyra_start`、`user_input{char_count}`、`song_intent_hit|miss`、`retry`

**锁定播放（新增，P0 必接）**：

| name | props | 时机 |
|---|---|---|
| `track_lock_on` | `song_id`, `play_count:1` | `setTrackLock(true)` |
| `track_lock_off` | `song_id`, `play_count_at_off`, `reason`: `toggle`/`skip`/`previous`/`user_input`/`replay`/`song_change` | `clearTrackLock` 各入口 |
| `track_lock_loop` | `song_id`, `play_count`, `session_id`, `prev_listen_ms?` | 锁定态 `onSongComplete` 即将重播前 |

**听歌**：`play_start`（带 `under_track_lock`,`lock_play_count?`）、`play_progress`（5s/10%）、`play_pause/resume`、`play_seek`、`play_complete`、`play_skip`、`play_replaced`

**歌词 / 沉浸 / 历史收藏 / 前后台**：同 v1（`lyrics_*`、`immersive_*`、`history_*`、`favorite_*`、`app_background|foreground`）

### 3.4 既有表

- turns / feedback / favorites / shared_memory / profiles 按昨天窗口查  
- 锁定本身**不持久化**，日报**不依赖**事后从 turn.`repeated` 反推（`repeated` 可作校验旁证）

### 3.5 按歌 `TrackDayStat`（报告核心表）

| 字段 | 含义 |
|---|---|
| title / artist | |
| session_count / total_listen_ms / mean / max | |
| completed_count / skipped_count / completion_rate | |
| repeat_count | 同日开播次数 |
| max_consecutive_repeats | 短间隙连听（未必开锁） |
| **lock_toggle_count** | 对该歌开锁次数 |
| **lock_loop_count** | `track_lock_loop` 次数（= 额外完整圈数） |
| **max_lock_play_count** | 单次锁定会话达到的最大遍数 |
| **lock_listen_ms** | `under_track_lock` 的听时合计 |
| **lock_share** | `lock_listen_ms / total_listen_ms` |
| background_listen_ms / lyrics_* / favorited_today / sources | |

须能写出：

> 《山丘》昨天共听 18 分 20 秒（11 次开播）。其中 **锁定播放** 1 次会话，最高循环到第 **6** 遍，锁定内合计 14 分；另有非锁定连听 2 次。

### 3.6 概念定义（写死）

| 概念 | 定义 |
|---|---|
| **同日重复** | `session_count ≥ 2` |
| **连续反复（无锁）** | 相邻同歌、间隙 ≤30s，且 **未** `under_track_lock` |
| **锁定播放会话** | `track_lock_on` → 对应 `track_lock_off`（或日终截断） |
| **锁定循环遍数** | 该会话内 `max(lock_play_count)` |
| **锁定沉浸** | 单次锁定 `max_lock_play_count ≥ 3` 或 `lock_listen_ms ≥ 2 × duration` |
| **单次长听** | session `listen_ms ≥ max(90s, 0.6×duration)` |
| **快跳** | skip 且 `listen_ms < 15s` |

### 3.7 缺口

| 信号 | 现状 | 处理 |
|---|---|---|
| 锁定开关/遍数 | 仅内存 `trackLock` | **P0 事件 + session 字段** |
| 每遍听了几秒 | 无 | 每 loop 新 session + progress |
| 点我试试 | 与连播 modality 混 | 事件 |
| 歌词/沉浸/后台/历史 | 弱或无 | 事件 |

---

## 4. 详细报告 → 有效结论

### 4.1 三层

```text
DailyDigest → FactCard → Conclusions(规则) → DailyAgent 日信(可选) → HTML
```

HTML：**结论** + **日信** + **详细数据**（含锁定专表）。

### 4.2 Digest 章节

| 章节 | 展示 |
|---|---|
| Meta | 输入、点我试试、点歌判断、会话、前后台 |
| **Track Lock**（新） | 开锁次数、涉及歌曲、各次锁定最高遍数、锁定内总听时、关锁原因分布（toggle/skip/输入…） |
| Listening | 按歌秒数表 + 锁定列（遍数/锁定听时）+ 无锁连听 |
| Lyrics / Immersion / Library / Taste / Emotion / Moments / Quality | 同 v1，沉浸分可把「锁定沉浸」加权 |

### 4.3 结论规则（增量加粗）

| id | 条件 | 结论 |
|---|---|---|
| `lock.used` | `track_lock_on ≥ 1` | 昨天用过锁定播放；点名歌曲 |
| `lock.deep` | 任一首 `max_lock_play_count ≥ 3` 或满足锁定沉浸 | **主动单曲循环沉浸**（强证据） |
| `lock.brief` | 开锁后 `play_count_at_off ≤ 1` 且很快 skip/切歌 | 试了锁定但未留下 |
| `lock.vs_organic` | 同日既有锁定沉浸又有无锁连听 | 区分「故意锁」vs「碰巧连听」 |
| `listening.completion_high` / `skip_heavy` / `quick_skip` / `long_form` | 同 v1 | |
| `listening.repeat_same` | 同歌多次且 **无** 锁定 | 反复听但未开锁 |
| `listening.loop_immerse` | 无锁定义的循环沉浸 | 仅当未开锁时使用，避免与 `lock.deep` 抢戏 |
| `lyrics.*` / `immersion.*` / `library.*` / `taste.*` / `sparse.*` / `quality.*` | 同 v1 | |

**优先级**：同一首歌若存在锁定，结论优先走 `lock.*`，不要用「碰巧连播」话术。

**禁止**：用 PAD 单独下结论；把 `moodLocked` 说成锁定播放。

### 4.4 FactCard 示例（锁定）

- 「锁定播放开启 2 次，涉及《山丘》《晴天》」  
- 「《山丘》单次锁定最高第 6 遍，锁定内听时 14m20s」  
- 「3 次因切歌退出锁定，1 次手动关锁」  

### 4.5 HTML 大纲

```text
昨天 · YYYY-MM-DD
① 结论（含锁定沉浸等）
② 日信
③ 详细
   - 入口元数据
   - 锁定播放（会话列表：歌名、遍数、听时、如何退出）
   - 听歌总表（秒 / 次 / 锁定标记）
   - 歌词 · 沉浸 · 收藏历史 · 气质 · 完整度
```

---

## 5. 调度与存储

同 v1：`daily_snapshots` + `dailies/daily_YYYY-MM-DD.html`；08:00；稀疏跳过。

---

## 6. 分期（全做）

| 期 | 交付 | 验收 |
|---|---|---|
| **P0** | events + play_sessions；**锁定 on/off/loop 埋点**；progress；lyra_start | DB 能查：某歌锁定最高遍数、每遍秒数 |
| **P1** | Digest（含 Track Lock 章）+ Conclusions（含 lock.*） | fixture：锁 5 遍 → `lock.deep` + 按歌秒表 |
| **P2** | Agent + renderer + 08:00 + `/day` | 早报可见锁定段；失败降级仍有数据区 |
| **P3** | 天气快照等增强 | 不挡 P2 |

P0 接线点（旁路）：

- `Orchestrator.setTrackLock` / `clearTrackLock`  
- `onSongComplete` 锁定分支（loop 前）  
- `TrackLockButton` 无需改样式，逻辑仍走 orc  
- 现有 play/skip/complete/progress UI 旁  

---

## 7. 测试

- 结论规则单测：锁定 1 遍 vs 5 遍；锁定 vs 无锁连听互不误判  
- 埋点 spy：开锁/循环/关锁各触发；**主路径 playCount / 退锁行为不变**  
- 回归：`Orchestrator` track lock 现有测试全绿；推荐测试不动  

---

## 8. 非目标

- 不持久化锁定状态到跨天（与 lock-play 设计一致）  
- 不因日报自动开关锁定  
- 不合并 moodLocked 与 trackLock  

---

## 9. 默认假设

- `/mood` 并存；结论以规则为准  
- iOS + core 先接锁定埋点（锁定 UI 主要在 mobile）  
- 桌面无锁定钮则 `track_lock_*` 为空，Quality 标明  

---

## 10. v1 → v2 变更摘要

| 项 | v1 | v2 |
|---|---|---|
| 反复听 | 只靠同歌 session 间隙 | **显式锁定播放** + 无锁连听 二分 |
| play source | 无 lock loop | + `track_lock_loop` |
| 报告章 | 无 | **Track Lock** 专章 |
| 结论 | `loop_immerse` 混用 | `lock.deep` 优先；无锁才用 organic loop |
| 隔离 | 旁路 | 额外写明：**不改已上线锁定状态机与样式** |
