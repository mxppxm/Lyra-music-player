import Database from "@tauri-apps/plugin-sql";
import type { LyraPlatform } from "@lyra/platform";

let _db: Database | null = null;

async function db(): Promise<Database> {
  if (!_db) _db = await Database.load("sqlite:lyra.db");
  return _db;
}

export const desktopDb: Pick<
  LyraPlatform,
  "dbExecute" | "dbSelect" | "copyBundledDbIfNeeded" | "ensureMigrations"
> = {
  async dbExecute(sql, params = []) {
    const d = await db();
    return d.execute(sql, params);
  },
  async dbSelect(sql, params = []) {
    const d = await db();
    return d.select(sql, params);
  },
  async copyBundledDbIfNeeded() {
    /* desktop: Tauri resources copy handled at boot — no-op */
  },
  async ensureMigrations() {
    /* desktop: Tauri plugin runs migrations at load — no-op */
  },
};
