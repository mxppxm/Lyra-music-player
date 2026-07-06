import type { ModelProvider, ProviderId } from "../types";
import { registry as defaultRegistry, ProviderRegistry } from "../providers/registry";

export type AgentKind = "emotion" | "companion";

export const PRIMARY_FOR: Record<AgentKind, ProviderId> = {
  emotion: "zhipu",
  companion: "anthropic",
};

export const FALLBACK_FOR: Record<AgentKind, ProviderId> = {
  emotion: "deepseek",
  companion: "zhipu",
};

export function routeProvider(
  kind: AgentKind,
  r: ProviderRegistry = defaultRegistry,
): ModelProvider {
  const primary = PRIMARY_FOR[kind];
  if (r.has(primary)) return r.get(primary);
  const fallback = FALLBACK_FOR[kind];
  if (r.has(fallback)) return r.get(fallback);
  throw new Error(`no provider registered for agent ${kind}`);
}
