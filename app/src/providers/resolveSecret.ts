import { getSecret } from "../settings/secrets";
import { getBundledSecret } from "./bundledKeys";

/**
 * Keychain first (user override), then build-time bundled key.
 * Used by bootProviders and optional embedding paths.
 */
export async function resolveSecret(key: string): Promise<string | null> {
  try {
    const fromKeychain = await getSecret(key);
    if (fromKeychain?.trim()) return fromKeychain.trim();
  } catch {
    // keychain locked / unavailable — fall through to bundled
  }
  return getBundledSecret(key);
}
