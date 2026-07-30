import type { ModelProvider, ProviderId } from "../types";
import { registry as defaultRegistry, ProviderRegistry } from "../providers/registry";

export type AgentKind = "emotion" | "companion" | "perception" | "music-profile";

export const PRIMARY_FOR: Record<AgentKind, ProviderId> = {
  emotion: "zhipu",
  companion: "anthropic",
  perception: "zhipu",
  "music-profile": "zhipu",
};

export const FALLBACK_FOR: Record<AgentKind, ProviderId[]> = {
  emotion: ["deepseek"],
  companion: ["zhipu", "deepseek"],
  perception: ["deepseek"],
  "music-profile": ["deepseek"],
};

export function routeProvider(
  kind: AgentKind,
  r: ProviderRegistry = defaultRegistry,
): ModelProvider {
  const primary = PRIMARY_FOR[kind];
  if (r.has(primary)) return r.get(primary);
  const fallbacks = FALLBACK_FOR[kind];
  for (const fb of fallbacks) {
    if (r.has(fb)) return r.get(fb);
  }
  throw new Error(`no provider registered for agent ${kind}`);
}
