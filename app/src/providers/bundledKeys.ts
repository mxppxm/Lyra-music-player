import { SECRET_KEYS } from "../settings/secrets";
import { isZeroConfigRelease } from "../config/zeroConfig";

type SecretKey = (typeof SECRET_KEYS)[keyof typeof SECRET_KEYS];

/** Build-time provider keys (Vite `VITE_*`, inlined at compile time). */
const BUNDLED: Partial<Record<SecretKey, string | undefined>> = {
  [SECRET_KEYS.anthropicApiKey]: import.meta.env.VITE_ANTHROPIC_API_KEY,
  [SECRET_KEYS.deepseekApiKey]: import.meta.env.VITE_DEEPSEEK_API_KEY,
  [SECRET_KEYS.zhipuApiKey]: import.meta.env.VITE_ZHIPU_API_KEY,
  [SECRET_KEYS.fxbApiKey]: import.meta.env.VITE_FXB_API_KEY,
  [SECRET_KEYS.sensenovaApiKey]: import.meta.env.VITE_SENSENOVA_API_KEY,
  [SECRET_KEYS.zhipuEmbeddingApiKey]: import.meta.env.VITE_ZHIPU_EMBEDDING_API_KEY,
  [SECRET_KEYS.openaiApiKey]: import.meta.env.VITE_OPENAI_API_KEY,
};

const PROVIDER_KEYS: SecretKey[] = [
  SECRET_KEYS.anthropicApiKey,
  SECRET_KEYS.deepseekApiKey,
  SECRET_KEYS.zhipuApiKey,
  SECRET_KEYS.sensenovaApiKey,
];

export function getBundledSecret(key: string): string | null {
  const raw = BUNDLED[key as SecretKey];
  const trimmed = typeof raw === "string" ? raw.trim() : "";
  return trimmed || null;
}

export function hasBundledProviders(): boolean {
  return PROVIDER_KEYS.some((k) => Boolean(getBundledSecret(k)));
}

/** Default embedding provider when a bundled embedding key exists. */
export function bundledEmbeddingProvider(): "" | "zhipu" | "openai" {
  if (getBundledSecret(SECRET_KEYS.zhipuEmbeddingApiKey)) return "zhipu";
  if (getBundledSecret(SECRET_KEYS.openaiApiKey)) return "openai";
  if (isZeroConfigRelease() && getBundledSecret(SECRET_KEYS.zhipuApiKey)) {
    return "zhipu";
  }
  return "";
}

/** Embedding key: dedicated bundled key, or reuse zhipu chat key in zero-config. */
export function bundledEmbeddingKey(provider: "zhipu" | "openai"): string | null {
  if (provider === "zhipu") {
    return (
      getBundledSecret(SECRET_KEYS.zhipuEmbeddingApiKey) ??
      getBundledSecret(SECRET_KEYS.zhipuApiKey)
    );
  }
  return getBundledSecret(SECRET_KEYS.openaiApiKey);
}
