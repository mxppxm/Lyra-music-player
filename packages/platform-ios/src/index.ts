import type { LyraPlatform } from "@lyra/platform";
import { iosFetchJson } from "./http.ts";
import { iosDb } from "./db.ts";
import { iosSecrets } from "./secrets.ts";
import { iosFiles } from "./files.ts";
import { iosAudio } from "./audio.ts";
import { patchFetchForCors } from "./corsPatch.ts";

export { LyraAudio } from "./nativeAudio.ts";
export type { RemoteCommand } from "./nativeAudio.ts";

export function createIosPlatform(): LyraPlatform {
  // fxb/sensenova gateways fail CORS preflight; route them through native
  // URLSession (see corsPatch.ts).
  patchFetchForCors();
  return {
    ...iosAudio,
    ...iosDb,
    fetchJson: iosFetchJson,
    ...iosSecrets,
    ...iosFiles,
  };
}
