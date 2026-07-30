import { invoke } from "@tauri-apps/api/core";
import type { LyraPlatform } from "@lyra/platform";

export const desktopSecrets: Pick<
  LyraPlatform,
  "getSecret" | "setSecret" | "deleteSecret"
> = {
  async getSecret(key) {
    const v = await invoke<string | null>("secret_get", { key });
    return v ?? null;
  },
  setSecret(key, value) {
    return invoke("secret_set", { key, value });
  },
  deleteSecret(key) {
    return invoke("secret_delete", { key });
  },
};
