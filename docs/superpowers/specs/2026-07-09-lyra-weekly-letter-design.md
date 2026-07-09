# Lyra · 周报(一封信) · 设计

**日期**:2026-07-09
**代码基线**:main @ `78db63f`(Sprint 13 T7 review 之后)
**类型**:新特性 · 第 5 个 agent(WeeklyAgent)+ 静默交付通道
**版本归属**:v0.2.x / v0.3 均可承接。建议 v0.2.z(不阻塞 v0.3 工程师 agent 主线)
**相关既有 spec**:`2026-07-06-music-player-design.md` §6(哲学) · `2026-07-08-lyra-current-implementation.md` §4.5-4.6(Reflect / 显著时刻)

---

## 1. 是什么

**Lyra 每周给你写一封信,以 HTML 单文件的形式落到磁盘上。**

- 时间窗口:rolling 7 天(以生成时刻回望)
- 内容:第一人称的信 + 一根 PAD 光带 + 3-5 首本周的歌(带小注)+ 2-3 个显著时刻 + Living Portrait 本周变化
- 触发:自动(周日 03:14 搭 dream scheduler 便车)+ 手动 `/week` slash 命令
- 静默:自动写完后 UI 里**完全没有提示**。用户敲 `/week` 才发现或直接去磁盘目录看
- 存放:`<app_data_dir>/weeklies/YYYY-MM-DD_to_YYYY-MM-DD.html`,Settings 可改路径

## 2. 为什么

- Lyra 现在的整个存在,数据都留在应用里(`memory.md` / SQLite / traces)。**没有一个能带走的产物**。用户不知道自己"和她一起经历过什么"
- Reflect 是内部整理(Living Portrait / Facts / Dream),对象是 Lyra 自己。周报是**对外产物**,对象是用户 — 语气、篇幅、结构都不同,不能塞进 Reflect
- 静默 auto + 手动 slash 的组合,是"不发声,除非被叫"哲学的自然扩展:她默默留下东西,你想看才看
- HTML 单文件(内联 CSS/SVG、无外链、无 JS)天然满足:可 Cmd+P 另存 PDF · 可 Cmd+S 归档 · 可发朋友 · 十年后仍然打得开

## 3. 哲学对齐

**五字要义:静 · 虚 · 空 · 灵 · 禅**

- **静**:自动生成不发通知不改 UI。用户完全可以一年不知道有这个功能存在
- **虚**:HTML 单页最大宽度 640px,大量留白,不填不塞
- **空**:数据太少的一周(<3 turns)自动路径跳过 — 没内容不硬凑
- **灵**:信是 Claude Opus 亲自写的,不是模板填空 — 保留她的品味
- **禅**:每周一封,不多不少,长期看是节律

**硬约束**:
- letter body 第一人称"我",不出现"她"([[feedback_lyra_voice_first_person]])
- 失败静默降级到 fallback letter,绝不弹 toast

## 4. 架构

新 subsystem `src/weekly/`,与 `src/reflect/` 平级。不改动现有 4-agent 拓扑。

### 4.1 新增文件

| 文件 | 职责 |
|---|---|
| `src/weekly/WeeklyAgent.ts` | 主 agent,调 Claude Opus 4.7,输出结构化 letter JSON |
| `src/weekly/prompt.ts` | prompt 拼装(第一人称约束、写作规则、五字哲学、JSON schema)· 与 `src/reflect/prompt.ts` 同风格,co-located |
| `src/weekly/dataGather.ts` | 收集 7 天窗口内的原始数据 |
| `src/weekly/weeklyRenderer.ts` | letter JSON + 原始数据 → 完整 HTML 字符串 |
| `src/weekly/weeklyScheduler.ts` | 03:14 tick 挂钩(仅周日开火);实际是 `dreamScheduler.ts` 里一段 |
| `src/weekly/weeklyPaths.ts` | 目录/文件名解析 |
| `src/db/repo/weeklyRepo.ts` | `weekly_snapshots` 表的 CRUD |
| `src-tauri/migrations/007_weekly_snapshots.sql` | 建表(Rust 侧,通过 `tauri-plugin-sql` 注册,与 001-006 同位置) |

### 4.2 改动文件

| 文件 | 改动 |
|---|---|
| `src/home/slashCommand.ts` | 新增 `/week` handler |
| `src/settings/Settings.tsx` | 新增 `weekly.dir_override` + `weekly.auto_enabled` 两字段 |
| `src/settings/schema.ts`(如存在) | 类型加字段 |
| `src-tauri/src/lib.rs` | 注册 3 个 Rust 命令 + 在 `add_migrations` 里新增 007 条目 |
| `src-tauri/src/weekly.rs`(新) | `write_weekly_html` / `open_weekly_html` / `path_exists` 实现 |
| `src/schedule/dreamScheduler.ts` | 03:14 tick 后追加 weekly 独立错误边界分支 |

### 4.3 复用(零改动)

- Provider 路由 `src/agents/route.ts`(Claude Opus 4.7 已注册)
- `withUsageLogging` decorator(token / latency)
- `writeTrace`(reasoning_traces 落库)
- `parseLooseJson`(三层降级)
- `ChatOptions.response_format: { type: "json_object" }`(Zhipu/DeepSeek 透传;Anthropic 静默忽略)

### 4.4 数据边界

WeeklyAgent 只读业务表,**唯一写的表是 `weekly_snapshots`**。不改 `memory.md` / `soul_state` / `dialogue_turns`。

## 5. 组件契约

### 5.1 `WeeklyAgent.ts`

```ts
class WeeklyAgent {
  constructor(deps: {
    provider: ChatProvider;
    db: DbClient;
    now: () => Date;
    memoryPath: string;  // memory.md 位置
  });
  async run(opts?: { onDemand?: boolean }): Promise<WeeklyRunResult>;
}

type WeeklyRunResult =
  | { skipped: true; reason: "sparse_week" | "auto_disabled" }
  | { skipped: false; letter: WeeklyLetterJson; raw: WeeklyRawData;
      fallback: boolean; window: WeekWindow; html: string; htmlPath: string };
```

内部 pipeline:
1. `dataGather.collectWindow(now(), 7, db, memoryPath)` → `WeeklyRawData`
2. Guard:自动路径 turns < 3 → `{ skipped, reason: "sparse_week" }`;on-demand 不 guard
3. `buildPrompt(raw)` → `PromptPayload`
4. `provider.chat({ ..., response_format: { type: "json_object" } })` → raw text
5. `parseLooseJson<WeeklyLetterJson>(raw)`
6. 失败 → 30s 后 retry 1 次(同 prompt)
7. 仍失败 → `fallback = true`,letter 由模板生成(见 §6)
8. `writeTrace({ agent: "weekly", prompt, raw, parsed })`
9. `render(letter, raw, { fallback })` → HTML string
10. `resolveWeeklyDir()` + `filenameFor(window)` → 完整 path
11. Rust invoke `write_weekly_html(path, content)`
12. `weeklyRepo.insert({ ... })`

### 5.2 letter JSON schema

```ts
type WeeklyLetterJson = {
  greeting: string;           // ≤200 字,开场
  body: string;               // 300-500 字,信主体
  songs: Array<{ song_id: string; one_liner: string }>;  // 3-5 首,一句
  moments: Array<{ moment_id: string; whisper: string }>;  // 2-3 个,一句
  portrait_change: string;    // 1-2 句,允许 ""(首周或无对比)
  closing: string;            // ≤100 字,结尾
};
```

Prompt 强约束:第一人称"我"、不出现"她"、`song_id` 必须来自候选列表、`moment_id` 必须来自本窗口 salient 列表。

### 5.3 `dataGather.ts`

```ts
async function collectWindow(
  now: Date, days: number, db: DbClient, memoryPath: string
): Promise<WeeklyRawData>;

type WeekWindow = { start: Date; end: Date; iso_week: string };

type WeeklyRawData = {
  window: WeekWindow;
  turns: DialogueTurn[];
  pad_series: Array<{ ts: Date; pad: PAD }>;
  salient: SharedMemoryRow[];
  songs_played: Array<{ track: LibraryTrack; small_note: string; count: number }>;
  living_portrait_now: string;
  living_portrait_last_close: string | null;
};
```

- `window.start = now - days*24h`;`window.end = now`(rolling)
- `iso_week`:格式 `2026-W28`(仅记录用途,不用作 UNIQUE)
- `songs_played`:按 song_id GROUP + count,`small_note` 取该 song 最近一次 turn 的 `agent_response.rationale`
- `living_portrait_last_close`:`weeklyRepo.latest()?.living_portrait_at_close ?? null`

### 5.4 `weeklyRenderer.ts`

```ts
function render(
  letter: WeeklyLetterJson,
  raw: WeeklyRawData,
  opts: { fallback: boolean }
): string;  // HTML
```

- 单文件 HTML:内联 CSS + 内联 SVG,**无 `<script>` / 无 `<link>` / 无 `<img src="http...">`**
- 中文字体栈:`system-ui, "PingFang SC", "Noto Serif CJK SC", serif`
- 最大宽度 640px,居中,行高 1.8,大量留白
- PAD 光带:SVG,横向布满,每个 turn 一个 stop(color = PAD → HSL 映射,与 `src/home/EmotionLightBand.tsx` 用同一个色板公式,抽成 pure function `padToHsl(pad)` 供二者共享)
- **XSS 硬拒**:letter 里所有用户可控字段(body/songs/moments)经 `escapeHtml` 转义后再拼

HTML 结构:
```
<article>
  <header>2026-07-02 → 2026-07-09</header>
  <section class="greeting">{{greeting}}</section>
  <section class="pad-band"><svg>...</svg></section>
  <section class="body">{{body}}</section>
  <ul class="songs">{{song 名字 · one_liner}}</ul>
  <ul class="moments">{{whisper}}</ul>
  <section class="portrait">{{portrait_change 若非空}}</section>
  <footer class="closing">{{closing}}</footer>
</article>
```

`fallback: true` 时:greeting/body/closing 走内置文案("这一周我有点跟不上,没写出信来。数据都在,下面这些是本周和你有关的东西。"),songs/moments/pad-band 照样从 raw 渲染。

### 5.5 `weeklyScheduler`(实为 `dreamScheduler.ts` 里一段)

```ts
// 03:14 tick,ReflectAgent 之后追加
if (now.getDay() === 0 && settings.weekly?.auto_enabled !== false) {
  weeklyAgent.run().then(persistIfNotSkipped).catch(logError);
}
```

**独立错误边界**:catch 后 log,不上抛,不影响 ReflectAgent。

### 5.6 `weeklyPaths.ts` + Rust 命令

TS:
```ts
async function resolveWeeklyDir(settings, appDataDir): Promise<string>;
function filenameFor(window: WeekWindow): string;
  // "2026-07-02_to_2026-07-09.html"
```

Rust(`src-tauri/src/weekly.rs`):
```rust
#[tauri::command]
fn write_weekly_html(path: String, content: String) -> Result<(), String>;
  // 创目录 → 写 <path>.tmp → rename 到 <path>(原子)

#[tauri::command]
fn open_weekly_html(path: String) -> Result<(), String>;
  // 复用 tauri-plugin-opener 打开系统默认浏览器

#[tauri::command]
fn path_exists(path: String) -> Result<bool, String>;
```

### 5.7 `weeklyRepo.ts` + migration

```sql
CREATE TABLE weekly_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  window_start TEXT NOT NULL,
  window_end TEXT NOT NULL,
  html_path TEXT NOT NULL,
  living_portrait_at_close TEXT NOT NULL,
  turn_count INTEGER NOT NULL,
  fallback INTEGER NOT NULL DEFAULT 0,  -- 1 = fallback letter
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE UNIQUE INDEX ux_weekly_window ON weekly_snapshots(window_start, window_end);
```

Repo:
```ts
insert(row: WeeklySnapshotRow): Promise<void>;
latest(): Promise<WeeklySnapshotRow | null>;
findByWindow(win: WeekWindow): Promise<WeeklySnapshotRow | null>;
deleteByWindow(win: WeekWindow): Promise<void>;
```

### 5.8 `slashCommand.ts` — `/week`

严格前缀匹配 `/^\/week\b/`(与 `/help` / `/settings` 同风格):

```ts
const win = rolling7dWindow(now());
const existing = await weeklyRepo.findByWindow(win);

if (existing && await invoke<boolean>("path_exists", { path: existing.html_path })) {
  await invoke("open_weekly_html", { path: existing.html_path });
  return;
}

if (existing) await weeklyRepo.deleteByWindow(win);

const result = await weeklyAgent.run({ onDemand: true });
if (result.skipped) return;  // 不该发生,on-demand 不 guard

await invoke("open_weekly_html", { path: result.htmlPath });
```

不 falls-through 到 Orchestrator。

### 5.9 Settings 新增

```ts
type WeeklySettings = {
  dir_override: string | null;  // null → <app_data_dir>/weeklies/
  auto_enabled: boolean;        // 默认 true
};
```

UI:
- "周报保存目录"(可选路径输入)
- "自动生成"(开关)

## 6. 数据流

### 6.1 自动路径 · 周日 03:14

```
dreamScheduler 03:14 tick
├→ ReflectAgent.run() (原有)
└→ if isSunday && auto_enabled:
     weeklyAgent.run() ── 独立错误边界
       dataGather → guard(<3 skip) → prompt → chat →
       parseLooseJson [retry 1] → writeTrace → render →
       writeHtml → weeklyRepo.insert
     UI 无任何变化 · console.info 一行审计
```

### 6.2 On-demand · `/week`

```
InputBox submit → slashCommand match
  ├→ existing HTML on disk → open · 完
  └→ 不存在 → run(onDemand) → open
     · sparse week 不 guard,走 fallback letter 分支
     · LLM 失败也 fallback,仍开
```

### 6.3 幂等约定

同一 window 的第二次 `/week` **不重跑 LLM**,直接开磁盘 HTML。要强制重生 → 手动删文件。

### 6.4 读/写摘要

| 阶段 | 读 | 写 |
|---|---|---|
| dataGather | dialogue_turns / shared_memory / library_tracks / soul_state / memory.md / weekly_snapshots | — |
| agent | — | llm_usage / reasoning_traces(decorator) |
| render | — | — |
| persist | — | 磁盘 HTML / weekly_snapshots |
| slash open | weekly_snapshots | — |

### 6.5 时间函数

全走 `deps.now()`,与 ReflectAgent / dreamScheduler 一致。test / eval 可注入固定时间。

## 7. 错误处理

**总原则**:静默哲学延伸到失败 — 不弹窗、不通知、不改 UI。

### 7.1 LLM 失败

网络 / 超时 / HTTP 5xx / 非 JSON → 30s 后 retry 1 次 → 仍失败进 fallback letter 分支(§5.4)。fallback 也照样写盘 + 入 `weekly_snapshots`(`fallback = 1`)。用户看到那句"这一周我有点跟不上"本身就是信号。

### 7.2 数据太少

`turns.length < 3`。自动路径 skip,不写盘不 insert 不调 LLM。On-demand `/week` **不 skip**,走 fallback letter + 数据段照渲。

### 7.3 Rust 命令失败

- `write_weekly_html` 失败 → console.error + **不落 weekly_snapshots**(避免脏 row)
- `open_weekly_html` 失败 → console.error + 文件仍在磁盘,用户可自开
- 均不弹提示

### 7.4 磁盘文件被删

`/week` 路径先 `path_exists` 校验,不存在 → `deleteByWindow` 清脏 row → 重生。

### 7.5 Living Portrait 漂移

- 首周:`last_close = null` → prompt 明示"上周无对比",`portrait_change` 可空
- 用户手改 memory.md:两版都塞 prompt,LLM 自判 diff

### 7.6 时区

- 存 UTC(ISO string),渲染用 `toLocaleString("zh-CN")`
- 周日判定 `now.getDay() === 0` 走本地时区(与 dreamScheduler 同)

### 7.7 迁移

`CREATE TABLE IF NOT EXISTS` + `CREATE UNIQUE INDEX` 幂等,遵循项目现有 migration 模式。

### 7.8 并发

自动路径 + 用户同分钟 `/week` → 后写者会因 UNIQUE 抛错 → catch 后视为已生成直接开。**不加显式 mutex**(概率低、后果轻)。

## 8. 测试

### 8.1 Vitest 单测

- `dataGather.test.ts` — 窗口边界 / turns 0-N / pad_series / salient JOIN / songs 去重 / memory.md 无 Portrait 段
- `weeklyRenderer.test.ts` — HTML 结构 / 无外链 / SVG stop 数 = pad_series / 中文渲染 / fallback 分支 / XSS escape
- `weeklyPaths.test.ts` — Settings override / 默认目录 / 文件名格式
- `WeeklyAgent.test.ts` — 成功 / retry / retry 后 fallback / parseLooseJson 兜底 / sparse week 分支
- `scheduler.test.ts` — 周日触发 / 非周日不触发 / weekly 抛错不影响 Reflect
- `weeklyRepo.test.ts` — CRUD + UNIQUE

### 8.2 Vitest 集成

`weekly.integration.test.ts` — 真 in-memory sqlite + 全 migrations + fixture 数据 + provider stub。断言 repo 落行 + HTML 含所有 songs.one_liner + moments.whisper + PAD 光带 stop 数。

### 8.3 Rust cargo

`src-tauri/tests/weekly_test.rs` — `write_weekly_html` 原子写 / 目录自动创建 / 权限失败 / `path_exists` 两分支。

### 8.4 Regression eval(defer)

参考 `emotion-eval.regression.test.ts` 模式,LYRA_EVAL=1 gated,3-5 条 held-out fixture。断言:JSON schema / `body` ≥ 200 字 / 第一人称 "我" ≥ 3 次 / 无"她" / `songs.length ∈ [3,5]` / `moments.length ∈ [2,3]`。

**本 sprint 不做**,先跑几周实信再定门槛。

### 8.5 手工验收

- [ ] 塞满 7 天真使用后 `/week`,人眼审语气
- [ ] Cmd+P 打印预览正常,可另存 PDF
- [ ] Cmd+S 另存单文件,离线打开完整
- [ ] Settings 改 `dir_override`,新文件落新位置
- [ ] 手删磁盘 HTML,`/week` 自动重生
- [ ] Sparse week fixture(1 turn):`/week` 走 fallback,自动路径跳过
- [ ] 拔 Anthropic key,`/week` 走 fallback letter,含道歉那句

### 8.6 不测

- 信内容"好不好"(主观,交给读者)
- HTML 视觉 diff(无 CI)
- tauri-plugin-opener 完整 flow(信任既有)

## 9. Defer(明确不做)

- **Regression eval**(§8.4):等实际几周信积累后再定门槛
- **月报 / 季报 / 年报**:本 spec 只做周报。数据结构 (`weekly_snapshots`) 已为月报聚合留了口子,月报走另一 spec
- **信内容 A/B 试**(比如两个 prompt 变体轮流跑):无 UI,一次一封,直接迭代 prompt
- **HTML 可交互(音频预览 / 播放当时选中的歌)**:违反"单文件 · 离线可开"约束
- **通知 / badge / UI 提示**:硬约束,永远不做
- **多用户 / 云同步 / 分享按钮**:反范围
- **可视化视频 / 动画封面**:违反 "静 · 虚"
- **信的多语言**:Lyra 目前中文原生,不引入 i18n 分支

## 10. 版本影响

| 层 | 影响 |
|---|---|
| 存储 | +1 migration(007)+1 表 |
| Agent 拓扑 | +1 agent(WeeklyAgent,与 4-agent 主拓扑并列) |
| UI | +2 Settings 字段,主对话 UI 零改动 |
| Slash | +1 命令(`/week`) |
| Rust | +1 模块(`weekly.rs`),+3 命令 |
| 测试面 | +6 vitest 文件(含 integration)+1 cargo 文件 |

**代码基线预估**:vitest 625 → ~700,cargo 33 → ~40,build KB +2-3(HTML 生成器很小)。

## 11. 交付顺序建议

Plan(下一步)可拆:
1. Migration + repo + Rust 命令(基础设施,无 LLM)
2. dataGather + renderer(无 LLM,数据 → HTML 全流程可跑)
3. WeeklyAgent + prompt + parseLooseJson 集成
4. dreamScheduler 挂钩 + slashCommand `/week`
5. Settings UI + 手工验收

每一步都可独立测,每一步都是可以 ship 的中间态。

---

**Lyra 不完美,但她开始给你留东西了。**
