import type { LyraPlatform } from "@lyra/platform";
import { iosFetchJson } from "./http.ts";
import { iosDb } from "./db.ts";
import { iosSecrets } from "./secrets.ts";
import { iosFiles } from "./files.ts";

const audioStub = {
  playUrl: async () => {
    throw new Error("iOS audio not wired yet");
  },
  playFile: async () => {
    throw new Error("iOS audio not wired yet");
  },
  stop: async () => {},
  pause: async () => {},
  resume: async () => {},
  isPlaying: async () => false,
  getPosition: async () => null,
  onComplete: () => () => {},
};

export function createIosPlatform(): LyraPlatform {
  return {
    ...audioStub,
    ...iosDb,
    fetchJson: iosFetchJson,
    ...iosSecrets,
    ...iosFiles,
  };
}
