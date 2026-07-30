import { getLyraPlatform } from "@lyra/platform";

export const DB_URL = "sqlite:lyra.db";

interface DbLike {
  select<T = unknown>(sql: string, params?: unknown[]): Promise<T>;
  execute(sql: string, params?: unknown[]): Promise<{ rowsAffected?: number }>;
}

export async function getDb(): Promise<DbLike> {
  const platform = getLyraPlatform();
  return {
    select: <T = unknown>(sql: string, params?: unknown[]) =>
      platform.dbSelect(sql, params) as Promise<T>,
    execute: (sql: string, params?: unknown[]) =>
      platform.dbExecute(sql, params).then(
        (r) => (r ?? {}) as { rowsAffected?: number },
      ),
  };
}

export function invalidateDb(): void {
  /* platform manages connection */
}
