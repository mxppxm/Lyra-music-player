#!/usr/bin/env node
/**
 * batch-profile.mjs — 一站式 Bilibili 歌曲画像批量生成
 *
 * 1. 从 B站 JLRS-LeoFM 空间拉取全部"百万"歌曲元数据
 * 2. 写入 library_tracks 表
 * 3. 逐首调用 DeepSeek Flash 生成 MusicProfile
 * 4. 写入 music_profiles 表
 *
 * Usage: /path/to/node scripts/batch-profile.mjs
 * 需要 Node >= 22 (内置 SQLite)
 */

import { DatabaseSync } from "node:sqlite";
import crypto from "node:crypto";

// ── Config ──────────────────────────────────────────────────────────────────
const DB_PATH = `${process.env.HOME}/Library/Application Support/com.daoyu.lyra/lyra.db`;
const DEEPSEEK_KEY = process.env.DEEPSEEK_API_KEY ?? "";
const DEEPSEEK_MODEL = "deepseek-chat"; // 'deepseek-flash' might not be available on v1 API
const DEEPSEEK_URL = "https://api.deepseek.com/v1/chat/completions";
const BILI_MID = "3493093607213343"; // JLRS-LeoFM
const DELAY_MS = 600; // between API calls (rate limit safety)
const BATCH_SIZE = 10; // how many to process before printing progress

// ── Bilibili request headers (must match Rust bilibili_proxy) ───────────────
const BILI_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  "Referer": "https://www.bilibili.com/",
  "Origin": "https://www.bilibili.com",
  "Accept": "application/json, text/plain, */*",
  "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
  "Cookie": "buvid3=random-buvid3-for-lyra",
};

// ── WBI signing (Bilibili space API) ────────────────────────────────────────

const MIXIN_KEY_ENC_TAB = [
  46, 47, 18, 2, 53, 8, 23, 32, 15, 50, 10, 31, 58, 3, 45, 35,
  27, 43, 5, 49, 33, 9, 42, 19, 29, 28, 14, 39, 12, 38, 41, 13,
  37, 48, 7, 16, 24, 55, 40, 61, 26, 17, 0, 1, 60, 51, 30, 4,
  22, 25, 54, 21, 56, 59, 6, 63, 57, 62, 11, 36, 20, 34, 44, 52,
];

function md5(input) {
  return crypto.createHash("md5").update(input).digest("hex");
}

let _mixinKey = null;
async function getMixinKey() {
  if (_mixinKey) return _mixinKey;
  const res = await fetch("https://api.bilibili.com/x/web-interface/nav", { headers: BILI_HEADERS });
  const json = await res.json();
  const data = json.data ?? {};
  const imgKey = (data.wbi_img?.img_url ?? "").split("/").pop()?.split(".")[0] ?? "";
  const subKey = (data.wbi_img?.sub_url ?? "").split("/").pop()?.split(".")[0] ?? "";
  const rawKey = imgKey + subKey;
  const mixinChars = [];
  for (const idx of MIXIN_KEY_ENC_TAB) {
    if (idx < rawKey.length) mixinChars.push(rawKey[idx]);
  }
  _mixinKey = mixinChars.join("").slice(0, 32);
  return _mixinKey;
}

async function biliGet(path, params) {
  const mixinKey = await getMixinKey();
  const wts = String(Math.floor(Date.now() / 1000));
  params.wts = wts;
  const encoded = Object.keys(params)
    .sort()
    .map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(params[k])}`)
    .join("&");
  params.w_rid = md5(encoded + mixinKey);

  const qs = new URLSearchParams(params).toString();
  const url = `https://api.bilibili.com${path}?${qs}`;
  const res = await fetch(url, { headers: BILI_HEADERS });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Bilibili ${res.status}: ${text.slice(0, 200)}`);
  }
  const json = await res.json();
  if (json.code !== 0) {
    throw new Error(`Bilibili API error code=${json.code}: ${json.message}`);
  }
  return json.data ?? json;
}

// ── Bilibili: fetch all songs ───────────────────────────────────────────────

function parseDuration(dur) {
  const parts = String(dur).split(":").map(Number);
  if (parts.length === 3) return (parts[0] * 3600 + parts[1] * 60 + parts[2]) * 1000;
  if (parts.length === 2) return (parts[0] * 60 + parts[1]) * 1000;
  return 0;
}

async function fetchAllSongs() {
  console.log("[fetch] Fetching JLRS-LeoFM space API...");
  const songs = [];
  const seen = new Set();
  let page = 1;
  let emptyCount = 0;

  while (emptyCount < 2) {
    const data = await biliGet("/x/space/wbi/arc/search", {
      mid: BILI_MID,
      ps: "50",
      pn: String(page),
      order: "pubdate",
      tid: "0",
      keyword: "",
    });

    const list = data?.list?.vlist ?? [];
    if (list.length === 0) {
      emptyCount++;
      page++;
      continue;
    }
    emptyCount = 0;

    for (const v of list) {
      const bvid = String(v.bvid ?? "");
      if (seen.has(bvid)) continue;
      seen.add(bvid);

      const title = String(v.title ?? "").replace(/<em[^>]*>/g, "").replace(/<\/em>/g, "");
      if (!title.includes("百万")) continue;

      const durMs = parseDuration(String(v.length ?? "0:00"));
      if (durMs < 90_000 || durMs > 600_000) continue;

      songs.push({
        bvid,
        aid: Number(v.aid ?? 0),
        title,
        author: String(v.author ?? ""),
        duration_ms: durMs,
        cover: String(v.pic ?? ""),
        play_count: Number(v.play ?? v.video_review ?? 0),
      });
    }

    process.stdout.write(`\r[fetch] page ${page}, found ${songs.length} songs so far...`);
    page++;
  }

  console.log(`\n[fetch] Done. Total: ${songs.length} songs.`);
  return songs;
}

// ── SQLite: insert metadata ─────────────────────────────────────────────────

function insertMetadata(db, songs) {
  console.log("[db] Writing metadata to library_tracks...");
  const insert = db.prepare(
    `INSERT OR IGNORE INTO library_tracks (id, path, origin, title, artist, album, duration_ms, added_at, metadata_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );

  const insertMany = db.transaction((songs) => {
    let count = 0;
    for (const s of songs) {
      const id = `bili:${s.bvid}`;
      const meta = JSON.stringify({
        bvid: s.bvid,
        aid: s.aid,
        tag: "",
        cover: s.cover,
        play_count: s.play_count,
      });
      insert.run(id, `bili:__pending__:${s.bvid}`, "web", s.title, s.author, null, s.duration_ms, Date.now(), meta);
      count++;
    }
    return count;
  });

  const count = insertMany(songs);
  console.log(`[db] Inserted ${count} metadata rows.`);
  return count;
}

// ── Ensure music_profiles table exists ──────────────────────────────────────

function ensureProfileTable(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS music_profiles (
      track_id TEXT PRIMARY KEY,
      analyzed_at INTEGER NOT NULL,
      llm_model TEXT NOT NULL,
      profile_json TEXT NOT NULL
    );
  `);
  console.log("[db] music_profiles table ready.");
}

// ── DeepSeek: Music Profile ─────────────────────────────────────────────────

const MUSIC_PROFILE_PROMPT = `你是专业的音乐分析师。我给你一首歌的标题和歌手，你需要输出这首歌的完整结构化画像。

分析维度：
- genre: 曲风流派（如 ["indie folk", "dream pop", "post-rock"]）
- mood: 情绪标签（如 ["melancholic", "warm", "nostalgic", "平静", "孤独"]），3-6 个
- energy_level: 能量级别 "very_low" | "low" | "medium" | "high" | "very_high"
- tempo_feel: 节奏感受，用一句话中文描述（如 "缓慢、有呼吸感、像心跳"）
- time_color: 这首歌的时间色彩（如 "凌晨三点"、"夏日午后"、"雨夜"）
- space_color: 空间色彩（如 "小房间只开一盏台灯"、"空旷的海边公路"）
- instrumentation: 主要乐器（如 ["acoustic guitar", "钢琴", "环境音"]）
- vocal_style: 人声风格，用中文描述（如 "气声、近麦、咬字懒散"，无 vocal 写 "无人声"）
- lyrical_themes: 歌词主题标签（如 ["孤独", "城市", "未完成的告别"]），2-4 个
- emotional_curve: 整首歌的情绪弧线，用中文描述（如 "平缓下沉→中段微光→沉回去"）
- best_for: 最适合听的场景（如 ["深夜独处", "下雨天", "开车兜风"]），2-4 个
- pad_estimate: 你估计的 PAD 值 p(愉悦度) a(激动度) d(力量感)，各在 [-1, 1]

如果你不认识这首歌（太小众/纯音乐/信息不足），设置 llm_unknown: true，但尽量填充你能推断的字段。

返回 STRICT JSON：
{"genre":[],"mood":[],"energy_level":"medium","tempo_feel":"...","time_color":"...","space_color":"...","instrumentation":[],"vocal_style":"...","lyrical_themes":[],"emotional_curve":"...","best_for":[],"pad_estimate":{"p":0,"a":0,"d":0},"llm_unknown":false}`;

async function analyzeSong(title, artist) {
  const userContent = [`标题: ${title}`, artist ? `歌手: ${artist}` : ""]
    .filter(Boolean)
    .join("\n");

  const body = {
    model: DEEPSEEK_MODEL,
    messages: [
      { role: "system", content: MUSIC_PROFILE_PROMPT },
      { role: "user", content: userContent },
    ],
    max_tokens: 1024,
    temperature: 0.3,
    response_format: { type: "json_object" },
  };

  const res = await fetch(DEEPSEEK_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${DEEPSEEK_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`DeepSeek ${res.status}: ${text.slice(0, 200)}`);
  }

  const data = await res.json();
  return data.choices?.[0]?.message?.content ?? "";
}

function parseProfile(raw) {
  try {
    // Handle JSON wrapped in markdown code blocks
    let json = raw.trim();
    if (json.startsWith("```")) {
      json = json.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
    }
    const p = JSON.parse(json);
    return {
      genre: Array.isArray(p.genre) ? p.genre.filter((x) => typeof x === "string") : [],
      mood: Array.isArray(p.mood) ? p.mood.filter((x) => typeof x === "string") : [],
      energy_level: ["very_low", "low", "medium", "high", "very_high"].includes(p.energy_level) ? p.energy_level : "medium",
      tempo_feel: typeof p.tempo_feel === "string" ? p.tempo_feel : "",
      time_color: typeof p.time_color === "string" ? p.time_color : "",
      space_color: typeof p.space_color === "string" ? p.space_color : "",
      instrumentation: Array.isArray(p.instrumentation) ? p.instrumentation.filter((x) => typeof x === "string") : [],
      vocal_style: typeof p.vocal_style === "string" ? p.vocal_style : "",
      lyrical_themes: Array.isArray(p.lyrical_themes) ? p.lyrical_themes.filter((x) => typeof x === "string") : [],
      emotional_curve: typeof p.emotional_curve === "string" ? p.emotional_curve : "",
      best_for: Array.isArray(p.best_for) ? p.best_for.filter((x) => typeof x === "string") : [],
      pad_estimate: {
        p: typeof p.pad_estimate?.p === "number" ? Math.max(-1, Math.min(1, p.pad_estimate.p)) : 0,
        a: typeof p.pad_estimate?.a === "number" ? Math.max(-1, Math.min(1, p.pad_estimate.a)) : 0,
        d: typeof p.pad_estimate?.d === "number" ? Math.max(-1, Math.min(1, p.pad_estimate.d)) : 0,
      },
      llm_unknown: p.llm_unknown === true,
    };
  } catch (e) {
    return null;
  }
}

// ── SQLite: write profiles ──────────────────────────────────────────────────

function upsertProfile(db, trackId, profile) {
  const stmt = db.prepare(
    `INSERT INTO music_profiles (track_id, analyzed_at, llm_model, profile_json)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(track_id) DO UPDATE SET
       analyzed_at = excluded.analyzed_at,
       llm_model = excluded.llm_model,
       profile_json = excluded.profile_json`,
  );

  const fullProfile = { track_id: trackId, analyzed_at: Date.now(), llm_model: DEEPSEEK_MODEL, ...profile };
  stmt.run(trackId, fullProfile.analyzed_at, DEEPSEEK_MODEL, JSON.stringify(fullProfile));
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("=== Lyra Batch Music Profile Generator ===\n");

  if (!DEEPSEEK_KEY) {
    console.error("Set DEEPSEEK_API_KEY in the environment before running.");
    process.exit(1);
  }

  // Ensure DB is open
  const db = new DatabaseSync(DB_PATH);

  // Step 0: Ensure tables exist
  ensureProfileTable(db);

  // Step 1: Check if songs already in DB
  const existing = db.prepare("SELECT COUNT(*) as c FROM library_tracks WHERE origin = 'web'").get();
  let songs;

  if (existing.c > 0) {
    console.log(`[db] Already have ${existing.c} web tracks. Skipping fetch.`);
    songs = db.prepare("SELECT id, title, artist FROM library_tracks WHERE origin = 'web'").all();
  } else {
    // Step 1a: Fetch songs from Bilibili
    songs = await fetchAllSongs();
    if (songs.length === 0) {
      console.log("[fetch] No songs found. Exiting.");
      db.close();
      return;
    }

    // Step 1b: Write metadata to SQLite
    insertMetadata(db, songs);
  }

  // Step 2: Get songs that need profiling
  const toProfile = db
    .prepare(
      `SELECT id, title, artist FROM library_tracks
       WHERE origin = 'web'
       AND id NOT IN (SELECT track_id FROM music_profiles)
       ORDER BY id`,
    )
    .all();

  console.log(`\n[profile] ${toProfile.length} songs need profiling.`);
  if (toProfile.length === 0) {
    console.log("[profile] All done!");
    db.close();
    return;
  }

  // Step 3: Profile each song
  let success = 0;
  let fail = 0;
  const startTime = Date.now();

  for (let i = 0; i < toProfile.length; i++) {
    const song = toProfile[i];
    const bvid = song.id.startsWith("bili:") ? song.id.slice(5) : song.id;

    try {
      const raw = await analyzeSong(song.title, song.artist);
      const profile = parseProfile(raw);
      if (profile && (profile.genre.length > 0 || profile.mood.length > 0)) {
        upsertProfile(db, song.id, profile);
        success++;
      } else {
        fail++;
        console.warn(`\n[profile] ${bvid} returned empty/parse-failed: ${raw.slice(0, 80)}`);
      }
    } catch (e) {
      fail++;
      console.error(`\n[profile] ${bvid} error:`, e.message);
    }

    // Progress
    if ((i + 1) % BATCH_SIZE === 0 || i === toProfile.length - 1) {
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
      const pct = ((i + 1) / toProfile.length * 100).toFixed(1);
      process.stdout.write(
        `\r[profile] ${i + 1}/${toProfile.length} (${pct}%) | ✅ ${success} ❌ ${fail} | ${elapsed}s`,
      );
    }

    // Rate limit
    await new Promise((r) => setTimeout(r, DELAY_MS));
  }

  const totalTime = ((Date.now() - startTime) / 1000 / 60).toFixed(1);
  console.log(`\n\n[profile] Done! ${success} succeeded, ${fail} failed. Took ${totalTime}min.`);

  // Summary
  const totalProfiled = db.prepare("SELECT COUNT(*) as c FROM music_profiles").get();
  console.log(`[db] Total music_profiles in DB: ${totalProfiled.c}`);
  db.close();
}

main().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});
