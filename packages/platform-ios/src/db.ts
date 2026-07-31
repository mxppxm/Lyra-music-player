import { CapacitorSQLite, SQLiteConnection } from "@capacitor-community/sqlite";
import { Capacitor } from "@capacitor/core";
import { Filesystem, Directory } from "@capacitor/filesystem";

const sqlite = new SQLiteConnection(CapacitorSQLite);
const DB_NAME = "lyra";

async function openDb() {
  const isConn = (await sqlite.isConnection(DB_NAME, false)).result;
  if (isConn) {
    return sqlite.retrieveConnection(DB_NAME, false);
  }
  return sqlite.createConnection(DB_NAME, false, "no-encryption", 1, false);
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
};
