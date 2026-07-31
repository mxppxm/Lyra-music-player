import { CapacitorSQLite, SQLiteConnection } from "@capacitor-community/sqlite";
import { Capacitor } from "@capacitor/core";
import { Filesystem, Directory } from "@capacitor/filesystem";

const sqlite = new SQLiteConnection(CapacitorSQLite);
const DB_NAME = "lyra";

type DbHandle = Awaited<ReturnType<SQLiteConnection["createConnection"]>>;

let dbPromise: Promise<DbHandle> | null = null;

async function openDb(): Promise<DbHandle> {
  if (dbPromise) return dbPromise;
  dbPromise = (async () => {
    const isConn = (await sqlite.isConnection(DB_NAME, false)).result;
    if (isConn) {
      return sqlite.retrieveConnection(DB_NAME, false);
    }
    const conn = await sqlite.createConnection(
      DB_NAME,
      false,
      "no-encryption",
      1,
      false,
    );
    await conn.open();
    return conn;
  })();
  return dbPromise;
}

const MIGRATIONS: { version: number; sql: string }[] = [
  {
    version: 1,
    sql: `-- 001_initial.sql
CREATE TABLE dialogue_turns (
  id TEXT PRIMARY KEY,
  timestamp INTEGER NOT NULL,
  user_utterance_json TEXT NOT NULL,
  agent_response_json TEXT NOT NULL,
  user_reaction_json TEXT NOT NULL,
  current_emotion_json TEXT NOT NULL,
  emotion_delta_json TEXT NOT NULL
);
CREATE INDEX idx_turns_ts ON dialogue_turns(timestamp);

CREATE TABLE emotion_snapshots (
  id TEXT PRIMARY KEY,
  timestamp INTEGER NOT NULL,
  turn_id TEXT,
  pad_p REAL NOT NULL,
  pad_a REAL NOT NULL,
  pad_d REAL NOT NULL,
  labels_json TEXT NOT NULL,
  confidence REAL NOT NULL,
  source TEXT NOT NULL,
  FOREIGN KEY (turn_id) REFERENCES dialogue_turns(id)
);
CREATE INDEX idx_snap_ts ON emotion_snapshots(timestamp);

CREATE TABLE soul_state (
  agent_id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  taste_base_json TEXT NOT NULL,
  dynamic_mood_json TEXT NOT NULL,
  proactive_budget_json TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE shared_memory (
  id TEXT PRIMARY KEY,
  timestamp INTEGER NOT NULL,
  song_id TEXT NOT NULL,
  context TEXT NOT NULL,
  significance TEXT NOT NULL
);
CREATE INDEX idx_sm_ts ON shared_memory(timestamp);
CREATE INDEX idx_sm_song ON shared_memory(song_id);

CREATE TABLE library_tracks (
  id TEXT PRIMARY KEY,
  path TEXT NOT NULL UNIQUE,
  origin TEXT NOT NULL CHECK (origin IN ('local','web','generated')),
  title TEXT,
  artist TEXT,
  album TEXT,
  duration_ms INTEGER,
  added_at INTEGER NOT NULL,
  metadata_json TEXT
);
CREATE INDEX idx_tracks_origin ON library_tracks(origin);

CREATE TABLE library_features (
  track_id TEXT PRIMARY KEY,
  bpm REAL,
  energy REAL,
  valence REAL,
  tags_json TEXT,
  embedding_json TEXT,
  FOREIGN KEY (track_id) REFERENCES library_tracks(id) ON DELETE CASCADE
);

CREATE TABLE roadmap (
  id TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL,
  created_by TEXT NOT NULL,
  title TEXT NOT NULL,
  rationale TEXT NOT NULL,
  evidence_json TEXT,
  proposed_change_json TEXT,
  status TEXT NOT NULL,
  priority INTEGER NOT NULL DEFAULT 50,
  effort TEXT
);
CREATE INDEX idx_road_status ON roadmap(status);

CREATE TABLE feature_requests (
  id TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL,
  from_agent TEXT NOT NULL,
  desire TEXT NOT NULL,
  observed_pattern TEXT,
  urgency TEXT NOT NULL,
  consumed INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE events (
  id TEXT PRIMARY KEY,
  timestamp INTEGER NOT NULL,
  kind TEXT NOT NULL,
  producer TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  consumed_by_json TEXT
);
CREATE INDEX idx_events_kind ON events(kind);
CREATE INDEX idx_events_ts ON events(timestamp);

CREATE TABLE engineer_audit (
  id TEXT PRIMARY KEY,
  timestamp INTEGER NOT NULL,
  task_id TEXT NOT NULL,
  phase TEXT NOT NULL,
  payload_json TEXT NOT NULL
);
CREATE INDEX idx_audit_task ON engineer_audit(task_id);`,
  },
  {
    version: 2,
    sql: `CREATE TABLE perception_audit (
  id TEXT PRIMARY KEY,
  ts INTEGER NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('rule','llm')),
  features_json TEXT NOT NULL,
  bias_json TEXT NOT NULL
);
CREATE INDEX idx_perception_audit_ts ON perception_audit(ts);`,
  },
  {
    version: 3,
    sql: `ALTER TABLE soul_state ADD COLUMN perception_tuning_json TEXT NULL;`,
  },
  {
    version: 4,
    sql: `CREATE TABLE library_lyrics_embeddings (
  track_id     TEXT PRIMARY KEY,
  lyrics_hash  TEXT NOT NULL,
  model_id     TEXT NOT NULL,
  dim          INTEGER NOT NULL,
  embedding    BLOB NOT NULL,
  updated_at   INTEGER NOT NULL,
  FOREIGN KEY (track_id) REFERENCES library_tracks(id) ON DELETE CASCADE
);
CREATE INDEX idx_lyrics_emb_model ON library_lyrics_embeddings(model_id);`,
  },
  {
    version: 5,
    sql: `CREATE TABLE llm_usage (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  ts             INTEGER NOT NULL,
  provider       TEXT NOT NULL,
  model          TEXT NOT NULL,
  agent          TEXT,
  input_tokens   INTEGER NOT NULL,
  output_tokens  INTEGER NOT NULL
);
CREATE INDEX idx_llm_usage_ts ON llm_usage(ts);
CREATE INDEX idx_llm_usage_provider ON llm_usage(provider);`,
  },
  {
    version: 6,
    sql: `ALTER TABLE llm_usage ADD COLUMN duration_ms INTEGER;
ALTER TABLE dialogue_turns ADD COLUMN turn_latency_ms INTEGER;
CREATE TABLE reasoning_traces (
  id            TEXT PRIMARY KEY,
  turn_id       TEXT NULL,
  agent_kind    TEXT NOT NULL,
  prompt_text   TEXT NOT NULL,
  raw_response  TEXT NULL,
  parsed_json   TEXT NULL,
  duration_ms   INTEGER NULL,
  ts            INTEGER NOT NULL
);
CREATE INDEX idx_reasoning_ts   ON reasoning_traces(ts DESC);
CREATE INDEX idx_reasoning_turn ON reasoning_traces(turn_id);`,
  },
  {
    version: 7,
    sql: `CREATE TABLE weekly_snapshots (
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
CREATE INDEX idx_weekly_created ON weekly_snapshots(created_at DESC);`,
  },
  {
    version: 8,
    sql: `CREATE TABLE music_profiles (
  track_id TEXT PRIMARY KEY,
  analyzed_at INTEGER NOT NULL,
  llm_model TEXT,
  profile_json TEXT NOT NULL,
  FOREIGN KEY (track_id) REFERENCES library_tracks(id) ON DELETE CASCADE
);
CREATE TABLE track_feedback (
  id TEXT PRIMARY KEY,
  track_id TEXT NOT NULL,
  turn_id TEXT NOT NULL,
  reaction TEXT NOT NULL CHECK (reaction IN ('completed','skipped','repeated','verbal_positive','verbal_negative')),
  timestamp INTEGER NOT NULL,
  emotion_delta_json TEXT NOT NULL,
  FOREIGN KEY (track_id) REFERENCES library_tracks(id) ON DELETE CASCADE,
  FOREIGN KEY (turn_id) REFERENCES dialogue_turns(id)
);
CREATE INDEX idx_tf_track ON track_feedback(track_id);
CREATE INDEX idx_tf_turn ON track_feedback(turn_id);`,
  },
];

async function runMigrations(): Promise<void> {
  const db = await openDb();
  for (const m of MIGRATIONS) {
    try {
      await db.execute(m.sql);
      console.log(`[ios-db] migration v${m.version} applied`);
    } catch (e) {
      // ALTER TABLE may fail if column exists; CREATE TABLE IF NOT EXISTS pattern
      // would be safer, but we mirror desktop exactly and tolerate duplicate errors.
      console.warn(`[ios-db] migration v${m.version} skipped/failed:`, e);
    }
  }
}

export const iosDb = {
  async dbExecute(sql: string, params: unknown[] = []) {
    const db = await openDb();
    return db.run(sql, params);
  },
  async dbSelect(sql: string, params: unknown[] = []) {
    const db = await openDb();
    const result = await db.query(sql, params);
    return result.values ?? [];
  },
  async copyBundledDbIfNeeded() {
    if (!Capacitor.isNativePlatform()) return;
    try {
      await Filesystem.stat({
        path: "lyra.db",
        directory: Directory.Data,
      });
      return; // already exists
    } catch {
      /* not found — copy */
    }

    try {
      const data = await Filesystem.readFile({
        path: "public/lyra.db",
        directory: Directory.Data,
      });
      await Filesystem.writeFile({
        path: "lyra.db",
        data: data.data as string,
        directory: Directory.Data,
      });
    } catch (e) {
      console.warn("[ios-db] bundled db copy skipped:", e);
    }

    try {
      const features = await Filesystem.readFile({
        path: "public/lyra-audio-features.json",
        directory: Directory.Data,
      });
      await Filesystem.writeFile({
        path: "lyra-audio-features.json",
        data: features.data as string,
        directory: Directory.Data,
      });
    } catch (e) {
      console.warn("[ios-db] bundled features copy skipped:", e);
    }
  },
  async ensureMigrations() {
    await runMigrations();
  },
};
