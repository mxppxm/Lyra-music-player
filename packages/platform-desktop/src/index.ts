import type { LyraPlatform } from "@lyra/platform";
import { desktopAudio } from "./audio.ts";
import { desktopDb } from "./db.ts";
import { desktopFetchJson } from "./http.ts";
import { desktopSecrets } from "./secrets.ts";
import { desktopFiles } from "./files.ts";

export function createDesktopPlatform(): LyraPlatform {
  return {
    ...desktopAudio,
    ...desktopDb,
    fetchJson: desktopFetchJson,
    ...desktopSecrets,
    ...desktopFiles,
  };
}
