import { getLyraPlatform } from "@lyra/platform";

interface DbLike {
  select<T = unknown[]>(sql: string, params?: unknown[]): Promise<T>;
  execute(sql: string, params?: unknown[]): Promise<{ rowsAffected?: number }>;
}

class PlatformDb implements DbLike {
  async select<T = unknown[]>(sql: string, params?: unknown[]): Promise<T> {
    return getLyraPlatform().dbSelect(sql, params) as Promise<T>;
  }

  async execute(
    sql: string,
    params?: unknown[],
  ): Promise<{ rowsAffected?: number }> {
    const result = await getLyraPlatform().dbExecute(sql, params);
    return (result ?? {}) as { rowsAffected?: number };
  }
}

export async function getDb(): Promise<DbLike> {
  return new PlatformDb();
}

export function invalidateDb(): void {
  /* platform manages connection */
}
