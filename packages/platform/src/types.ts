export interface LyraPlatform {
  playUrl(url: string, durationMs?: number | null): Promise<number>;
  playFile(path: string, durationMs?: number | null): Promise<number>;
  stop(): Promise<void>;
  pause(): Promise<void>;
  resume(): Promise<void>;
  isPlaying(): Promise<boolean>;
  getPosition(): Promise<[number, number] | null>;
  onComplete(cb: (playbackId: number) => void): () => void;

  fetchJson(url: string, init?: RequestInit): Promise<unknown>;

  dbExecute(sql: string, params?: unknown[]): Promise<unknown>;
  dbSelect<T = Record<string, unknown>>(
    sql: string,
    params?: unknown[],
  ): Promise<T[]>;
  copyBundledDbIfNeeded(): Promise<void>;
  ensureMigrations(): Promise<void>;

  getSecret(key: string): Promise<string | null>;
  setSecret(key: string, value: string): Promise<void>;
  deleteSecret(key: string): Promise<void>;

  appDataDir(): Promise<string>;

  readFeatureCache(): Promise<Record<string, unknown>>;
  writeFeatureCache(content: Record<string, unknown>): Promise<void>;
  readTextFile(relativePath: string): Promise<string | null>;
  writeTextFile(relativePath: string, content: string): Promise<void>;
}

let _platform: LyraPlatform | null = null;

export function setLyraPlatform(p: LyraPlatform): void {
  _platform = p;
}

export function getLyraPlatform(): LyraPlatform {
  if (!_platform) throw new Error("LyraPlatform not initialized");
  return _platform;
}
