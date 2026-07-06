import Database from "@tauri-apps/plugin-sql";

export const DB_URL = "sqlite:lyra.db";

let _db: Database | null = null;

export async function getDb(): Promise<Database> {
  if (_db) return _db;
  _db = await Database.load(DB_URL);
  return _db;
}
