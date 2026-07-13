# TODO 池

会话中开题但当前搁置的功能设计。恢复时:重新走 brainstorming skill,已答问题不必再问,拿本文件当上下文,补齐剩余 § 后落 spec。

---

## 曲库清单 + 按需下载(2026-07-10 开题,2026-07-12 搁置)

**原始请求**:
> 曲库的设计:
> 1. 增加一个曲库歌曲清单,包括,歌曲信息、下载 url、标签、向量特征等
> 2. 增加一个根据曲库歌曲清单下载歌曲的功能

**搁置原因**:用户撤回,后续推进。

### 已确认的设计决定(brainstorming Q&A)

| 维度 | 决定 |
|---|---|
| 清单定位 | **曲库单一来源** — 全部走清单;本地文件退化为缓存 |
| 清单来源 | 本地文件 + 远程 URL 均支持 |
| 下载源形式 | **只直链音频文件**(mp3/flac/m4a);数据模型预留 `source_kind` 字段以后扩 yt-dlp 等 |
| 特征生产 | **清单携带,应用直接采纳** — tags/BPM/energy/valence/audio embedding/lyrics embedding 全由清单作者给,应用不本地重算 |
| 下载时机 | **后台涓涓 · 空闲预拉** — 每分钟一次,idle 时挑一条下 |
| 缓存策略 | **容量上限 + LRU 淘汰** — `max_cache_mb` 从 Settings 配 |
| 与本地扫描共存 | 保留 `/reload-musics`,新增 `origin='catalog'`,原 `origin='local'` 路径不变 |
| UI 面 | **最小面** — Settings 加"源列表 + max_cache_mb",不加 slash 命令,不加 Data Explorer tab |
| 存储方案 | **方案 C** — `catalog_sources` 单独一表 + `library_tracks` 扩字段(不新增 `catalog_entries` 分层) |

### 已呈现且确认的设计段(§ 1–§ 5)

**§ 1 架构概览** — ManifestSync / PrefetchScheduler / DownloadEngine(Rust)/ Play-time fallback 四组件,两条数据流

**§ 2 数据模型 / migration `008_catalog.sql`**
- 新表 `catalog_sources(id, kind, location, enabled, last_synced_at, last_sync_status, etag, added_at)`
- `library_tracks` 加 8 个字段:`source_kind, download_url, download_status, catalog_source_id, bytes_size, last_played_at, download_error, retry_after_ts`
- 索引:`idx_tracks_status`, `idx_tracks_lru`, `idx_catalog_sources_enabled`
- `library_tracks.origin` CHECK 扩到 `('local','catalog','web','generated')`(SQLite CHECK 变更需重建表)
- `library_features.tags_json / embedding_json` 沿用,不改
- `library_lyrics_embeddings` 沿用

**§ 3 清单 JSON schema v1**
- 顶层 `version / source_id / generated_at / tracks[]`
- 每条 track: `id(sha256 推荐)/ title / artist / album / duration_ms / download_url / source_kind / bytes_size? / sha256? / tags[] / features{bpm,energy,valence} / audio_embedding? / lyrics_embedding{model,dim,vector}?`
- 必填 `id + title + download_url`;缺必填 → 跳过条目、不阻塞整批
- Malformed 顶层 → 整源 sync 失败,不动已入库数据

**§ 4 Sync 触发/时序/冲突**
- 触发 4 处:App 启动、DreamScheduler tick(6h 间隔)、Settings 保存源变更、无 slash
- 多源串行;模块级 `syncInFlight` 防重入
- Upsert 覆盖表:`download_status` 永不覆盖;`origin='local'` 永不改写;`download_url` 变化 → 强制置 `pending`
- Orphan:sync 后不在最新清单里 → 标 `orphan`,下轮 evict 前先清
- 远程 GET 带 `If-None-Match: <etag>`,5s 超时

**§ 5 Prefetch Scheduler**
- 挂 DreamScheduler tick,不新起线程
- Idle:非 thinking、非 playing、距上次 > `PREFETCH_INTERVAL_MS`(60_000)、`downloadInFlight=false`
- 挑片:`pending` → `failed 且 retry_after_ts 到期`,组内 `added_at ASC` FIFO
- LRU evict 顺序:orphan 优先 → `last_played_at ASC NULLS FIRST` 的 ready 曲
- 状态机:`pending → downloading → ready | failed → retry`;`ready → evicted → pending`
- 退避:`2^retry_count * 60s`,cap 24h,编码进 `download_error` 前缀无需加字段
- 无 bytes_size 时按 8 MB 保守估算做预算判断

### 待办段(§ 6–§ 10)

- **§ 6 Download Engine (Rust)**:cmd 契约、tmp+rename 原子写、可选 sha256 校验、超时、失败错因分类、取消支持?(MVP 应该不取消)
- **§ 7 Play-time fallback**:Orchestrator 选到 `evicted / pending` 曲怎么办 — 同步触发下载 + "稍等"提示文案?LLM 直接换歌?下载失败降级(去挑另一首?)
- **§ 8 Settings 交互面**:UI 具体形态(源列表增删/enable、URL 输入校验、max_cache_mb 数值输入),secret 键名(`catalog_sources_json`, `catalog_max_cache_mb`)
- **§ 9 错误处理清单**:恶意/损坏 manifest、404、超时、磁盘满、部分写、并发冲突、URL 变更导致 stale 文件 — 每种一句处理策略
- **§ 10 测试策略 & YAGNI 切除线**:vitest 覆盖点(sync/scheduler/repo/paths)+ cargo test(download engine)+ 本 sprint **不做**:yt-dlp、进度 UI、多设备同步、清单编辑器、audio embedding 本地计算

### 落地流程

1. 恢复 brainstorming skill,粘本文件作上下文
2. 补齐 § 6–§ 10
3. 写 `docs/superpowers/specs/YYYY-MM-DD-catalog-download-design.md`
4. 用户 review
5. `superpowers:writing-plans` 出 `docs/superpowers/plans/YYYY-MM-DD-catalog-download.md`
6. `superpowers:subagent-driven-development` 执行

### 相关代码地标(不需改就能改)

- 现有 library 入口:`src/library/libraryScan.ts`(`importLibrary`)、`src/library/reloadLibrary.ts`
- 现有 repo:`src/db/repo/libraryRepo.ts`、`libraryFeaturesRepo.ts`、`lyricsEmbeddingsRepo.ts`
- 迁移目录:`src-tauri/migrations/`(最新 007_weekly_snapshots.sql)
- DreamScheduler:`src/schedule/dreamScheduler.ts`(prefetch/sync 会挂 tick)
- Settings:`src/settings/Settings.tsx` + `src/settings/secrets.ts`
- Rust 命令注册:`src-tauri/src/lib.rs`
- Origin 枚举校验:`001_initial.sql:51`(`origin IN ('local','web','generated')`)
