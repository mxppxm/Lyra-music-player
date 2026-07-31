import "@testing-library/jest-dom/vitest";
import { setLyraPlatform } from "@lyra/platform";
import type { LyraPlatform } from "@lyra/platform";

const testPlatform: LyraPlatform = {
  playUrl: async () => 1,
  playFile: async () => 1,
  stop: async () => {},
  pause: async () => {},
  resume: async () => {},
  isPlaying: async () => false,
  getPosition: async () => null,
  onComplete: () => () => {},
  fetchJson: async () => ({}),
  dbExecute: async () => ({ rowsAffected: 0 }),
  dbSelect: async () => [],
  copyBundledDbIfNeeded: async () => {},
  ensureMigrations: async () => {},
  getSecret: async () => null,
  setSecret: async () => {},
  deleteSecret: async () => {},
  appDataDir: async () => "/tmp/lyra-test",
  readFeatureCache: async () => ({}),
  writeFeatureCache: async () => {},
  readTextFile: async () => null,
  writeTextFile: async () => {},
};

setLyraPlatform(testPlatform);
