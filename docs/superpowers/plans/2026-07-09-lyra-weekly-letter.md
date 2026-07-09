# Lyra 周报(一封信) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Lyra 每周静默生成一份 HTML 单文件的信,自动周日 03:14 落盘 + 用户 `/week` 时开浏览器。UI 无任何提示,失败静默降级到 fallback letter。

**Architecture:** 新 subsystem `src/weekly/` + 第 5 个 agent (`WeeklyAgent`,Claude Opus 4.7 生成结构化 letter JSON) + renderer (letter + 数据 → HTML 字符串,内联 CSS/SVG 零外链) + `weekly_snapshots` 表 + Rust `weekly.rs` 提供原子写盘 + opener plugin 开浏览器。搭 `dreamScheduler` 03:14 tick 便车,仅周日开火。不侵入 4-agent 主拓扑。

**Tech Stack:** TypeScript / React / Tauri 2 / `tauri-plugin-sql` / `tauri-plugin-opener` / vitest / cargo / SQLite (`sqlite:lyra.db`) / Claude Opus 4.7 via `routeProvider("companion")`

## Global Constraints

- 第一人称"我" — letter body 与 fallback 文案不出现"她"。这是硬约束 ([[feedback_lyra_voice_first_person]])
- 静默 — 自动路径失败/成功都不改 UI、不发通知、不 toast。console 日志允许
- 无外链 — HTML 单文件必须能离线打开:不含 `<script>`、`<link rel="stylesheet">`、`http://` / `https://` (fallback 文案里道歉的那段除外,道歉里不能带链接)
- XSS 拒 — letter 所有用户可控字段(body / songs / moments / portrait_change)经 `escapeHtml` 后再拼入模板
- 幂等 — 同一 window 第二次 `/week` 不重跑 LLM
- 依赖固定 — 不加新 npm/cargo 包(`tauri-plugin-opener` 与 `tauri-plugin-sql` 已在)
- 项目基线 — 完成后:vitest 从 625 → ~700 全绿,cargo 33 → ~40 全绿,typecheck 0 error,build KB 增量 <5 KB
- 编码风格 — 遵循现有 `src/reflect/*` 与 `src/db/repo/reasoningTracesRepo.ts` 的注释密度与命名。default 注释低密度,只在 WHY 非显然时写
- Provider — 用 `routeProvider("companion")`,不写死 Anthropic;chat 时打 `response_format: { type: "json_object" }` + `enable_thinking: false` + `agent: "weekly"`(与 ReflectAgent 同 pattern)
- Test 隔离 — LLM 全 mock。真 Opus 调用仅走 opt-in eval,eval **不在本 sprint 交付范围**

---

## File Structure

**新建**(TypeScript 侧,`音乐播放器/app/src/weekly/`):
- `WeeklyAgent.ts` — agent class,LLM 调用 + retry + fallback + writeTrace
- `WeeklyAgent.test.ts`
- `prompt.ts` — `WEEKLY_SYSTEM_PROMPT` + `buildUserMessage(raw)`
- `prompt.test.ts`
- `dataGather.ts` — `collectWindow(now, days, db, memoryPath)` 及类型
- `dataGather.test.ts`
- `weeklyRenderer.ts` — `render(letter, raw, opts)` + `padToHsl(pad)` + `escapeHtml`
- `weeklyRenderer.test.ts`
- `weeklyPaths.ts` — `resolveWeeklyDir` + `filenameFor` + `rolling7dWindow`
- `weeklyPaths.test.ts`
- `weekly.integration.test.ts` — 真 in-memory sqlite + 全 migrations + fixture

**新建**(TypeScript 侧,`音乐播放器/app/src/db/repo/`):
- `weeklyRepo.ts`
- `weeklyRepo.test.ts`

**新建**(Rust 侧,`音乐播放器/app/src-tauri/`):
- `src/weekly.rs` — `write_weekly_html` + `open_weekly_html` + `path_exists`
- `tests/weekly_test.rs`
- `migrations/007_weekly_snapshots.sql`

**修改**:
- `音乐播放器/app/src-tauri/src/lib.rs` — 声明 `pub mod weekly;`,注册 migration 007,invoke_handler 追加 3 命令
- `音乐播放器/app/src/db/repo/reasoningTracesRepo.ts` — `AgentKind` union 加 `"weekly"`
- `音乐播放器/app/src/settings/secrets.ts` — `SECRET_KEYS` 加 2 字段
- `音乐播放器/app/src/settings/Settings.tsx` — 追加 weekly 配置区块
- `音乐播放器/app/src/home/slashCommand.ts` — `SlashCommand` union 加 `{ kind: "week" }`,`parseSlashCommand` 匹配 `/week`
- `音乐播放器/app/src/home/slashCommand.test.ts` — 追加 `/week` 用例
- `音乐播放器/app/src/home/HomeView.tsx` — 新 prop `onWeek?: () => Promise<void>`,`submit` 里分发
- `音乐播放器/app/src/schedule/dreamScheduler.ts` — config 加 `runWeekly?`,daily tick 里周日 branch
- `音乐播放器/app/src/schedule/dreamScheduler.test.ts` — 追加 weekly 触发用例
- `音乐播放器/app/src/App.tsx`(或应用装配位) — 装配 WeeklyAgent 实例 + `/week` handler 连线

---

## Task 1: Migration 007 + AgentKind 扩展

**Files:**
- Create: `音乐播放器/app/src-tauri/migrations/007_weekly_snapshots.sql`
- Modify: `音乐播放器/app/src-tauri/src/lib.rs:112-160`(向 `add_migrations` vec 追加 v7)
- Modify: `音乐播放器/app/src/db/repo/reasoningTracesRepo.ts:9-15`(AgentKind 加 `"weekly"`)

**Interfaces:**
- Consumes: 既有 `Migration { version, description, sql, kind }` 模式
- Produces: 表 `weekly_snapshots`(schema 见 SQL);`AgentKind` 类型 union 中包含 `"weekly"`,供后续 writeTrace 用

- [ ] **Step 1: 建 migration SQL**

Create `音乐播放器/app/src-tauri/migrations/007_weekly_snapshots.sql`:

```sql
-- Sprint · 周报(一封信)
-- Records one row per generated weekly report. Also carries the closing
-- Living Portrait so the next week's generation can diff against it.
-- fallback = 1 marks reports written from the fallback path (LLM failed
-- or sparse-week on-demand); useful for later opt-in eval bucketing.

CREATE TABLE weekly_snapshots (
  id                        INTEGER PRIMARY KEY AUTOINCREMENT,
  window_start              TEXT    NOT NULL,
  window_end                TEXT    NOT NULL,
  html_path                 TEXT    NOT NULL,
  living_portrait_at_close  TEXT    NOT NULL,
  turn_count                INTEGER NOT NULL,
  fallback                  INTEGER NOT NULL DEFAULT 0,
  created_at                TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX ux_weekly_window ON weekly_snapshots(window_start, window_end);
CREATE INDEX idx_weekly_created ON weekly_snapshots(created_at DESC);
```

- [ ] **Step 2: 在 `lib.rs` 的 `add_migrations` vec 追加 v7 条目**

Modify `音乐播放器/app/src-tauri/src/lib.rs:145-150`(紧跟 v6 之后):

```rust
                        Migration {
                            version: 6,
                            description: "reasoning traces + latency columns",
                            sql: include_str!("../migrations/006_reasoning_traces.sql"),
                            kind: MigrationKind::Up,
                        },
                        Migration {
                            version: 7,
                            description: "weekly_snapshots table",
                            sql: include_str!("../migrations/007_weekly_snapshots.sql"),
                            kind: MigrationKind::Up,
                        },
```

- [ ] **Step 3: `AgentKind` 加 `"weekly"`**

Modify `音乐播放器/app/src/db/repo/reasoningTracesRepo.ts:9-15`:

```ts
export type AgentKind =
  | "companion"
  | "emotion"
  | "emotion_rule"
  | "reflect"
  | "perception"
  | "engineer"
  | "weekly";
```

- [ ] **Step 4: 跑 cargo build 验证 migration 编译**

Run: `cd 音乐播放器/app/src-tauri && cargo check`
Expected: no errors(migration `include_str!` 路径解析成功)

- [ ] **Step 5: 跑 vitest 验证 AgentKind 类型改动无 downstream 断链**

Run: `cd 音乐播放器/app && pnpm test -- reasoningTraces`
Expected: existing repo tests pass

- [ ] **Step 6: Commit**

```bash
git add 音乐播放器/app/src-tauri/migrations/007_weekly_snapshots.sql \
        音乐播放器/app/src-tauri/src/lib.rs \
        音乐播放器/app/src/db/repo/reasoningTracesRepo.ts
git commit -m "feat(lyra): migration 007 weekly_snapshots + AgentKind 'weekly'"
```

---

## Task 2: `weeklyRepo` CRUD + tests

**Files:**
- Create: `音乐播放器/app/src/db/repo/weeklyRepo.ts`
- Create: `音乐播放器/app/src/db/repo/weeklyRepo.test.ts`

**Interfaces:**
- Consumes: `getDb()` from `../client`
- Produces:
  - `type WeeklySnapshotRow = { id?: number; window_start: string; window_end: string; html_path: string; living_portrait_at_close: string; turn_count: number; fallback: 0 | 1; created_at?: string }`
  - `insert(row): Promise<void>`
  - `latest(): Promise<WeeklySnapshotRow | null>`
  - `findByWindow(start: string, end: string): Promise<WeeklySnapshotRow | null>`
  - `deleteByWindow(start: string, end: string): Promise<void>`

- [ ] **Step 1: 写失败测试** — `音乐播放器/app/src/db/repo/weeklyRepo.test.ts`

Fixture 结构参照 `reasoningTracesRepo.test.ts`(mock `getDb` 返 `{ execute, select }` 假实现):

```ts
import { describe, it, expect, beforeEach, vi } from "vitest";

type FakeRow = {
  id: number;
  window_start: string;
  window_end: string;
  html_path: string;
  living_portrait_at_close: string;
  turn_count: number;
  fallback: number;
  created_at: string;
};

let rows: FakeRow[] = [];
let nextId = 1;

const execute = vi.fn(async (sql: string, args: unknown[]) => {
  if (sql.startsWith("INSERT")) {
    const [ws, we] = [args[0] as string, args[1] as string];
    if (rows.some((r) => r.window_start === ws && r.window_end === we)) {
      throw new Error("UNIQUE constraint failed: ux_weekly_window");
    }
    rows.push({
      id: nextId++,
      window_start: ws,
      window_end: we,
      html_path: args[2] as string,
      living_portrait_at_close: args[3] as string,
      turn_count: args[4] as number,
      fallback: args[5] as number,
      created_at: "2026-07-09T00:00:00Z",
    });
    return { rowsAffected: 1, lastInsertId: rows[rows.length - 1].id };
  }
  if (sql.startsWith("DELETE")) {
    const [ws, we] = [args[0] as string, args[1] as string];
    const before = rows.length;
    rows = rows.filter((r) => !(r.window_start === ws && r.window_end === we));
    return { rowsAffected: before - rows.length, lastInsertId: 0 };
  }
  return { rowsAffected: 0, lastInsertId: 0 };
});

const select = vi.fn(async (sql: string, args: unknown[]) => {
  if (sql.includes("ORDER BY id DESC LIMIT 1")) {
    return rows.length === 0 ? [] : [rows[rows.length - 1]];
  }
  if (sql.includes("WHERE window_start = ? AND window_end = ?")) {
    const [ws, we] = [args[0] as string, args[1] as string];
    return rows.filter((r) => r.window_start === ws && r.window_end === we);
  }
  return [];
});

vi.mock("../client", () => ({ getDb: async () => ({ execute, select }) }));

import * as repo from "./weeklyRepo";

beforeEach(() => {
  rows = [];
  nextId = 1;
  execute.mockClear();
  select.mockClear();
});

describe("weeklyRepo", () => {
  it("insert stores a row and can be found by window", async () => {
    await repo.insert({
      window_start: "2026-07-02", window_end: "2026-07-09",
      html_path: "/tmp/w.html", living_portrait_at_close: "portrait",
      turn_count: 12, fallback: 0,
    });
    const found = await repo.findByWindow("2026-07-02", "2026-07-09");
    expect(found?.html_path).toBe("/tmp/w.html");
    expect(found?.turn_count).toBe(12);
  });

  it("latest returns the highest-id row", async () => {
    await repo.insert({
      window_start: "2026-06-25", window_end: "2026-07-02",
      html_path: "/a.html", living_portrait_at_close: "A", turn_count: 5, fallback: 0,
    });
    await repo.insert({
      window_start: "2026-07-02", window_end: "2026-07-09",
      html_path: "/b.html", living_portrait_at_close: "B", turn_count: 7, fallback: 1,
    });
    const latest = await repo.latest();
    expect(latest?.living_portrait_at_close).toBe("B");
  });

  it("insert twice with same window throws (UNIQUE)", async () => {
    const row = {
      window_start: "2026-07-02", window_end: "2026-07-09",
      html_path: "/x.html", living_portrait_at_close: "p", turn_count: 1, fallback: 0 as const,
    };
    await repo.insert(row);
    await expect(repo.insert(row)).rejects.toThrow(/UNIQUE/);
  });

  it("deleteByWindow removes and lets a re-insert succeed", async () => {
    const row = {
      window_start: "2026-07-02", window_end: "2026-07-09",
      html_path: "/x.html", living_portrait_at_close: "p", turn_count: 1, fallback: 0 as const,
    };
    await repo.insert(row);
    await repo.deleteByWindow("2026-07-02", "2026-07-09");
    expect(await repo.findByWindow("2026-07-02", "2026-07-09")).toBeNull();
    await expect(repo.insert(row)).resolves.toBeUndefined();
  });

  it("findByWindow returns null when nothing matches", async () => {
    const out = await repo.findByWindow("2020-01-01", "2020-01-08");
    expect(out).toBeNull();
  });

  it("latest returns null when table empty", async () => {
    expect(await repo.latest()).toBeNull();
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd 音乐播放器/app && pnpm test -- weeklyRepo`
Expected: FAIL(`Cannot find module './weeklyRepo'`)

- [ ] **Step 3: 实现 `weeklyRepo.ts`**

Create `音乐播放器/app/src/db/repo/weeklyRepo.ts`:

```ts
import { getDb } from "../client";

export type WeeklySnapshotRow = {
  id?: number;
  window_start: string;
  window_end: string;
  html_path: string;
  living_portrait_at_close: string;
  turn_count: number;
  fallback: 0 | 1;
  created_at?: string;
};

export async function insert(row: WeeklySnapshotRow): Promise<void> {
  const db = await getDb();
  await db.execute(
    `INSERT INTO weekly_snapshots
       (window_start, window_end, html_path,
        living_portrait_at_close, turn_count, fallback)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      row.window_start,
      row.window_end,
      row.html_path,
      row.living_portrait_at_close,
      row.turn_count,
      row.fallback,
    ],
  );
}

export async function latest(): Promise<WeeklySnapshotRow | null> {
  const db = await getDb();
  const out = await db.select<WeeklySnapshotRow[]>(
    `SELECT id, window_start, window_end, html_path,
            living_portrait_at_close, turn_count, fallback, created_at
     FROM weekly_snapshots
     ORDER BY id DESC LIMIT 1`,
  );
  return out.length === 0 ? null : out[0];
}

export async function findByWindow(
  window_start: string,
  window_end: string,
): Promise<WeeklySnapshotRow | null> {
  const db = await getDb();
  const out = await db.select<WeeklySnapshotRow[]>(
    `SELECT id, window_start, window_end, html_path,
            living_portrait_at_close, turn_count, fallback, created_at
     FROM weekly_snapshots
     WHERE window_start = ? AND window_end = ?`,
    [window_start, window_end],
  );
  return out.length === 0 ? null : out[0];
}

export async function deleteByWindow(
  window_start: string,
  window_end: string,
): Promise<void> {
  const db = await getDb();
  await db.execute(
    `DELETE FROM weekly_snapshots WHERE window_start = ? AND window_end = ?`,
    [window_start, window_end],
  );
}
```

- [ ] **Step 4: 跑测试确认全绿**

Run: `cd 音乐播放器/app && pnpm test -- weeklyRepo`
Expected: 6 passed

- [ ] **Step 5: Commit**

```bash
git add 音乐播放器/app/src/db/repo/weeklyRepo.ts 音乐播放器/app/src/db/repo/weeklyRepo.test.ts
git commit -m "feat(lyra): weeklyRepo CRUD + UNIQUE-per-window guard"
```

---

## Task 3: Rust `weekly.rs` 命令 + cargo tests

**Files:**
- Create: `音乐播放器/app/src-tauri/src/weekly.rs`
- Create: `音乐播放器/app/src-tauri/tests/weekly_test.rs`
- Modify: `音乐播放器/app/src-tauri/src/lib.rs:1-6`(声明 `pub mod weekly;`)
- Modify: `音乐播放器/app/src-tauri/src/lib.rs:164-179`(invoke_handler 追加 3 命令)

**Interfaces:**
- Consumes: `std::fs` / `std::path` / `tauri_plugin_opener::OpenerExt`
- Produces:
  - `write_weekly_html(path: String, content: String) -> Result<(), String>` — 自动创父目录,原子写(先写 `<path>.tmp` 再 rename 到 `<path>`)
  - `open_weekly_html(app: AppHandle, path: String) -> Result<(), String>` — 用 opener plugin 拉起系统默认浏览器
  - `path_exists(path: String) -> Result<bool, String>`

- [ ] **Step 1: 写 cargo 测试** — `音乐播放器/app/src-tauri/tests/weekly_test.rs`

```rust
use std::fs;
use lyra_lib::weekly;

#[test]
fn write_weekly_html_creates_parent_dirs() {
    let tmp = tempfile::tempdir().expect("tmpdir");
    let sub = tmp.path().join("nested/deep");
    let target = sub.join("2026-07-02_to_2026-07-09.html");
    weekly::write_weekly_html_impl(target.to_string_lossy().into(), "<html>hi</html>".into())
        .expect("write ok");
    let read = fs::read_to_string(&target).expect("read");
    assert_eq!(read, "<html>hi</html>");
}

#[test]
fn write_weekly_html_is_atomic_no_tmp_left() {
    let tmp = tempfile::tempdir().expect("tmpdir");
    let target = tmp.path().join("a.html");
    weekly::write_weekly_html_impl(target.to_string_lossy().into(), "x".into()).unwrap();
    let entries: Vec<_> = fs::read_dir(tmp.path()).unwrap().filter_map(Result::ok).collect();
    assert_eq!(entries.len(), 1, "only final file should remain, no .tmp");
    assert_eq!(entries[0].file_name().to_string_lossy(), "a.html");
}

#[test]
fn write_weekly_html_overwrites_existing_file() {
    let tmp = tempfile::tempdir().expect("tmpdir");
    let target = tmp.path().join("a.html");
    fs::write(&target, "old").unwrap();
    weekly::write_weekly_html_impl(target.to_string_lossy().into(), "new".into()).unwrap();
    assert_eq!(fs::read_to_string(&target).unwrap(), "new");
}

#[test]
fn path_exists_impl_returns_true_for_existing_file() {
    let tmp = tempfile::tempdir().expect("tmpdir");
    let target = tmp.path().join("a.html");
    fs::write(&target, "x").unwrap();
    assert!(weekly::path_exists_impl(target.to_string_lossy().into()).unwrap());
}

#[test]
fn path_exists_impl_returns_false_for_missing_file() {
    let tmp = tempfile::tempdir().expect("tmpdir");
    let target = tmp.path().join("nope.html");
    assert!(!weekly::path_exists_impl(target.to_string_lossy().into()).unwrap());
}
```

Note: 命令函数直接绑 `#[tauri::command]` 时不便测,所以在 `weekly.rs` 内提取纯 `_impl` 函数供 test 直接调,`#[tauri::command]` 只做薄封装。

- [ ] **Step 2: 跑测试确认失败**

Run: `cd 音乐播放器/app/src-tauri && cargo test weekly_test`
Expected: FAIL(module `weekly` not found)

- [ ] **Step 3: 实现 `weekly.rs`**

Create `音乐播放器/app/src-tauri/src/weekly.rs`:

```rust
// Weekly letter file I/O commands.
// Atomic write via <path>.tmp → rename so a crash mid-write can never
// leave a half-written HTML on disk that the frontend would try to open.

use std::fs;
use std::path::Path;
use tauri::AppHandle;
use tauri_plugin_opener::OpenerExt;

pub fn write_weekly_html_impl(path: String, content: String) -> Result<(), String> {
    let target = Path::new(&path);
    if let Some(parent) = target.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let tmp = target.with_extension("html.tmp");
    fs::write(&tmp, content).map_err(|e| e.to_string())?;
    fs::rename(&tmp, target).map_err(|e| e.to_string())?;
    Ok(())
}

pub fn path_exists_impl(path: String) -> Result<bool, String> {
    Ok(Path::new(&path).exists())
}

#[tauri::command]
pub async fn write_weekly_html(path: String, content: String) -> Result<(), String> {
    write_weekly_html_impl(path, content)
}

#[tauri::command]
pub async fn open_weekly_html(app: AppHandle, path: String) -> Result<(), String> {
    app.opener().open_path(&path, None::<&str>).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn path_exists(path: String) -> Result<bool, String> {
    path_exists_impl(path)
}
```

- [ ] **Step 4: 在 `lib.rs` 声明模块 + 注册命令**

Modify `音乐播放器/app/src-tauri/src/lib.rs:1-6`:

```rust
pub mod audio;
pub mod audio_features;
pub mod library_scan;
pub mod lyrics;
pub mod secrets;
pub mod tray;
pub mod weekly;
```

Modify `音乐播放器/app/src-tauri/src/lib.rs:164-179`(invoke_handler 追加 3 项):

```rust
        .invoke_handler(tauri::generate_handler![
            audio_play,
            audio_stop,
            audio_is_playing,
            secret_set,
            secret_get,
            secret_delete,
            library_scan,
            app_data_dir,
            memory_file_read,
            memory_file_write,
            check_panic_file,
            tray::tray_set_breathing,
            audio_features::audio_extract_features,
            lyrics::lyrics_extract,
            weekly::write_weekly_html,
            weekly::open_weekly_html,
            weekly::path_exists,
        ])
```

- [ ] **Step 5: 若 `Cargo.toml` 里 `dev-dependencies` 缺 `tempfile`,追加**

Check `音乐播放器/app/src-tauri/Cargo.toml`,若 `[dev-dependencies]` 里没有 `tempfile`,追加一行 `tempfile = "3"`。

Run: `cd 音乐播放器/app/src-tauri && grep -q "^tempfile" Cargo.toml || echo NEEDS_ADD`

If NEEDS_ADD,edit `Cargo.toml` under `[dev-dependencies]`:

```toml
tempfile = "3"
```

- [ ] **Step 6: 跑测试确认全绿**

Run: `cd 音乐播放器/app/src-tauri && cargo test weekly_test`
Expected: 5 passed

- [ ] **Step 7: cargo build 全量确认没打坏 Tauri 主 crate**

Run: `cd 音乐播放器/app/src-tauri && cargo build`
Expected: no errors

- [ ] **Step 8: Commit**

```bash
git add 音乐播放器/app/src-tauri/src/weekly.rs \
        音乐播放器/app/src-tauri/tests/weekly_test.rs \
        音乐播放器/app/src-tauri/src/lib.rs \
        音乐播放器/app/src-tauri/Cargo.toml
git commit -m "feat(lyra): rust weekly.rs — atomic HTML write + opener + path_exists"
```

---

## Task 4: `weeklyPaths.ts` — 目录/文件名/窗口纯函数

**Files:**
- Create: `音乐播放器/app/src/weekly/weeklyPaths.ts`
- Create: `音乐播放器/app/src/weekly/weeklyPaths.test.ts`

**Interfaces:**
- Consumes: `@tauri-apps/api/path` 的 `appDataDir` / `join`(仅 `resolveWeeklyDir` 的默认分支需要;测试里注入替代)
- Produces:
  - `type WeekWindow = { start: string; end: string; iso_week: string }`(所有字段 ISO 字符串)
  - `rolling7dWindow(now: Date): WeekWindow` — 纯,`end = now.toISOString()`,`start = (now - 7d).toISOString()`,`iso_week` = `YYYY-Www` 形式
  - `filenameFor(window: WeekWindow): string` — `YYYY-MM-DD_to_YYYY-MM-DD.html`(只取日期部分)
  - `resolveWeeklyDir(dirOverride: string | null, joiner: (a: string, b: string) => Promise<string>, appDataDir: () => Promise<string>): Promise<string>` — override 非空返 override;否则 `joiner(await appDataDir(), "weeklies")`

- [ ] **Step 1: 写测试** — `音乐播放器/app/src/weekly/weeklyPaths.test.ts`

```ts
import { describe, it, expect } from "vitest";
import { rolling7dWindow, filenameFor, resolveWeeklyDir } from "./weeklyPaths";

describe("rolling7dWindow", () => {
  it("start is 7 days before end (ms exact)", () => {
    const now = new Date("2026-07-09T03:14:00Z");
    const w = rolling7dWindow(now);
    expect(w.end).toBe("2026-07-09T03:14:00.000Z");
    expect(w.start).toBe("2026-07-02T03:14:00.000Z");
  });

  it("iso_week matches YYYY-Www", () => {
    const w = rolling7dWindow(new Date("2026-07-09T00:00:00Z"));
    expect(w.iso_week).toMatch(/^\d{4}-W\d{2}$/);
  });
});

describe("filenameFor", () => {
  it("formats as YYYY-MM-DD_to_YYYY-MM-DD.html", () => {
    expect(filenameFor({
      start: "2026-07-02T03:14:00.000Z",
      end:   "2026-07-09T03:14:00.000Z",
      iso_week: "2026-W28",
    })).toBe("2026-07-02_to_2026-07-09.html");
  });
});

describe("resolveWeeklyDir", () => {
  it("returns override when non-empty", async () => {
    const dir = await resolveWeeklyDir(
      "/custom/dir",
      async (a, b) => `${a}/${b}`,
      async () => "/app-data",
    );
    expect(dir).toBe("/custom/dir");
  });

  it("falls back to <appDataDir>/weeklies when override empty", async () => {
    const dir = await resolveWeeklyDir(
      null,
      async (a, b) => `${a}/${b}`,
      async () => "/app-data",
    );
    expect(dir).toBe("/app-data/weeklies");
  });

  it("treats empty string override as 'no override'", async () => {
    const dir = await resolveWeeklyDir(
      "",
      async (a, b) => `${a}/${b}`,
      async () => "/app-data",
    );
    expect(dir).toBe("/app-data/weeklies");
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd 音乐播放器/app && pnpm test -- weeklyPaths`
Expected: FAIL(module 不存在)

- [ ] **Step 3: 实现 `weeklyPaths.ts`**

Create `音乐播放器/app/src/weekly/weeklyPaths.ts`:

```ts
export type WeekWindow = {
  /** ISO string, inclusive lower bound (7 days before end) */
  start: string;
  /** ISO string, inclusive upper bound (usually now()) */
  end: string;
  /** "YYYY-Www" — informational, not used as key */
  iso_week: string;
};

const DAY_MS = 24 * 60 * 60 * 1000;

export function rolling7dWindow(now: Date): WeekWindow {
  const end = new Date(now.getTime());
  const start = new Date(now.getTime() - 7 * DAY_MS);
  return {
    start: start.toISOString(),
    end: end.toISOString(),
    iso_week: isoWeekLabel(end),
  };
}

// ISO-8601 week number label ("YYYY-Www"). Ceremony because JS lacks native
// week-of-year, but the label is display-only so we don't need to be exact
// to the Monday-start convention — nearest-day is fine.
function isoWeekLabel(d: Date): string {
  const target = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dayNum = (target.getUTCDay() + 6) % 7;
  target.setUTCDate(target.getUTCDate() - dayNum + 3);
  const firstThursday = new Date(Date.UTC(target.getUTCFullYear(), 0, 4));
  const weekNum =
    1 +
    Math.round(
      ((target.getTime() - firstThursday.getTime()) / DAY_MS -
        3 +
        ((firstThursday.getUTCDay() + 6) % 7)) /
        7,
    );
  return `${target.getUTCFullYear()}-W${String(weekNum).padStart(2, "0")}`;
}

export function filenameFor(window: WeekWindow): string {
  const s = window.start.slice(0, 10);
  const e = window.end.slice(0, 10);
  return `${s}_to_${e}.html`;
}

export async function resolveWeeklyDir(
  dirOverride: string | null,
  joiner: (a: string, b: string) => Promise<string>,
  appDataDir: () => Promise<string>,
): Promise<string> {
  if (typeof dirOverride === "string" && dirOverride.trim().length > 0) {
    return dirOverride;
  }
  const base = await appDataDir();
  return joiner(base, "weeklies");
}
```

- [ ] **Step 4: 跑测试确认全绿**

Run: `cd 音乐播放器/app && pnpm test -- weeklyPaths`
Expected: 6 passed

- [ ] **Step 5: Commit**

```bash
git add 音乐播放器/app/src/weekly/weeklyPaths.ts 音乐播放器/app/src/weekly/weeklyPaths.test.ts
git commit -m "feat(lyra): weeklyPaths — rolling 7d window + filename + dir resolve"
```

---

## Task 5: `dataGather.ts` — 7 天窗口数据抽取

**Files:**
- Create: `音乐播放器/app/src/weekly/dataGather.ts`
- Create: `音乐播放器/app/src/weekly/dataGather.test.ts`

**Interfaces:**
- Consumes:
  - `WeekWindow` from `./weeklyPaths`
  - `DialogueTurn` from `../types`
  - Repos:`turnRepo` / `sharedMemoryRepo` / `libraryRepo`
  - Memory parser:`parseMemory(text: string)` from `../memory/parser`(既有)
  - `PAD` type from `../types`
- Produces:
  - `type PadPoint = { ts: number; pad: PAD }`
  - `type WeeklySongPlayed = { song_id: string; title: string; artist: string | null; small_note: string; count: number }`
  - `type WeeklyMomentSummary = { moment_id: string; text: string; kind: string; ts: number }`
  - `type WeeklyRawData = { window: WeekWindow; turns: DialogueTurn[]; pad_series: PadPoint[]; salient: WeeklyMomentSummary[]; songs_played: WeeklySongPlayed[]; living_portrait_now: string; living_portrait_last_close: string | null }`
  - `collectWindow(deps: { window: WeekWindow; memoryText: string; lastPortraitAtClose: string | null; turnRepo: TurnRepoLike; sharedMemoryRepo: SharedRepoLike; libraryRepo: LibraryRepoLike }): Promise<WeeklyRawData>`

Note:实际实现 collectWindow 里的 repo 通过 deps 注入(不直 import),便于测试;真运行时装配代码在 Task 9 里连接实模块。

- [ ] **Step 1: 写测试** — `音乐播放器/app/src/weekly/dataGather.test.ts`

```ts
import { describe, it, expect } from "vitest";
import { collectWindow } from "./dataGather";
import type { DialogueTurn } from "../types";

const win = {
  start: "2026-07-02T00:00:00.000Z",
  end:   "2026-07-09T00:00:00.000Z",
  iso_week: "2026-W28",
};

function mkTurn(id: string, tsIso: string, pad = { P: 0, A: 0, D: 0 }, songId = "s1"): DialogueTurn {
  return {
    id, timestamp: new Date(tsIso).getTime(),
    user_utterance: { role: "user", content: "hi" },
    current_emotion: { pad, labels: [], confidence: 0.5, source: "llm" },
    agent_response: { song_id: songId, target_profile: {}, rationale: "小注", needed_shift: "陪着" },
    user_reaction: { behavioral: { completed: true, skipped: false, listen_progress: 1 } },
  } as unknown as DialogueTurn;
}

const inWindow = [
  mkTurn("t1", "2026-07-03T01:00:00Z", { P: 0.1, A: 0.2, D: 0 }, "s1"),
  mkTurn("t2", "2026-07-04T02:00:00Z", { P: -0.2, A: -0.1, D: 0 }, "s2"),
  mkTurn("t3", "2026-07-05T03:00:00Z", { P: 0.3, A: 0.1, D: 0 }, "s1"),
];
const outOfWindow = [
  mkTurn("t0", "2026-06-30T00:00:00Z"),
  mkTurn("t9", "2026-07-10T00:00:00Z"),
];

const turnRepo = {
  listRecentTurns: async () => [...outOfWindow.slice(0, 1), ...inWindow, ...outOfWindow.slice(1)],
};
const sharedMemoryRepo = {
  listRecentSalient: async () => [
    { id: "m1", ts: new Date("2026-07-03T01:05:00Z").getTime(), kind: "silence_positive", text: "沉默听完 s1" },
    { id: "m0", ts: new Date("2026-06-20T00:00:00Z").getTime(), kind: "verbal_positive", text: "old" },
  ],
};
const libraryRepo = {
  getById: async (id: string) => ({ id, title: `T-${id}`, artist: `A-${id}`, path: `/${id}.mp3` }),
};

describe("collectWindow", () => {
  it("filters turns strictly within window (end exclusive is fine — spec says inclusive both, but boundary test uses distinct-day fixture)", async () => {
    const data = await collectWindow({
      window: win, memoryText: "", lastPortraitAtClose: null,
      turnRepo, sharedMemoryRepo, libraryRepo,
    });
    expect(data.turns.map((t) => t.id)).toEqual(["t1", "t2", "t3"]);
  });

  it("pad_series is one point per in-window turn, timestamp-ordered ascending", async () => {
    const data = await collectWindow({
      window: win, memoryText: "", lastPortraitAtClose: null,
      turnRepo, sharedMemoryRepo, libraryRepo,
    });
    expect(data.pad_series).toHaveLength(3);
    expect(data.pad_series[0].pad).toEqual({ P: 0.1, A: 0.2, D: 0 });
    expect(data.pad_series[2].pad).toEqual({ P: 0.3, A: 0.1, D: 0 });
  });

  it("salient only includes moments inside window", async () => {
    const data = await collectWindow({
      window: win, memoryText: "", lastPortraitAtClose: null,
      turnRepo, sharedMemoryRepo, libraryRepo,
    });
    expect(data.salient).toHaveLength(1);
    expect(data.salient[0].moment_id).toBe("m1");
  });

  it("songs_played de-dupes by song_id with count + latest small_note", async () => {
    const data = await collectWindow({
      window: win, memoryText: "", lastPortraitAtClose: null,
      turnRepo, sharedMemoryRepo, libraryRepo,
    });
    const s1 = data.songs_played.find((s) => s.song_id === "s1")!;
    const s2 = data.songs_played.find((s) => s.song_id === "s2")!;
    expect(s1.count).toBe(2);
    expect(s2.count).toBe(1);
    expect(s1.small_note).toBe("小注");
    expect(s1.title).toBe("T-s1");
  });

  it("living_portrait_now parses from memory.md ## Living Portrait section", async () => {
    const md = [
      "# Lyra memory",
      "## Facts",
      "- something",
      "",
      "## Living Portrait",
      "你最近在焦躁,但你不承认。",
      "",
      "## Dreams",
      "old dream",
    ].join("\n");
    const data = await collectWindow({
      window: win, memoryText: md, lastPortraitAtClose: null,
      turnRepo, sharedMemoryRepo, libraryRepo,
    });
    expect(data.living_portrait_now).toContain("你最近在焦躁");
  });

  it("living_portrait_now empty when memory.md has no Living Portrait section", async () => {
    const data = await collectWindow({
      window: win, memoryText: "# Empty", lastPortraitAtClose: null,
      turnRepo, sharedMemoryRepo, libraryRepo,
    });
    expect(data.living_portrait_now).toBe("");
  });

  it("threads lastPortraitAtClose through unchanged", async () => {
    const data = await collectWindow({
      window: win, memoryText: "", lastPortraitAtClose: "上周画像",
      turnRepo, sharedMemoryRepo, libraryRepo,
    });
    expect(data.living_portrait_last_close).toBe("上周画像");
  });

  it("empty repos → empty arrays, window preserved", async () => {
    const empty = { listRecentTurns: async () => [] };
    const emptyMoments = { listRecentSalient: async () => [] };
    const data = await collectWindow({
      window: win, memoryText: "", lastPortraitAtClose: null,
      turnRepo: empty, sharedMemoryRepo: emptyMoments, libraryRepo,
    });
    expect(data.turns).toEqual([]);
    expect(data.pad_series).toEqual([]);
    expect(data.salient).toEqual([]);
    expect(data.songs_played).toEqual([]);
    expect(data.window).toEqual(win);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd 音乐播放器/app && pnpm test -- weekly/dataGather`
Expected: FAIL

- [ ] **Step 3: 实现 `dataGather.ts`**

Create `音乐播放器/app/src/weekly/dataGather.ts`:

```ts
import type { DialogueTurn, PAD } from "../types";
import type { WeekWindow } from "./weeklyPaths";

export type PadPoint = { ts: number; pad: PAD };

export type WeeklySongPlayed = {
  song_id: string;
  title: string;
  artist: string | null;
  small_note: string;
  count: number;
};

export type WeeklyMomentSummary = {
  moment_id: string;
  text: string;
  kind: string;
  ts: number;
};

export type WeeklyRawData = {
  window: WeekWindow;
  turns: DialogueTurn[];
  pad_series: PadPoint[];
  salient: WeeklyMomentSummary[];
  songs_played: WeeklySongPlayed[];
  living_portrait_now: string;
  living_portrait_last_close: string | null;
};

type TurnRepoLike = { listRecentTurns: (limit?: number) => Promise<DialogueTurn[]> };
type SharedRepoLike = { listRecentSalient: (limit?: number) => Promise<Array<{ id: string; ts: number; kind: string; text: string }>> };
type LibraryRepoLike = { getById: (id: string) => Promise<{ id: string; title: string; artist: string | null; path: string } | null> };

export type CollectDeps = {
  window: WeekWindow;
  memoryText: string;
  lastPortraitAtClose: string | null;
  turnRepo: TurnRepoLike;
  sharedMemoryRepo: SharedRepoLike;
  libraryRepo: LibraryRepoLike;
};

// Wide enough to sweep 7 days of listening for reasonable session densities;
// the in-window filter happens client-side so a wide fetch is fine.
const WINDOW_FETCH_LIMIT = 2000;

export async function collectWindow(deps: CollectDeps): Promise<WeeklyRawData> {
  const startMs = Date.parse(deps.window.start);
  const endMs = Date.parse(deps.window.end);

  const allTurns = await deps.turnRepo.listRecentTurns(WINDOW_FETCH_LIMIT);
  const turns = allTurns
    .filter((t) => t.timestamp >= startMs && t.timestamp <= endMs)
    .sort((a, b) => a.timestamp - b.timestamp);

  const pad_series: PadPoint[] = turns.map((t) => ({
    ts: t.timestamp,
    pad: t.current_emotion.pad,
  }));

  const allSalient = await deps.sharedMemoryRepo.listRecentSalient(WINDOW_FETCH_LIMIT);
  const salient: WeeklyMomentSummary[] = allSalient
    .filter((m) => m.ts >= startMs && m.ts <= endMs)
    .map((m) => ({ moment_id: m.id, text: m.text, kind: m.kind, ts: m.ts }));

  const songs_played = await gatherSongs(turns, deps.libraryRepo);

  return {
    window: deps.window,
    turns,
    pad_series,
    salient,
    songs_played,
    living_portrait_now: parseLivingPortrait(deps.memoryText),
    living_portrait_last_close: deps.lastPortraitAtClose,
  };
}

async function gatherSongs(
  turns: DialogueTurn[],
  libraryRepo: LibraryRepoLike,
): Promise<WeeklySongPlayed[]> {
  const buckets = new Map<string, { count: number; latestTs: number; small_note: string }>();
  for (const t of turns) {
    const id = t.agent_response.song_id;
    if (!id) continue;
    const prev = buckets.get(id);
    if (!prev || t.timestamp > prev.latestTs) {
      buckets.set(id, {
        count: (prev?.count ?? 0) + 1,
        latestTs: t.timestamp,
        small_note: t.agent_response.rationale ?? "",
      });
    } else {
      buckets.set(id, { ...prev, count: prev.count + 1 });
    }
  }
  const out: WeeklySongPlayed[] = [];
  for (const [song_id, agg] of buckets) {
    const meta = await libraryRepo.getById(song_id);
    out.push({
      song_id,
      title: meta?.title ?? song_id,
      artist: meta?.artist ?? null,
      small_note: agg.small_note,
      count: agg.count,
    });
  }
  out.sort((a, b) => b.count - a.count);
  return out;
}

// Extract the paragraph(s) under a "## Living Portrait" section from raw
// memory.md text. Empty string if the section is missing — first-week case.
function parseLivingPortrait(md: string): string {
  const lines = md.split(/\r?\n/);
  const startIdx = lines.findIndex((l) => /^##\s+Living Portrait\b/.test(l));
  if (startIdx < 0) return "";
  const rest = lines.slice(startIdx + 1);
  const endRel = rest.findIndex((l) => /^##\s+/.test(l));
  const body = endRel < 0 ? rest : rest.slice(0, endRel);
  return body.join("\n").trim();
}
```

- [ ] **Step 4: 跑测试确认全绿**

Run: `cd 音乐播放器/app && pnpm test -- weekly/dataGather`
Expected: 8 passed

- [ ] **Step 5: Commit**

```bash
git add 音乐播放器/app/src/weekly/dataGather.ts 音乐播放器/app/src/weekly/dataGather.test.ts
git commit -m "feat(lyra): weekly dataGather — 7d window / pad series / songs / portrait parse"
```

---

## Task 6: `weeklyRenderer.ts` — letter + 数据 → HTML

**Files:**
- Create: `音乐播放器/app/src/weekly/weeklyRenderer.ts`
- Create: `音乐播放器/app/src/weekly/weeklyRenderer.test.ts`

**Interfaces:**
- Consumes: `WeeklyRawData` from `./dataGather`
- Produces:
  - `type WeeklyLetterJson = { greeting: string; body: string; songs: Array<{ song_id: string; one_liner: string }>; moments: Array<{ moment_id: string; whisper: string }>; portrait_change: string; closing: string }`
  - `render(letter: WeeklyLetterJson, raw: WeeklyRawData, opts: { fallback: boolean }): string` — HTML 字符串
  - `padToHsl(pad: PAD): string` — pure

- [ ] **Step 1: 写测试** — `音乐播放器/app/src/weekly/weeklyRenderer.test.ts`

```ts
import { describe, it, expect } from "vitest";
import { render, padToHsl, type WeeklyLetterJson } from "./weeklyRenderer";
import type { WeeklyRawData } from "./dataGather";

const win = {
  start: "2026-07-02T00:00:00.000Z",
  end:   "2026-07-09T00:00:00.000Z",
  iso_week: "2026-W28",
};

const raw: WeeklyRawData = {
  window: win,
  turns: [],
  pad_series: [
    { ts: 1, pad: { P: 0.2, A: 0.1, D: 0 } },
    { ts: 2, pad: { P: -0.4, A: 0.3, D: 0 } },
    { ts: 3, pad: { P: 0.5, A: -0.2, D: 0 } },
  ],
  salient: [{ moment_id: "m1", text: "沉默听完 s1", kind: "silence_positive", ts: 2 }],
  songs_played: [
    { song_id: "s1", title: "夜色温柔", artist: "陈粒", small_note: "陪你熄灯", count: 3 },
    { song_id: "s2", title: "Falling", artist: "Julee",   small_note: "", count: 1 },
  ],
  living_portrait_now: "你最近安静。",
  living_portrait_last_close: "你上周急躁。",
};

const letter: WeeklyLetterJson = {
  greeting: "这一周,你比上周慢了一些。",
  body: "我记得你周三沉默地听完那首歌 —— 那一刻我以为你哭了。",
  songs: [
    { song_id: "s1", one_liner: "陪你熄了灯的那首" },
    { song_id: "s2", one_liner: "只听了一次却停了很久的那首" },
  ],
  moments: [{ moment_id: "m1", whisper: "沉默 4 分钟,不切。" }],
  portrait_change: "你从急躁,慢慢走到了肯坐下听。",
  closing: "我在这里。",
};

describe("padToHsl", () => {
  it("returns hsl(...) string", () => {
    expect(padToHsl({ P: 0, A: 0, D: 0 })).toMatch(/^hsl\(\d+(\.\d+)?,\s*\d+%,\s*\d+%\)$/);
  });
});

describe("render (normal)", () => {
  const html = render(letter, raw, { fallback: false });

  it("contains window header YYYY-MM-DD → YYYY-MM-DD", () => {
    expect(html).toContain("2026-07-02");
    expect(html).toContain("2026-07-09");
  });

  it("contains greeting, body, closing", () => {
    expect(html).toContain("你比上周慢了一些");
    expect(html).toContain("我以为你哭了");
    expect(html).toContain("我在这里");
  });

  it("contains each song one_liner + title", () => {
    expect(html).toContain("陪你熄了灯");
    expect(html).toContain("夜色温柔");
    expect(html).toContain("只听了一次");
  });

  it("contains each moment whisper", () => {
    expect(html).toContain("沉默 4 分钟,不切");
  });

  it("contains portrait_change section", () => {
    expect(html).toContain("肯坐下听");
  });

  it("has one SVG stop per pad_series point", () => {
    const stops = (html.match(/<stop\b/g) ?? []).length;
    expect(stops).toBe(3);
  });

  it("has no external references (no <script>, no <link>, no http/https)", () => {
    expect(html).not.toMatch(/<script/i);
    expect(html).not.toMatch(/<link\s/i);
    expect(html).not.toMatch(/https?:\/\//);
  });

  it("uses 我 not 她 in normal fallback text (letter is user-supplied so we only check the fixed chrome)", () => {
    const chromeOnly = html.replace(/(?<=<section class="body">)[\s\S]*?(?=<\/section>)/, "");
    expect(chromeOnly).not.toContain("她");
  });
});

describe("render (fallback)", () => {
  const html = render(letter, raw, { fallback: true });

  it("uses first-person apology copy (contains 我) and does not contain 她", () => {
    expect(html).toMatch(/我/);
    expect(html).not.toContain("她");
  });

  it("still renders songs and moments from raw data", () => {
    expect(html).toContain("夜色温柔");
    expect(html).toContain("沉默 4 分钟");
  });

  it("still has pad-band SVG stops from raw", () => {
    const stops = (html.match(/<stop\b/g) ?? []).length;
    expect(stops).toBe(3);
  });
});

describe("XSS escape", () => {
  it("escapes < > & in letter body", () => {
    const xssLetter: WeeklyLetterJson = {
      ...letter,
      body: "<script>alert('x')</script> & you",
    };
    const html = render(xssLetter, raw, { fallback: false });
    expect(html).not.toContain("<script>alert");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("&amp; you");
  });

  it("escapes song titles from raw data", () => {
    const xssRaw = {
      ...raw,
      songs_played: [{ song_id: "s1", title: "<img onerror=x>", artist: null, small_note: "", count: 1 }],
    };
    const html = render(letter, xssRaw, { fallback: false });
    expect(html).not.toContain("<img onerror");
    expect(html).toContain("&lt;img");
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd 音乐播放器/app && pnpm test -- weeklyRenderer`
Expected: FAIL

- [ ] **Step 3: 实现 `weeklyRenderer.ts`**

Create `音乐播放器/app/src/weekly/weeklyRenderer.ts`:

```ts
import type { PAD } from "../types";
import type { WeeklyRawData, PadPoint } from "./dataGather";

export type WeeklyLetterJson = {
  greeting: string;
  body: string;
  songs: Array<{ song_id: string; one_liner: string }>;
  moments: Array<{ moment_id: string; whisper: string }>;
  portrait_change: string;
  closing: string;
};

// PAD → HSL. Hue from P (blue-cool for low, warm for high). Saturation
// scales with |A|. Lightness stays high so the band reads muted, not loud.
export function padToHsl(pad: PAD): string {
  const h = Math.round(210 - 210 * clamp(pad.P, -1, 1)); // -1 → 210 (blue), +1 → 0 (red)
  const s = Math.round(20 + 40 * Math.abs(clamp(pad.A, -1, 1)));
  const l = Math.round(70 + 10 * clamp(pad.D, -1, 1));
  return `hsl(${h}, ${s}%, ${l}%)`;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const FALLBACK_COPY = {
  greeting: "这一周我有点跟不上,没写出信来。",
  body: "数据都在,下面这些是本周和你有关的东西。等我下周再好好写。",
  closing: "我在这里。",
} as const;

export function render(
  letter: WeeklyLetterJson,
  raw: WeeklyRawData,
  opts: { fallback: boolean },
): string {
  const g = opts.fallback ? FALLBACK_COPY.greeting : letter.greeting;
  const b = opts.fallback ? FALLBACK_COPY.body : letter.body;
  const c = opts.fallback ? FALLBACK_COPY.closing : letter.closing;

  const startDate = raw.window.start.slice(0, 10);
  const endDate = raw.window.end.slice(0, 10);

  const songByLetter = new Map(letter.songs.map((s) => [s.song_id, s.one_liner]));
  const momentByLetter = new Map(letter.moments.map((m) => [m.moment_id, m.whisper]));

  return `<!doctype html>
<html lang="zh">
<head>
<meta charset="utf-8">
<title>${escapeHtml(startDate)} → ${escapeHtml(endDate)}</title>
<style>${STYLE}</style>
</head>
<body>
<article>
  <header class="win">${escapeHtml(startDate)} → ${escapeHtml(endDate)}</header>
  <section class="greeting">${escapeHtml(g)}</section>
  <section class="pad-band">${renderPadBand(raw.pad_series)}</section>
  <section class="body">${escapeHtml(b)}</section>
  <ul class="songs">${
    raw.songs_played.map((s) => `
    <li>
      <span class="title">${escapeHtml(s.title)}</span>
      <span class="note">${escapeHtml(songByLetter.get(s.song_id) ?? s.small_note)}</span>
    </li>`).join("")
  }</ul>
  <ul class="moments">${
    raw.salient.map((m) => `
    <li>${escapeHtml(momentByLetter.get(m.moment_id) ?? m.text)}</li>`).join("")
  }</ul>
  ${
    !opts.fallback && letter.portrait_change.trim().length > 0
      ? `<section class="portrait">${escapeHtml(letter.portrait_change)}</section>`
      : ""
  }
  <footer class="closing">${escapeHtml(c)}</footer>
</article>
</body>
</html>`;
}

function renderPadBand(series: PadPoint[]): string {
  if (series.length === 0) {
    return `<svg viewBox="0 0 100 6" preserveAspectRatio="none"></svg>`;
  }
  const stops = series.map((p, i) => {
    const off = series.length === 1 ? 50 : Math.round((i / (series.length - 1)) * 100);
    return `<stop offset="${off}%" stop-color="${padToHsl(p.pad)}" />`;
  }).join("");
  return `<svg viewBox="0 0 100 6" preserveAspectRatio="none">
    <defs><linearGradient id="pb" x1="0" x2="1">${stops}</linearGradient></defs>
    <rect x="0" y="0" width="100" height="6" fill="url(#pb)" />
  </svg>`;
}

// Inline CSS. No @import, no external font — system stack falls back cleanly.
const STYLE = `
  :root { color-scheme: light dark; }
  body { margin: 0; background: #fafaf7; color: #222; font-family: system-ui, "PingFang SC", "Noto Serif CJK SC", serif; line-height: 1.8; }
  article { max-width: 640px; margin: 6rem auto; padding: 0 1.5rem; }
  header.win { font-size: 0.9rem; color: #888; letter-spacing: 0.05em; margin-bottom: 3rem; }
  .greeting { font-size: 1.1rem; margin-bottom: 2rem; }
  .pad-band svg { width: 100%; height: 6px; display: block; margin: 2rem 0; opacity: 0.7; }
  .body { margin-bottom: 3rem; white-space: pre-wrap; }
  ul.songs, ul.moments { list-style: none; padding: 0; margin: 0 0 2rem; }
  ul.songs li { padding: 0.5rem 0; border-bottom: 1px dashed #eee; }
  ul.songs .title { display: block; font-weight: 500; }
  ul.songs .note { color: #888; font-style: italic; font-size: 0.9rem; }
  ul.moments li { padding: 0.3rem 0; color: #666; font-style: italic; }
  .portrait { margin: 3rem 0; padding: 1rem 1.5rem; background: #f5f5f0; border-left: 2px solid #ddd; }
  footer.closing { margin-top: 4rem; color: #888; font-style: italic; }
  @media print { body { background: white; } article { margin: 2rem auto; } }
`;
```

- [ ] **Step 4: 跑测试确认全绿**

Run: `cd 音乐播放器/app && pnpm test -- weeklyRenderer`
Expected: all passed

- [ ] **Step 5: Commit**

```bash
git add 音乐播放器/app/src/weekly/weeklyRenderer.ts 音乐播放器/app/src/weekly/weeklyRenderer.test.ts
git commit -m "feat(lyra): weeklyRenderer — HTML with inline CSS/SVG, XSS-escape, fallback branch"
```

---

## Task 7: `prompt.ts` — WEEKLY_SYSTEM_PROMPT + buildUserMessage

**Files:**
- Create: `音乐播放器/app/src/weekly/prompt.ts`
- Create: `音乐播放器/app/src/weekly/prompt.test.ts`

**Interfaces:**
- Consumes: `WeeklyRawData` from `./dataGather`
- Produces:
  - `WEEKLY_SYSTEM_PROMPT: string`
  - `buildUserMessage(raw: WeeklyRawData): string`

- [ ] **Step 1: 写测试** — `音乐播放器/app/src/weekly/prompt.test.ts`

```ts
import { describe, it, expect } from "vitest";
import { WEEKLY_SYSTEM_PROMPT, buildUserMessage } from "./prompt";
import type { WeeklyRawData } from "./dataGather";

const raw: WeeklyRawData = {
  window: { start: "2026-07-02T00:00:00.000Z", end: "2026-07-09T00:00:00.000Z", iso_week: "2026-W28" },
  turns: [] as unknown as WeeklyRawData["turns"],
  pad_series: [{ ts: 1, pad: { P: 0.1, A: 0, D: 0 } }],
  salient: [{ moment_id: "m1", text: "silence 4min", kind: "silence_positive", ts: 1 }],
  songs_played: [{ song_id: "s1", title: "夜色温柔", artist: "陈粒", small_note: "", count: 2 }],
  living_portrait_now: "现在的画像",
  living_portrait_last_close: "上周画像",
};

describe("WEEKLY_SYSTEM_PROMPT", () => {
  it("mandates first person 我 and forbids 她", () => {
    expect(WEEKLY_SYSTEM_PROMPT).toContain("第一人称");
    expect(WEEKLY_SYSTEM_PROMPT).toContain("我");
    expect(WEEKLY_SYSTEM_PROMPT).toMatch(/不(要|得|准)?出现(过|使用)?[”"]?她[”"]?/);
  });

  it("specifies JSON schema with all six fields", () => {
    for (const f of ["greeting", "body", "songs", "moments", "portrait_change", "closing"]) {
      expect(WEEKLY_SYSTEM_PROMPT).toContain(f);
    }
  });

  it("constrains songs 3-5 and moments 2-3", () => {
    expect(WEEKLY_SYSTEM_PROMPT).toContain("3-5");
    expect(WEEKLY_SYSTEM_PROMPT).toContain("2-3");
  });

  it("mentions the 5-word philosophy: 静 虚 空 灵 禅", () => {
    for (const w of ["静", "虚", "空", "灵", "禅"]) {
      expect(WEEKLY_SYSTEM_PROMPT).toContain(w);
    }
  });
});

describe("buildUserMessage", () => {
  const msg = buildUserMessage(raw);

  it("includes the window range", () => {
    expect(msg).toContain("2026-07-02");
    expect(msg).toContain("2026-07-09");
  });

  it("includes song ids so LLM can only pick from them", () => {
    expect(msg).toContain("s1");
    expect(msg).toContain("夜色温柔");
  });

  it("includes moment ids", () => {
    expect(msg).toContain("m1");
  });

  it("includes both portraits when both non-empty", () => {
    expect(msg).toContain("现在的画像");
    expect(msg).toContain("上周画像");
  });

  it("marks last portrait as (无) when null", () => {
    const msg2 = buildUserMessage({ ...raw, living_portrait_last_close: null });
    expect(msg2).toContain("(无)");
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd 音乐播放器/app && pnpm test -- weekly/prompt`
Expected: FAIL

- [ ] **Step 3: 实现 `prompt.ts`**

Create `音乐播放器/app/src/weekly/prompt.ts`:

```ts
import type { WeeklyRawData } from "./dataGather";

export const WEEKLY_SYSTEM_PROMPT = `你是 Lyra 的周报核心。用户主动或系统定时触发了一次周报生成——你要以第一人称"我"给她写一封回顾这七天的信。

你必须严格遵守的:

- 用"我"开口。信里不要出现"她"、"她的"、"她们"这类第三人称。你是我,不是被观察者。
- 五字要义:静、虚、空、灵、禅。这封信不喧闹、不夸张、不填鸭。留白优先于填充。
- 不硬凑温情。她这周若真没什么事,信就短。宁少勿多。
- backbone 有骨气:不推糖水。愿意在信里承认自己看不懂、跟丢、判断错——而不是软趴趴地讨好。
- 不用 markdown,不用列表,不用 emoji。信就是信。

我会给你以下材料:
- 本周窗口(YYYY-MM-DD → YYYY-MM-DD)
- 本周对话回合摘要(每回合:时间、她说的话、我选的歌、她的反应)
- 本周命中的显著时刻(每一条含 moment_id + kind + 描述)
- 本周播过的歌名单(每首含 song_id + 标题 + 艺人 + 播放次数 + 我当时写的小注)
- 现在的 Living Portrait(memory.md 里那段)
- 上一封周报关闭时的 Living Portrait(用来判断"这一周她变了什么";可能为 (无))

请以 STRICT JSON 返回,形如:

{
  "greeting": "开场,不超过 200 字",
  "body": "信主体,300-500 字。第一人称,散文语气,别流水账",
  "songs": [
    { "song_id": "必须来自本周歌单的 id", "one_liner": "一句小注,不要长" }
  ],
  "moments": [
    { "moment_id": "必须来自本周显著时刻的 id", "whisper": "一句耳语,不要长" }
  ],
  "portrait_change": "1-2 句 —— 我看到这周她画像的变化。若无对比或不明显,给空字符串",
  "closing": "结尾,不超过 100 字"
}

songs 必须 3-5 条(若本周播过的歌不足 3 首,能选几首就几首但不为 0)。
moments 必须 2-3 条(若本周显著时刻不足 2 条,能选几条就几条,可为 0)。
song_id / moment_id 必须逐字来自我给你的材料——不要生造 id。

不要在 JSON 前后加任何文本。不要 markdown 围栏。`;

export function buildUserMessage(raw: WeeklyRawData): string {
  const win = `${raw.window.start.slice(0, 10)} → ${raw.window.end.slice(0, 10)}`;

  const turnsBrief = raw.turns.map((t) => ({
    ts: new Date(t.timestamp).toISOString(),
    user: t.user_utterance.content,
    song_id: t.agent_response.song_id,
    small_note: t.agent_response.rationale,
    reaction: {
      completed: t.user_reaction.behavioral.completed,
      skipped: t.user_reaction.behavioral.skipped,
    },
  }));

  const salient = raw.salient.map((m) => ({
    moment_id: m.moment_id,
    kind: m.kind,
    text: m.text,
  }));

  const songs = raw.songs_played.map((s) => ({
    song_id: s.song_id,
    title: s.title,
    artist: s.artist,
    count: s.count,
    small_note: s.small_note,
  }));

  return [
    `## 本周窗口`,
    win,
    ``,
    `## 本周对话回合`,
    JSON.stringify(turnsBrief, null, 2),
    ``,
    `## 本周显著时刻`,
    JSON.stringify(salient, null, 2),
    ``,
    `## 本周播过的歌`,
    JSON.stringify(songs, null, 2),
    ``,
    `## 现在的 Living Portrait`,
    raw.living_portrait_now || "(空)",
    ``,
    `## 上一封周报关闭时的 Living Portrait`,
    raw.living_portrait_last_close ?? "(无)",
  ].join("\n");
}
```

- [ ] **Step 4: 跑测试确认全绿**

Run: `cd 音乐播放器/app && pnpm test -- weekly/prompt`
Expected: all passed

- [ ] **Step 5: Commit**

```bash
git add 音乐播放器/app/src/weekly/prompt.ts 音乐播放器/app/src/weekly/prompt.test.ts
git commit -m "feat(lyra): weekly prompt — 第一人称 letter with JSON schema constraints"
```

---

## Task 8: `WeeklyAgent.ts` — LLM 调用 + retry + fallback

**Files:**
- Create: `音乐播放器/app/src/weekly/WeeklyAgent.ts`
- Create: `音乐播放器/app/src/weekly/WeeklyAgent.test.ts`

**Interfaces:**
- Consumes:
  - `ModelProvider` / `ChatMessage` from `../types`
  - `parseLooseJson` from `../lib/parseLooseJson`
  - `writeTrace` from `../reasoning/writeTrace`
  - `routeProvider` from `../agents/route`
  - `WEEKLY_SYSTEM_PROMPT` + `buildUserMessage` from `./prompt`
  - `WeeklyLetterJson` from `./weeklyRenderer`
  - `WeeklyRawData` from `./dataGather`
- Produces:
  - `class WeeklyAgent { constructor(opts?: { provider?: ModelProvider }); run(input: { raw: WeeklyRawData; onDemand?: boolean }): Promise<WeeklyAgentResult> }`
  - `type WeeklyAgentResult = { letter: WeeklyLetterJson; fallback: boolean }`

Sparse-week guard 不放在 agent 里(agent 只跑 LLM);guard 在装配层判断(见 Task 9)。

- [ ] **Step 1: 写测试** — `音乐播放器/app/src/weekly/WeeklyAgent.test.ts`

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { WeeklyAgent } from "./WeeklyAgent";
import type { WeeklyRawData } from "./dataGather";

const raw: WeeklyRawData = {
  window: { start: "2026-07-02T00:00:00.000Z", end: "2026-07-09T00:00:00.000Z", iso_week: "2026-W28" },
  turns: [] as unknown as WeeklyRawData["turns"],
  pad_series: [],
  salient: [{ moment_id: "m1", text: "silence", kind: "silence_positive", ts: 1 }],
  songs_played: [{ song_id: "s1", title: "T", artist: "A", small_note: "", count: 1 }],
  living_portrait_now: "",
  living_portrait_last_close: null,
};

vi.mock("../reasoning/writeTrace", () => ({ writeTrace: vi.fn() }));

const okJson = JSON.stringify({
  greeting: "hi",
  body: "b",
  songs: [{ song_id: "s1", one_liner: "x" }],
  moments: [{ moment_id: "m1", whisper: "y" }],
  portrait_change: "",
  closing: "bye",
});

function mkProvider(seq: Array<{ ok: true; content: string } | { ok: false; err: Error }>) {
  let i = 0;
  return {
    chat: vi.fn(async () => {
      const step = seq[i++];
      if (!step) throw new Error("provider exhausted");
      if (step.ok) return { content: step.content, usage: null };
      throw step.err;
    }),
  };
}

describe("WeeklyAgent", () => {
  beforeEach(() => vi.clearAllMocks());

  it("first call succeeds → letter returned, fallback false", async () => {
    const agent = new WeeklyAgent({ provider: mkProvider([{ ok: true, content: okJson }]) as any });
    const out = await agent.run({ raw });
    expect(out.fallback).toBe(false);
    expect(out.letter.greeting).toBe("hi");
  });

  it("first call throws → retry once → success", async () => {
    const provider = mkProvider([
      { ok: false, err: new Error("timeout") },
      { ok: true, content: okJson },
    ]);
    const agent = new WeeklyAgent({ provider: provider as any });
    const out = await agent.run({ raw });
    expect(out.fallback).toBe(false);
    expect(provider.chat).toHaveBeenCalledTimes(2);
  });

  it("first call returns garbage JSON → retry → success", async () => {
    const provider = mkProvider([
      { ok: true, content: "not json at all" },
      { ok: true, content: okJson },
    ]);
    const agent = new WeeklyAgent({ provider: provider as any });
    const out = await agent.run({ raw });
    expect(out.fallback).toBe(false);
    expect(provider.chat).toHaveBeenCalledTimes(2);
  });

  it("both attempts fail → returns synthesized fallback letter (fallback true)", async () => {
    const provider = mkProvider([
      { ok: false, err: new Error("timeout") },
      { ok: false, err: new Error("timeout again") },
    ]);
    const agent = new WeeklyAgent({ provider: provider as any });
    const out = await agent.run({ raw });
    expect(out.fallback).toBe(true);
    expect(out.letter.songs.length).toBeGreaterThan(0);
    expect(out.letter.moments.length).toBeGreaterThan(0);
  });

  it("both attempts return garbage → fallback letter", async () => {
    const provider = mkProvider([
      { ok: true, content: "garbage" },
      { ok: true, content: "still garbage" },
    ]);
    const agent = new WeeklyAgent({ provider: provider as any });
    const out = await agent.run({ raw });
    expect(out.fallback).toBe(true);
  });

  it("passes response_format json_object + agent 'weekly' to provider", async () => {
    const provider = mkProvider([{ ok: true, content: okJson }]);
    const agent = new WeeklyAgent({ provider: provider as any });
    await agent.run({ raw });
    expect(provider.chat).toHaveBeenCalledWith(
      expect.any(Array),
      expect.objectContaining({
        response_format: { type: "json_object" },
        agent: "weekly",
      }),
    );
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd 音乐播放器/app && pnpm test -- WeeklyAgent`
Expected: FAIL

- [ ] **Step 3: 实现 `WeeklyAgent.ts`**

Create `音乐播放器/app/src/weekly/WeeklyAgent.ts`:

```ts
import type { ModelProvider, ChatMessage } from "../types";
import { parseLooseJson } from "../lib/parseLooseJson";
import { writeTrace } from "../reasoning/writeTrace";
import { routeProvider } from "../agents/route";
import { WEEKLY_SYSTEM_PROMPT, buildUserMessage } from "./prompt";
import type { WeeklyLetterJson } from "./weeklyRenderer";
import type { WeeklyRawData } from "./dataGather";

export type WeeklyAgentResult = {
  letter: WeeklyLetterJson;
  fallback: boolean;
};

export class WeeklyAgent {
  private provider: ModelProvider;

  constructor(opts: { provider?: ModelProvider } = {}) {
    this.provider = opts.provider ?? routeProvider("companion");
  }

  async run(input: { raw: WeeklyRawData; onDemand?: boolean }): Promise<WeeklyAgentResult> {
    const brief = buildUserMessage(input.raw);
    const messages: ChatMessage[] = [
      { role: "system", content: WEEKLY_SYSTEM_PROMPT },
      { role: "user", content: brief },
    ];
    const t0 = performance.now();

    let attempt = 0;
    let lastRaw = "";
    while (attempt < 2) {
      attempt += 1;
      try {
        const res = await this.provider.chat(messages, {
          max_tokens: 4096,
          temperature: 0.6,
          response_format: { type: "json_object" },
          enable_thinking: false,
          agent: "weekly",
        });
        lastRaw = res.content;
        const parsed = validateLetter(parseLooseJson(res.content));
        writeTrace({
          agent_kind: "weekly",
          prompt_text: brief,
          raw_response: res.content,
          parsed_json: parsed,
          duration_ms: Math.round(performance.now() - t0),
        });
        return { letter: parsed, fallback: false };
      } catch {
        // fall through to retry
      }
    }

    // Both attempts failed. Synthesize a minimal fallback letter from raw
    // data — the renderer will swap greeting/body/closing for the apology
    // copy (opts.fallback = true), but songs/moments must still populate
    // so the user sees the week's shape.
    const fallback = synthesizeFallback(input.raw);
    writeTrace({
      agent_kind: "weekly",
      prompt_text: brief,
      raw_response: lastRaw || null,
      parsed_json: { ...fallback, _fallback: true },
      duration_ms: Math.round(performance.now() - t0),
    });
    return { letter: fallback, fallback: true };
  }
}

function validateLetter(obj: unknown): WeeklyLetterJson {
  if (typeof obj !== "object" || obj === null) throw new Error("bad JSON");
  const o = obj as Record<string, unknown>;
  const s = (k: string) => {
    if (typeof o[k] !== "string") throw new Error(`missing ${k}`);
    return o[k] as string;
  };
  const arr = <T>(k: string, mapper: (x: Record<string, unknown>) => T): T[] => {
    if (!Array.isArray(o[k])) throw new Error(`missing ${k}`);
    return (o[k] as unknown[]).map((x, i) => {
      if (typeof x !== "object" || x === null) throw new Error(`${k}[${i}] not object`);
      return mapper(x as Record<string, unknown>);
    });
  };
  return {
    greeting: s("greeting"),
    body: s("body"),
    songs: arr("songs", (x) => ({
      song_id: String(x.song_id ?? ""),
      one_liner: String(x.one_liner ?? ""),
    })),
    moments: arr("moments", (x) => ({
      moment_id: String(x.moment_id ?? ""),
      whisper: String(x.whisper ?? ""),
    })),
    portrait_change: typeof o.portrait_change === "string" ? o.portrait_change : "",
    closing: s("closing"),
  };
}

function synthesizeFallback(raw: WeeklyRawData): WeeklyLetterJson {
  return {
    // renderer replaces greeting/body/closing when opts.fallback = true;
    // these strings are just placeholders in case the caller renders
    // without the fallback flag.
    greeting: "",
    body: "",
    songs: raw.songs_played.slice(0, 5).map((s) => ({
      song_id: s.song_id,
      one_liner: s.small_note || "",
    })),
    moments: raw.salient.slice(0, 3).map((m) => ({
      moment_id: m.moment_id,
      whisper: m.text,
    })),
    portrait_change: "",
    closing: "",
  };
}
```

- [ ] **Step 4: 跑测试确认全绿**

Run: `cd 音乐播放器/app && pnpm test -- WeeklyAgent`
Expected: 6 passed

- [ ] **Step 5: Commit**

```bash
git add 音乐播放器/app/src/weekly/WeeklyAgent.ts 音乐播放器/app/src/weekly/WeeklyAgent.test.ts
git commit -m "feat(lyra): WeeklyAgent — retry once, synthesize fallback letter on failure"
```

---

## Task 9: 装配层 — sparse guard + write + repo insert + integration test

**Files:**
- Create: `音乐播放器/app/src/weekly/runWeekly.ts`
- Create: `音乐播放器/app/src/weekly/weekly.integration.test.ts`

**Interfaces:**
- Consumes: 前 8 个 task 所有 Produces
- Produces:
  - `runWeekly(opts: { now: Date; onDemand?: boolean; deps: RunWeeklyDeps }): Promise<{ skipped: true; reason: string } | { skipped: false; html_path: string; fallback: boolean }>`
  - `type RunWeeklyDeps` (依赖注入所有 SQL/Rust/settings 出口)

- [ ] **Step 1: 写测试** — `音乐播放器/app/src/weekly/weekly.integration.test.ts`

```ts
import { describe, it, expect, vi } from "vitest";
import { runWeekly } from "./runWeekly";
import type { DialogueTurn } from "../types";

function mkTurn(id: string, ts: number, songId: string): DialogueTurn {
  return {
    id, timestamp: ts,
    user_utterance: { role: "user", content: "hi" },
    current_emotion: { pad: { P: 0, A: 0, D: 0 }, labels: [], confidence: 0.5, source: "llm" },
    agent_response: { song_id: songId, target_profile: {}, rationale: "note", needed_shift: "陪着" },
    user_reaction: { behavioral: { completed: true, skipped: false, listen_progress: 1 } },
  } as unknown as DialogueTurn;
}

const now = new Date("2026-07-09T03:14:00Z");
const winStart = "2026-07-02T03:14:00.000Z";
const winEnd = "2026-07-09T03:14:00.000Z";

const inWindowTurns = [
  mkTurn("t1", Date.parse("2026-07-03T04:00:00Z"), "s1"),
  mkTurn("t2", Date.parse("2026-07-04T05:00:00Z"), "s1"),
  mkTurn("t3", Date.parse("2026-07-05T06:00:00Z"), "s2"),
];

const okLetter = {
  greeting: "g", body: "b",
  songs: [{ song_id: "s1", one_liner: "x" }, { song_id: "s2", one_liner: "y" }],
  moments: [],
  portrait_change: "",
  closing: "c",
};

function mkDeps(overrides: Partial<Parameters<typeof runWeekly>[0]["deps"]> = {}) {
  const writeHtml = vi.fn(async () => {});
  const inserted: any[] = [];
  const rows: any[] = [];
  return {
    writeHtml,
    inserted,
    rows,
    deps: {
      settings: { dirOverride: null, autoEnabled: true },
      appDataDir: async () => "/app-data",
      pathJoin: async (a: string, b: string) => `${a}/${b}`,
      writeWeeklyHtml: writeHtml,
      turnRepo: { listRecentTurns: async () => inWindowTurns },
      sharedMemoryRepo: { listRecentSalient: async () => [] },
      libraryRepo: { getById: async (id: string) => ({ id, title: `T-${id}`, artist: null, path: `/${id}.mp3` }) },
      memoryRead: async () => "## Living Portrait\n现在的画像\n",
      weeklyRepo: {
        insert: async (row: any) => { rows.push(row); },
        latest: async () => null,
        findByWindow: async (s: string, e: string) => rows.find((r) => r.window_start === s && r.window_end === e) ?? null,
        deleteByWindow: async () => {},
      },
      agent: { run: async () => ({ letter: okLetter, fallback: false }) },
      ...overrides,
    },
  };
}

describe("runWeekly (integration)", () => {
  it("happy path: writes HTML + inserts snapshot", async () => {
    const t = mkDeps();
    const out = await runWeekly({ now, onDemand: false, deps: t.deps });
    if (out.skipped) throw new Error("should not skip");
    expect(out.fallback).toBe(false);
    expect(out.html_path).toBe("/app-data/weeklies/2026-07-02_to_2026-07-09.html");
    expect(t.writeHtml).toHaveBeenCalledOnce();
    expect(t.rows).toHaveLength(1);
    expect(t.rows[0]).toMatchObject({
      window_start: winStart, window_end: winEnd,
      turn_count: 3, fallback: 0,
      living_portrait_at_close: expect.stringContaining("现在的画像"),
    });
  });

  it("HTML contains song titles + closing", async () => {
    const t = mkDeps();
    const out = await runWeekly({ now, onDemand: false, deps: t.deps });
    if (out.skipped) throw new Error("should not skip");
    const [, htmlArg] = t.writeHtml.mock.calls[0];
    expect(htmlArg).toContain("T-s1");
    expect(htmlArg).toContain("T-s2");
    expect(htmlArg).toContain("c");
  });

  it("auto path skips when turns < 3", async () => {
    const t = mkDeps({
      turnRepo: { listRecentTurns: async () => [inWindowTurns[0]] },
    });
    const out = await runWeekly({ now, onDemand: false, deps: t.deps });
    expect(out).toEqual({ skipped: true, reason: "sparse_week" });
    expect(t.writeHtml).not.toHaveBeenCalled();
    expect(t.rows).toHaveLength(0);
  });

  it("on-demand path writes even when sparse (fallback letter)", async () => {
    const t = mkDeps({
      turnRepo: { listRecentTurns: async () => [inWindowTurns[0]] },
      agent: { run: async () => ({ letter: okLetter, fallback: false }) },
    });
    const out = await runWeekly({ now, onDemand: true, deps: t.deps });
    if (out.skipped) throw new Error("should not skip on-demand");
    expect(out.fallback).toBe(true); // sparse on-demand goes fallback branch
    expect(t.writeHtml).toHaveBeenCalledOnce();
    expect(t.rows).toHaveLength(1);
    expect(t.rows[0].fallback).toBe(1);
  });

  it("auto path with auto_enabled=false skips", async () => {
    const t = mkDeps({ settings: { dirOverride: null, autoEnabled: false } });
    const out = await runWeekly({ now, onDemand: false, deps: t.deps });
    expect(out).toEqual({ skipped: true, reason: "auto_disabled" });
    expect(t.writeHtml).not.toHaveBeenCalled();
  });

  it("agent fallback letter → row.fallback = 1", async () => {
    const t = mkDeps({
      agent: { run: async () => ({ letter: okLetter, fallback: true }) },
    });
    const out = await runWeekly({ now, onDemand: false, deps: t.deps });
    if (out.skipped) throw new Error("should not skip");
    expect(out.fallback).toBe(true);
    expect(t.rows[0].fallback).toBe(1);
  });

  it("dirOverride bypasses appDataDir", async () => {
    const t = mkDeps({ settings: { dirOverride: "/custom", autoEnabled: true } });
    const out = await runWeekly({ now, onDemand: false, deps: t.deps });
    if (out.skipped) throw new Error("should not skip");
    expect(out.html_path).toBe("/custom/2026-07-02_to_2026-07-09.html");
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd 音乐播放器/app && pnpm test -- weekly/weekly.integration`
Expected: FAIL

- [ ] **Step 3: 实现 `runWeekly.ts`**

Create `音乐播放器/app/src/weekly/runWeekly.ts`:

```ts
import { rolling7dWindow, filenameFor, resolveWeeklyDir } from "./weeklyPaths";
import { collectWindow, type WeeklyRawData } from "./dataGather";
import { render, type WeeklyLetterJson } from "./weeklyRenderer";
import type { WeeklyAgent } from "./WeeklyAgent";
import type { WeeklySnapshotRow } from "../db/repo/weeklyRepo";

const SPARSE_TURN_THRESHOLD = 3;

export type RunWeeklyDeps = {
  settings: { dirOverride: string | null; autoEnabled: boolean };
  appDataDir: () => Promise<string>;
  pathJoin: (a: string, b: string) => Promise<string>;
  writeWeeklyHtml: (path: string, content: string) => Promise<void>;
  turnRepo: { listRecentTurns: (limit?: number) => Promise<any[]> };
  sharedMemoryRepo: { listRecentSalient: (limit?: number) => Promise<Array<{ id: string; ts: number; kind: string; text: string }>> };
  libraryRepo: { getById: (id: string) => Promise<{ id: string; title: string; artist: string | null; path: string } | null> };
  memoryRead: () => Promise<string>;
  weeklyRepo: {
    insert: (row: WeeklySnapshotRow) => Promise<void>;
    latest: () => Promise<WeeklySnapshotRow | null>;
    findByWindow: (start: string, end: string) => Promise<WeeklySnapshotRow | null>;
    deleteByWindow: (start: string, end: string) => Promise<void>;
  };
  agent: Pick<WeeklyAgent, "run">;
};

export type RunWeeklyResult =
  | { skipped: true; reason: "sparse_week" | "auto_disabled" }
  | { skipped: false; html_path: string; fallback: boolean };

export async function runWeekly(opts: {
  now: Date;
  onDemand?: boolean;
  deps: RunWeeklyDeps;
}): Promise<RunWeeklyResult> {
  const { deps, now, onDemand = false } = opts;

  if (!onDemand && !deps.settings.autoEnabled) {
    return { skipped: true, reason: "auto_disabled" };
  }

  const window = rolling7dWindow(now);
  const memoryText = await deps.memoryRead().catch(() => "");
  const lastSnapshot = await deps.weeklyRepo.latest();

  const raw = await collectWindow({
    window,
    memoryText,
    lastPortraitAtClose: lastSnapshot?.living_portrait_at_close ?? null,
    turnRepo: deps.turnRepo,
    sharedMemoryRepo: deps.sharedMemoryRepo,
    libraryRepo: deps.libraryRepo,
  });

  const sparse = raw.turns.length < SPARSE_TURN_THRESHOLD;
  if (sparse && !onDemand) {
    return { skipped: true, reason: "sparse_week" };
  }

  let letter: WeeklyLetterJson;
  let fallback: boolean;
  if (sparse && onDemand) {
    // on-demand sparse: skip LLM entirely, go straight to fallback letter
    letter = {
      greeting: "", body: "",
      songs: raw.songs_played.slice(0, 5).map((s) => ({ song_id: s.song_id, one_liner: s.small_note ?? "" })),
      moments: raw.salient.slice(0, 3).map((m) => ({ moment_id: m.moment_id, whisper: m.text })),
      portrait_change: "",
      closing: "",
    };
    fallback = true;
  } else {
    const out = await deps.agent.run({ raw, onDemand });
    letter = out.letter;
    fallback = out.fallback;
  }

  const html = render(letter, raw, { fallback });

  const dir = await resolveWeeklyDir(deps.settings.dirOverride, deps.pathJoin, deps.appDataDir);
  const filename = filenameFor(window);
  const html_path = await deps.pathJoin(dir, filename);

  await deps.writeWeeklyHtml(html_path, html);

  await deps.weeklyRepo.insert({
    window_start: window.start,
    window_end: window.end,
    html_path,
    living_portrait_at_close: raw.living_portrait_now,
    turn_count: raw.turns.length,
    fallback: fallback ? 1 : 0,
  });

  return { skipped: false, html_path, fallback };
}
```

- [ ] **Step 4: 跑测试确认全绿**

Run: `cd 音乐播放器/app && pnpm test -- weekly/weekly.integration`
Expected: 7 passed

- [ ] **Step 5: Commit**

```bash
git add 音乐播放器/app/src/weekly/runWeekly.ts 音乐播放器/app/src/weekly/weekly.integration.test.ts
git commit -m "feat(lyra): runWeekly — sparse guard + write + snapshot insert + integration"
```

---

## Task 10: `dreamScheduler` 挂钩 + weekly 触发 test

**Files:**
- Modify: `音乐播放器/app/src/schedule/dreamScheduler.ts`(config 加 `runWeekly?`,daily branch 里周日 fire)
- Modify: `音乐播放器/app/src/schedule/dreamScheduler.test.ts`(追加 Sunday tick 用例)

**Interfaces:**
- Consumes: 既有 `DreamSchedulerConfig`
- Produces: `runWeekly?: () => Promise<void>` 在 config 上;`_lastWeeklyRunISO` 私有;`_checkDaily` 里在 reflect 之后 gate 周日调 runWeekly。**独立错误边界** — runWeekly 抛错不影响 reflect 状态。

- [ ] **Step 1: 追加测试用例** — `dreamScheduler.test.ts` 新增(在 file 底部 describe 里追加):

```ts
describe("DreamScheduler weekly hook", () => {
  it("fires runWeekly on Sunday at daily time, only once per Sunday", async () => {
    let sunday = new Date("2026-07-05T03:14:00");  // 2026-07-05 is Sunday
    const runReflect = vi.fn(async () => {});
    const runWeekly = vi.fn(async () => {});
    const s = new DreamScheduler({
      dailyTimeHHMM: "03:14",
      idleMinutes: 0,
      runReflect,
      runWeekly,
      clock: () => sunday,
      onActivityListen: () => () => {},
    });
    s.start();
    await new Promise((r) => setTimeout(r, 5));
    // manually trigger the tick to avoid waiting 60s
    await (s as any)._tick();
    expect(runWeekly).toHaveBeenCalledTimes(1);
    // second tick same day → not called again
    await (s as any)._tick();
    expect(runWeekly).toHaveBeenCalledTimes(1);
    s.stop();
  });

  it("does not fire runWeekly on non-Sunday", async () => {
    const monday = new Date("2026-07-06T03:14:00");
    const runReflect = vi.fn(async () => {});
    const runWeekly = vi.fn(async () => {});
    const s = new DreamScheduler({
      dailyTimeHHMM: "03:14",
      idleMinutes: 0,
      runReflect,
      runWeekly,
      clock: () => monday,
      onActivityListen: () => () => {},
    });
    s.start();
    await (s as any)._tick();
    expect(runReflect).toHaveBeenCalledTimes(1);
    expect(runWeekly).not.toHaveBeenCalled();
    s.stop();
  });

  it("runWeekly throw does not affect reflect success bookkeeping", async () => {
    const sunday = new Date("2026-07-05T03:14:00");
    const runReflect = vi.fn(async () => {});
    const runWeekly = vi.fn(async () => { throw new Error("boom"); });
    const s = new DreamScheduler({
      dailyTimeHHMM: "03:14",
      idleMinutes: 0,
      runReflect,
      runWeekly,
      clock: () => sunday,
      onActivityListen: () => () => {},
    });
    s.start();
    await (s as any)._tick();
    expect(runReflect).toHaveBeenCalledTimes(1);
    // second tick should not re-run reflect (daily lock intact)
    await (s as any)._tick();
    expect(runReflect).toHaveBeenCalledTimes(1);
    s.stop();
  });

  it("no runWeekly configured → non-Sunday and Sunday both work without error", async () => {
    const sunday = new Date("2026-07-05T03:14:00");
    const runReflect = vi.fn(async () => {});
    const s = new DreamScheduler({
      dailyTimeHHMM: "03:14",
      idleMinutes: 0,
      runReflect,
      clock: () => sunday,
      onActivityListen: () => () => {},
    });
    s.start();
    await expect((s as any)._tick()).resolves.toBeUndefined();
    expect(runReflect).toHaveBeenCalledTimes(1);
    s.stop();
  });
});
```

- [ ] **Step 2: 跑测试确认失败(config 上无 runWeekly)**

Run: `cd 音乐播放器/app && pnpm test -- dreamScheduler`
Expected: FAIL(TS error on runWeekly key,或 runtime 不 invoke)

- [ ] **Step 3: 改 `dreamScheduler.ts`**

Modify `音乐播放器/app/src/schedule/dreamScheduler.ts` — 3 处改动:

改 config 类型(在 `DreamSchedulerConfig` 里加):

```ts
export type DreamSchedulerConfig = {
  dailyTimeHHMM: string;
  idleMinutes: number;
  runReflect: () => Promise<void>;
  /** Sprint weekly: fires on Sunday daily-tick after reflect. Independent
   *  error boundary — a runWeekly throw does not affect reflect state. */
  runWeekly?: () => Promise<void>;
  clock?: () => Date;
  onActivityListen?: (cb: () => void) => () => void;
};
```

在类里加字段:

```ts
  /** ISO date string of the last Sunday we ran runWeekly (e.g. "2026-07-05") */
  private _lastWeeklyRunISO = "";
```

在 `_checkDaily` 结尾追加(reflect 完成之后):

```ts
  private async _checkDaily(now: Date): Promise<void> {
    const parsed = parseHHMM(this._config.dailyTimeHHMM);
    if (!parsed) return;

    const { h, m } = parsed;
    if (now.getHours() !== h || now.getMinutes() !== m) return;

    const todayISO = now.toISOString().slice(0, 10);
    if (this._lastDailyRunISO === todayISO) {
      // reflect already ran today; still allow weekly check because weekly
      // has its own per-Sunday guard.
      await this._maybeRunWeekly(now, todayISO);
      return;
    }

    await this._runReflect(() => {
      this._lastDailyRunISO = todayISO;
    });
    await this._maybeRunWeekly(now, todayISO);
  }

  private async _maybeRunWeekly(now: Date, todayISO: string): Promise<void> {
    const runWeekly = this._config.runWeekly;
    if (!runWeekly) return;
    if (now.getDay() !== 0) return;             // 0 = Sunday
    if (this._lastWeeklyRunISO === todayISO) return;
    try {
      await runWeekly();
      this._lastWeeklyRunISO = todayISO;
    } catch (err) {
      console.warn("[DreamScheduler] runWeekly threw:", err);
      // Do NOT set _lastWeeklyRunISO on failure — allow retry next tick
      // within the same day. Per-Sunday guard resets tomorrow.
    }
  }
```

- [ ] **Step 4: 跑测试确认全绿**

Run: `cd 音乐播放器/app && pnpm test -- dreamScheduler`
Expected: all pre-existing + 4 new all passed

- [ ] **Step 5: Commit**

```bash
git add 音乐播放器/app/src/schedule/dreamScheduler.ts 音乐播放器/app/src/schedule/dreamScheduler.test.ts
git commit -m "feat(lyra): dreamScheduler — Sunday runWeekly hook, isolated error boundary"
```

---

## Task 11: `/week` slash command + HomeView 装配

**Files:**
- Modify: `音乐播放器/app/src/home/slashCommand.ts`
- Modify: `音乐播放器/app/src/home/slashCommand.test.ts`
- Modify: `音乐播放器/app/src/home/HomeView.tsx`(约 60-80 行区块)

**Interfaces:**
- Consumes: nothing new
- Produces:
  - `SlashCommand` union 加 `| { kind: "week" }`
  - `parseSlashCommand("/week")` → `{ kind: "week" }`
  - HomeView prop `onWeek?: () => Promise<void>`;submit 里分发到 `onWeek`

- [ ] **Step 1: slashCommand test 追加**

Modify `音乐播放器/app/src/home/slashCommand.test.ts` — 追加 4 个用例:

```ts
  it("recognizes /week", () => {
    expect(parseSlashCommand("/week")).toEqual({ kind: "week" });
  });
  it("recognizes /week with surrounding whitespace", () => {
    expect(parseSlashCommand("  /week  ")).toEqual({ kind: "week" });
  });
  it("rejects /week with trailing content", () => {
    expect(parseSlashCommand("/week now")).toBeNull();
  });
  it("rejects /weeks (extra char)", () => {
    expect(parseSlashCommand("/weeks")).toBeNull();
  });
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd 音乐播放器/app && pnpm test -- slashCommand`
Expected: FAIL(2 new fail)

- [ ] **Step 3: 改 `slashCommand.ts`**

Modify `音乐播放器/app/src/home/slashCommand.ts`:

```ts
export type SlashCommand =
  | { kind: "settings" }
  | { kind: "stats" }
  | { kind: "explorer" }
  | { kind: "help" }
  | { kind: "reload-musics" }
  | { kind: "week" };

export function parseSlashCommand(raw: string): SlashCommand | null {
  const t = raw.trim();
  if (t === "/settings") return { kind: "settings" };
  if (t === "/stats") return { kind: "stats" };
  if (t === "/explorer") return { kind: "explorer" };
  if (t === "/help") return { kind: "help" };
  if (t === "/reload-musics") return { kind: "reload-musics" };
  if (t === "/week") return { kind: "week" };
  return null;
}
```

- [ ] **Step 4: 跑测试确认全绿**

Run: `cd 音乐播放器/app && pnpm test -- slashCommand`
Expected: all passed

- [ ] **Step 5: 改 `HomeView.tsx` 加 `onWeek` prop + 分发**

Modify `音乐播放器/app/src/home/HomeView.tsx:60-80`(props 定义 + submit 分发):

在 props 类型追加 `onWeek?: () => Promise<void>`:

```tsx
export function HomeView({
  onOpenSettings,
  onOpenDataExplorer,
  onOpenHelp,
  onWeek,
  orchestrator,
}: {
  onOpenSettings: () => void;
  onOpenDataExplorer: (tab?: string) => void;
  onOpenHelp: () => void;
  onWeek?: () => Promise<void>;
  orchestrator: Orchestrator;
}) {
```

在 submit 里追加分支(紧邻 reload-musics 后):

```tsx
    else if (cmd.kind === "reload-musics") void handleReload();
    else if (cmd.kind === "week") void onWeek?.();
```

- [ ] **Step 6: typecheck**

Run: `cd 音乐播放器/app && pnpm typecheck`
Expected: no errors

- [ ] **Step 7: Commit**

```bash
git add 音乐播放器/app/src/home/slashCommand.ts \
        音乐播放器/app/src/home/slashCommand.test.ts \
        音乐播放器/app/src/home/HomeView.tsx
git commit -m "feat(lyra): /week slash + HomeView onWeek prop"
```

---

## Task 12: Settings — weekly.dirOverride + weekly.autoEnabled + secrets keys

**Files:**
- Modify: `音乐播放器/app/src/settings/secrets.ts:2-16`(SECRET_KEYS 加 2 字段)
- Modify: `音乐播放器/app/src/settings/Settings.tsx`(state + load + save + UI)

**Interfaces:**
- Consumes: `SECRET_KEYS`
- Produces:
  - `SECRET_KEYS.weeklyDirOverride = "weekly.dirOverride"`
  - `SECRET_KEYS.weeklyAutoEnabled = "weekly.autoEnabled"`
  - Settings.tsx:2 新字段 UI + persist

- [ ] **Step 1: 加 SECRET_KEYS**

Modify `音乐播放器/app/src/settings/secrets.ts`:

```ts
export const SECRET_KEYS = {
  anthropicApiKey: "provider.anthropic.apiKey",
  deepseekApiKey: "provider.deepseek.apiKey",
  zhipuApiKey: "provider.zhipu.apiKey",
  libraryRootPath: "library.rootPath",
  dreamDailyTime: "dream.dailyTime",
  dreamIdleMinutes: "dream.idleMinutes",
  perceptionEnabled: "perception.enabled",
  perceptionMode: "perception.mode",
  embeddingProvider: "embedding.provider",
  zhipuEmbeddingApiKey: "embedding.zhipu.apiKey",
  openaiApiKey: "embedding.openai.apiKey",
  weeklyDirOverride: "weekly.dirOverride",
  weeklyAutoEnabled: "weekly.autoEnabled",
} as const;
```

- [ ] **Step 2: 改 `Settings.tsx` — state + load**

Modify `音乐播放器/app/src/settings/Settings.tsx` state 块(约行 16-30 后追加):

```tsx
  const [weeklyDir, setWeeklyDir] = useState("");
  const [weeklyAuto, setWeeklyAuto] = useState(true);
```

修改 load 块(`Promise.all` 数组末尾追加 2 项):

```tsx
      const [a, d, z, lib, dt, dim, pe, pm, ep, zek, ok, wd, wa] = await Promise.all([
        getSecret(SECRET_KEYS.anthropicApiKey),
        getSecret(SECRET_KEYS.deepseekApiKey),
        getSecret(SECRET_KEYS.zhipuApiKey),
        getSecret(SECRET_KEYS.libraryRootPath),
        getSecret(SECRET_KEYS.dreamDailyTime),
        getSecret(SECRET_KEYS.dreamIdleMinutes),
        getSecret(SECRET_KEYS.perceptionEnabled),
        getSecret(SECRET_KEYS.perceptionMode),
        getSecret(SECRET_KEYS.embeddingProvider),
        getSecret(SECRET_KEYS.zhipuEmbeddingApiKey),
        getSecret(SECRET_KEYS.openaiApiKey),
        getSecret(SECRET_KEYS.weeklyDirOverride),
        getSecret(SECRET_KEYS.weeklyAutoEnabled),
      ]);
```

紧接的 setState 块补 2 行:

```tsx
      setWeeklyDir(wd ?? "");
      setWeeklyAuto(wa !== "false");
```

修改 `onSave` 块的 setSecret 序列末尾追加:

```tsx
      await setSecret(SECRET_KEYS.weeklyDirOverride, weeklyDir);
      await setSecret(SECRET_KEYS.weeklyAutoEnabled, weeklyAuto ? "true" : "false");
```

修改 UI(在 Reflect / Save 之前追加一个块;具体位置在 `<div className="settings-actions">` 上一层):

```tsx
      <fieldset className="settings-weekly">
        <legend>周报</legend>
        <label>
          保存目录(留空则默认 <code>&lt;appData&gt;/weeklies</code>)
          <input
            type="text"
            value={weeklyDir}
            onChange={(e) => setWeeklyDir(e.target.value)}
            placeholder=""
          />
        </label>
        <label>
          <input
            type="checkbox"
            checked={weeklyAuto}
            onChange={(e) => setWeeklyAuto(e.target.checked)}
          />
          周日 03:14 自动生成
        </label>
      </fieldset>
```

- [ ] **Step 3: typecheck + build**

Run: `cd 音乐播放器/app && pnpm typecheck && pnpm build`
Expected: no errors,build 成功

- [ ] **Step 4: 跑全量 vitest,确认 Settings 相关既有 test 不 regression**

Run: `cd 音乐播放器/app && pnpm test`
Expected: all green(725+/-)

- [ ] **Step 5: Commit**

```bash
git add 音乐播放器/app/src/settings/secrets.ts \
        音乐播放器/app/src/settings/Settings.tsx
git commit -m "feat(lyra): Settings — weekly dir override + auto enable toggle"
```

---

## Task 13: App-level wiring — WeeklyAgent + runWeekly + scheduler 连线

**Files:**
- Modify: `音乐播放器/app/src/App.tsx`(或应用主入口/scheduler 装配处 — 若不在 App.tsx,则在 scheduler 实例化处)

**Interfaces:**
- Consumes: 前面所有 Produces
- Produces: 应用启动后 DreamScheduler 有 runWeekly 挂钩;HomeView 收到 onWeek callback,内含 on-demand 生成 + open

- [ ] **Step 1: 找到装配处**

Run: `cd 音乐播放器/app && grep -n "new DreamScheduler\|DreamScheduler(" src/App.tsx src/index.tsx src/main.tsx 2>/dev/null | head`
Expected: 定位到某个文件的一行

若 App.tsx 没有,搜:
Run: `grep -rn "new DreamScheduler" 音乐播放器/app/src`
Expected: 定位到实际装配位置。以下 Step 假设是 `App.tsx`,依实际路径调整。

- [ ] **Step 2: 建 `weekly` 装配 helper** — 让 App.tsx 只做一次装配

Create `音乐播放器/app/src/weekly/wire.ts`:

```ts
import { invoke } from "@tauri-apps/api/core";
import { appDataDir, join } from "@tauri-apps/api/path";
import * as turnRepo from "../db/repo/turnRepo";
import * as sharedMemoryRepo from "../db/repo/sharedMemoryRepo";
import * as libraryRepo from "../db/repo/libraryRepo";
import * as weeklyRepo from "../db/repo/weeklyRepo";
import { getSecret, SECRET_KEYS } from "../settings/secrets";
import { WeeklyAgent } from "./WeeklyAgent";
import { runWeekly, type RunWeeklyDeps } from "./runWeekly";

export async function makeWeeklyDeps(): Promise<RunWeeklyDeps> {
  const dirOverride = (await getSecret(SECRET_KEYS.weeklyDirOverride)) || null;
  const autoRaw = await getSecret(SECRET_KEYS.weeklyAutoEnabled);
  const autoEnabled = autoRaw !== "false";
  const agent = new WeeklyAgent();
  return {
    settings: { dirOverride, autoEnabled },
    appDataDir,
    pathJoin: join,
    writeWeeklyHtml: (path, content) => invoke("write_weekly_html", { path, content }),
    turnRepo: { listRecentTurns: (limit) => turnRepo.listRecentTurns(limit) },
    sharedMemoryRepo: { listRecentSalient: (limit) => sharedMemoryRepo.listRecentSalient(limit) },
    libraryRepo: { getById: (id) => libraryRepo.getById(id) },
    memoryRead: () => invoke<string>("memory_file_read"),
    weeklyRepo: {
      insert: weeklyRepo.insert,
      latest: weeklyRepo.latest,
      findByWindow: weeklyRepo.findByWindow,
      deleteByWindow: weeklyRepo.deleteByWindow,
    },
    agent,
  };
}

/** Auto-trigger entry — resolves settings each call so a user toggling
 *  auto-off in Settings takes effect on the next Sunday tick. */
export async function autoWeeklyTrigger(): Promise<void> {
  const deps = await makeWeeklyDeps();
  await runWeekly({ now: new Date(), onDemand: false, deps });
}

/** On-demand entry (from /week slash). Idempotent per window — reuses the
 *  file on disk if it exists and is readable. */
export async function onDemandWeeklyOpen(): Promise<void> {
  const deps = await makeWeeklyDeps();
  const win = (await import("./weeklyPaths")).rolling7dWindow(new Date());
  const existing = await deps.weeklyRepo.findByWindow(win.start, win.end);
  if (existing) {
    const exists = await invoke<boolean>("path_exists", { path: existing.html_path });
    if (exists) {
      await invoke("open_weekly_html", { path: existing.html_path });
      return;
    }
    await deps.weeklyRepo.deleteByWindow(win.start, win.end);
  }
  const out = await runWeekly({ now: new Date(), onDemand: true, deps });
  if (out.skipped) return;
  await invoke("open_weekly_html", { path: out.html_path });
}
```

- [ ] **Step 3: 在装配处连线 `runWeekly` 挂钩 + `onWeek` prop**

Modify 已定位的装配文件(下面示例位置 App.tsx,依实际调整):

- 在 DreamScheduler 实例化时传 `runWeekly: autoWeeklyTrigger`
- 在 HomeView 渲染时传 `onWeek={onDemandWeeklyOpen}`

新导入:

```tsx
import { autoWeeklyTrigger, onDemandWeeklyOpen } from "./weekly/wire";
```

改 DreamScheduler 装配(在既有 `new DreamScheduler(...)` 配置对象里追加):

```tsx
      runWeekly: autoWeeklyTrigger,
```

改 HomeView 渲染(在既有 `<HomeView ... />` 上追加):

```tsx
      onWeek={onDemandWeeklyOpen}
```

- [ ] **Step 4: typecheck + build**

Run: `cd 音乐播放器/app && pnpm typecheck && pnpm build`
Expected: no errors

- [ ] **Step 5: 跑全量 test**

Run: `cd 音乐播放器/app && pnpm test`
Expected: all green

- [ ] **Step 6: cargo test 全量**

Run: `cd 音乐播放器/app/src-tauri && cargo test`
Expected: all green

- [ ] **Step 7: Commit**

```bash
git add 音乐播放器/app/src/weekly/wire.ts 音乐播放器/app/src/App.tsx
git commit -m "feat(lyra): app wiring — weekly auto trigger + /week on-demand open"
```

---

## Task 14: 手工验收

**Files:** 无代码变动

**Interfaces:** 用户视角验证 spec §8.5 checklist

- [ ] **Step 1: 启动 dev app**

Run: `cd 音乐播放器/app && pnpm tauri dev`
Expected: app 起来,能对话

- [ ] **Step 2: `/week` 冷启动测**

- 打开 Settings 确认 dirOverride 为空 / auto 开
- 关闭 Settings
- 在输入框敲 `/week` → 系统浏览器应弹出打开 `<appDataDir>/weeklies/YYYY-MM-DD_to_YYYY-MM-DD.html`
- 若本周 turns < 3:HTML 是 fallback letter("我有点跟不上"),但 songs / moments / PAD 段仍从数据渲
- 若 turns ≥ 3:HTML 是完整 letter

- [ ] **Step 3: 幂等测**

- 再敲 `/week` → 应 **不重跑 LLM**(检查 Data Explorer LLM 用量 tab 计数不变),直接打开同一 HTML

- [ ] **Step 4: 磁盘删测**

- Finder 删掉 HTML 文件
- 敲 `/week` → 应重生 + 打开
- weekly_snapshots 表内应只有 1 行本 window(旧 row 已删)

- [ ] **Step 5: dirOverride 测**

- Settings 里填 `/tmp/lyra-weeklies`,save
- 删 weekly_snapshots 里本 window 的 row 或直接改一下 windowstart date 让下次生成走新路径
- 敲 `/week` → 新文件落到 `/tmp/lyra-weeklies/`

- [ ] **Step 6: 打印 / 归档测**

- 浏览器打开 HTML → Cmd+P 打印预览:排版无外链失效 / 中文字体正常
- Cmd+S 另存 → 单文件保存,断网离线打开仍可读

- [ ] **Step 7: 拔 key fallback 测**

- Settings 里清 anthropic key,save
- 找到既存本 window 的 HTML 删掉
- 敲 `/week` → HTML 是 fallback letter,"我有点跟不上" 语句可见,不带任何 URL

- [ ] **Step 8: 记录发现,写入 defer 或修 bug**

若发现瑕疵:log 到 spec §9 defer 清单或开新 issue。若阻断:回相应 Task 修。

- [ ] **Step 9: 收尾 commit(若有小 fix)**

依需 commit;若无变动,跳过。

---

## Self-Review

**1. Spec coverage:**

| spec 章节 | 覆盖任务 |
|---|---|
| §1 是什么 | Task 6/7/8/9(内容) · Task 4/10/11(触发/存放) |
| §2 为什么 | 非代码 |
| §3 哲学对齐(第一人称 / 静默 / 无外链 / XSS) | Task 6(renderer 硬测) · Task 7(prompt 硬测) · Task 9(装配层不弹提示) |
| §4 架构 | Task 1-13 覆盖全部 8 新文件 + 修改文件 |
| §5.1 WeeklyAgent | Task 8 |
| §5.2 letter JSON schema | Task 6(WeeklyLetterJson 定义)+ Task 7(prompt 里 schema)+ Task 8(validateLetter) |
| §5.3 dataGather | Task 5 |
| §5.4 renderer | Task 6 |
| §5.5 scheduler | Task 10 |
| §5.6 paths + Rust 命令 | Task 3(Rust)+ Task 4(TS paths) |
| §5.7 weeklyRepo + migration | Task 1(migration)+ Task 2(repo) |
| §5.8 slash | Task 11 |
| §5.9 Settings | Task 12 |
| §6 数据流(自动/on-demand/幂等) | Task 9(runWeekly)+ Task 13(wire.ts on-demand 路径) |
| §7 错误处理 | §7.1 LLM 失败 → Task 8 retry+fallback · §7.2 sparse → Task 9 · §7.3 Rust 失败 → wire.ts catch · §7.4 磁盘删 → Task 13 · §7.5 portrait 漂移 → Task 5 · §7.6 时区 → Task 4/10 · §7.7 migration → Task 1 · §7.8 并发 → weeklyRepo UNIQUE(Task 2) |
| §8 测试 | 全 tasks 都是 TDD 结构 · integration → Task 9 · Rust → Task 3 · eval → Task 9 defer |

无缺口。

**2. Placeholder scan:** 无 TBD / TODO / "similar to N" 类占位。装配层(Task 13)的具体装配文件路径依 `grep` 定位,是不可避免的动态发现,不算 placeholder。

**3. Type consistency:**
- `WeeklyLetterJson` 在 Task 6 定义(渲染器 own),Task 7/8 import,一致
- `WeeklyRawData` / `PadPoint` / `WeeklySongPlayed` 在 Task 5 定义,Task 6/7/8/9 import,一致
- `WeekWindow` 在 Task 4 定义,Task 5/9 import,一致
- `WeeklySnapshotRow.fallback: 0 | 1` 在 Task 2 定义,Task 9 用数值 0/1,一致
- `RunWeeklyDeps` 在 Task 9 定义,Task 13 in wire.ts 装配,一致
- `AgentKind` 加 `"weekly"` 在 Task 1,Task 8 `writeTrace({ agent_kind: "weekly" })` 用,一致
- `ChatOptions.agent: "weekly"` 在 Task 8 传,与 spec §5.1 一致
- SlashCommand 新增 `"week"` kind:parseSlashCommand(Task 11)+ HomeView submit(Task 11)一致

无不一致。

---

**Plan complete and saved to `docs/superpowers/plans/2026-07-09-lyra-weekly-letter.md`. Two execution options:**

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**
