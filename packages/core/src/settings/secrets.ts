export const SECRET_KEYS = {
  anthropicApiKey: "provider.anthropic.apiKey",
  deepseekApiKey: "provider.deepseek.apiKey",
  zhipuApiKey: "provider.zhipu.apiKey",
  fxbApiKey: "provider.fxb.apiKey",
  dreamDailyTime: "dream.dailyTime",
  dreamIdleMinutes: "dream.idleMinutes",
  perceptionEnabled: "perception.enabled",
  perceptionMode: "perception.mode",
  embeddingProvider: "embedding.provider",
  zhipuEmbeddingApiKey: "embedding.zhipu.apiKey",
  openaiApiKey: "embedding.openai.apiKey",
  weeklyDirOverride: "weekly.dirOverride",
  weeklyAutoEnabled: "weekly.autoEnabled",
  weatherEnabled: "perception.weatherEnabled",
  weatherLat: "perception.weatherLat",
  weatherLon: "perception.weatherLon",
} as const;

export async function setSecret(key: string, value: string): Promise<void> {
  const { getLyraPlatform } = await import("@lyra/platform");
  await getLyraPlatform().setSecret(key, value);
}

export async function getSecret(key: string): Promise<string | null> {
  const { getLyraPlatform } = await import("@lyra/platform");
  return getLyraPlatform().getSecret(key);
}

export async function deleteSecret(key: string): Promise<void> {
  const { getLyraPlatform } = await import("@lyra/platform");
  await getLyraPlatform().deleteSecret(key);
}
