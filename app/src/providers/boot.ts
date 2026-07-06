import { getSecret, SECRET_KEYS } from "../settings/secrets";
import { AnthropicProvider } from "./anthropic";
import { DeepSeekProvider } from "./deepseek";
import { registry } from "./registry";

export interface BootReport {
  anthropic: boolean;
  deepseek: boolean;
}

/**
 * bootProviders — reads API keys from keychain and registers available
 * providers into the global registry. Called once at app startup.
 *
 * Returns a report indicating which providers were successfully registered.
 * Providers whose keys are absent or empty are silently skipped.
 */
export async function bootProviders(): Promise<BootReport> {
  const report: BootReport = { anthropic: false, deepseek: false };

  const [anthropicKey, deepseekKey] = await Promise.all([
    getSecret(SECRET_KEYS.anthropicApiKey).catch(() => null),
    getSecret(SECRET_KEYS.deepseekApiKey).catch(() => null),
  ]);

  if (anthropicKey) {
    registry.register(new AnthropicProvider({ apiKey: anthropicKey }));
    report.anthropic = true;
  }

  if (deepseekKey) {
    registry.register(new DeepSeekProvider({ apiKey: deepseekKey }));
    report.deepseek = true;
  }

  return report;
}
