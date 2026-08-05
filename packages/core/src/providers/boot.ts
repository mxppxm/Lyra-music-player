import type { ProviderId } from "../types";
import { SECRET_KEYS } from "../settings/secrets";
import { resolveSecret } from "./resolveSecret";
import { AnthropicProvider } from "./anthropic";
import { DeepSeekProvider } from "./deepseek";
import { ZhipuProvider } from "./zhipu";
import { SensenovaProvider } from "./sensenova";
import { registry } from "./registry";
import { withUsageLogging } from "./usageLogging";

export type SkipReason = "no-key" | "keychain-error";

export interface BootReport {
  registered: ProviderId[];
  skipped: { id: ProviderId; reason: SkipReason }[];
}

type ProviderSpec = {
  id: ProviderId;
  keyName: string;
  build: (apiKey: string) => void;
};

const SPECS: ProviderSpec[] = [
  {
    id: "anthropic",
    keyName: SECRET_KEYS.anthropicApiKey,
    build: (apiKey) =>
      registry.register(withUsageLogging(new AnthropicProvider({ apiKey }))),
  },
  {
    id: "deepseek",
    keyName: SECRET_KEYS.deepseekApiKey,
    build: (apiKey) =>
      registry.register(withUsageLogging(new DeepSeekProvider({ apiKey }))),
  },
  {
    id: "zhipu",
    keyName: SECRET_KEYS.zhipuApiKey,
    build: (apiKey) =>
      registry.register(withUsageLogging(new ZhipuProvider({ apiKey }))),
  },
  {
    id: "sensenova",
    keyName: SECRET_KEYS.sensenovaApiKey,
    build: (apiKey) =>
      registry.register(withUsageLogging(new SensenovaProvider({ apiKey }))),
  },
];

/**
 * bootProviders — reads API keys from keychain, then build-time bundled keys,
 * and registers available providers into the global registry.
 * Called once at app startup.
 *
 * Returns { registered, skipped } — skipped carries a reason so the UI
 * can distinguish "no key configured" from "keychain locked / IPC failure".
 * Open list of providers: adding a new one only requires appending to SPECS.
 */
export async function bootProviders(): Promise<BootReport> {
  const registered: ProviderId[] = [];
  const skipped: { id: ProviderId; reason: SkipReason }[] = [];

  await Promise.all(
    SPECS.map(async (spec) => {
      let key: string | null;
      try {
        key = await resolveSecret(spec.keyName);
      } catch {
        skipped.push({ id: spec.id, reason: "keychain-error" });
        return;
      }
      if (!key) {
        skipped.push({ id: spec.id, reason: "no-key" });
        return;
      }
      spec.build(key);
      registered.push(spec.id);
    }),
  );

  // Sort for stable output regardless of Promise resolution order.
  registered.sort();
  skipped.sort((a, b) => a.id.localeCompare(b.id));
  return { registered, skipped };
}
