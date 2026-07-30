import { invoke } from "@tauri-apps/api/core";
import type { LyraPlatform } from "@lyra/platform";

export const desktopFiles: Pick<
  LyraPlatform,
  | "appDataDir"
  | "readFeatureCache"
  | "writeFeatureCache"
  | "readTextFile"
  | "writeTextFile"
> = {
  async appDataDir() {
    return invoke<string>("get_app_data_dir");
  },
  async readFeatureCache() {
    try {
      const json = await invoke<string>("feature_cache_read");
      return JSON.parse(json);
    } catch {
      return {};
    }
  },
  async writeFeatureCache(content) {
    await invoke("feature_cache_write", {
      content: JSON.stringify(content, null, 2),
    });
  },
  async readTextFile(relativePath) {
    if (relativePath === "memory.md") {
      try {
        return await invoke<string>("memory_file_read");
      } catch {
        return null;
      }
    }
    return null;
  },
  async writeTextFile(relativePath, content) {
    if (relativePath === "memory.md") {
      await invoke("memory_file_write", { content });
    }
  },
};
