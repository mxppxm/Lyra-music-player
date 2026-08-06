import type {
  ChatMessage,
  ChatOptions,
  ChatResponse,
  ModelProvider,
  ProviderId,
} from "../types";
import { registry as defaultRegistry, ProviderRegistry } from "../providers/registry";

export type AgentKind = "emotion" | "companion" | "perception" | "music-profile";

export const PRIMARY_FOR: Record<AgentKind, ProviderId> = {
  emotion: "sensenova",
  companion: "sensenova",
  perception: "sensenova",
  "music-profile": "sensenova",
};

// Chat uses only the free SenseNova gateway — no paid official DeepSeek /
// Zhipu / fxb fallbacks, so no third-party LLM billing is ever incurred.
export const FALLBACK_FOR: Record<AgentKind, ProviderId[]> = {
  emotion: [],
  companion: [],
  perception: [],
  "music-profile": [],
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

/**
 * Resolve the full provider chain for an agent kind:
 * [primary, ...registered fallbacks] (deduped, in routing order).
 * Unlike `routeProvider` (which returns only the first registered provider),
 * this keeps the whole chain so a failing primary can fall back to a
 * secondary provider at call time — the fix for "fxb 已注册但调用超时不会切
 * deepseek，直接报 llm failed".
 */
export function resolveProviders(
  kind: AgentKind,
  r: ProviderRegistry = defaultRegistry,
): ModelProvider[] {
  const seen = new Set<ProviderId>();
  const chain: ProviderId[] = [];
  for (const id of [PRIMARY_FOR[kind], ...FALLBACK_FOR[kind]]) {
    if (seen.has(id)) continue;
    seen.add(id);
    chain.push(id);
  }
  const providers: ModelProvider[] = [];
  for (const id of chain) {
    if (r.has(id)) providers.push(r.get(id));
  }
  if (providers.length === 0) {
    throw new Error(`no provider registered for agent ${kind}`);
  }
  return providers;
}

/** Whether an error is worth retrying (transient network/server trouble). */
function isRetryable(err: unknown): boolean {
  // fetch abort (timeout) — most common failure on the flaky fxb gateway
  if (typeof DOMException !== "undefined" && err instanceof DOMException) {
    if (err.name === "AbortError") return true;
  }
  // network-level failure (fetch itself threw, e.g. TypeError: fetch failed)
  if (err instanceof TypeError) return true;
  const msg = err instanceof Error ? err.message : String(err);
  if (/timed out|timeout|abort|ECONNRESET|socket hang up|fetch failed/i.test(msg)) {
    return true;
  }
  // server-side (5xx) / rate-limit (429) — transient by nature
  if (/\b(5\d\d|429)\b/.test(msg)) return true;
  // 4xx (401/400/403) and anything else: do NOT burn retry budget — let the
  // fallback provider chain take over or surface the real error.
  return false;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const MAX_ATTEMPTS_PER_PROVIDER = 3; // 1 initial + 2 retries
const BASE_DELAY_MS = 600; // exponential backoff: 600ms → 1200ms → (cap 5s)
const MAX_DELAY_MS = 5_000;

async function chatWithRetry(
  provider: ModelProvider,
  messages: ChatMessage[],
  opts?: ChatOptions,
): Promise<ChatResponse> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS_PER_PROVIDER; attempt++) {
    try {
      return await provider.chat(messages, opts);
    } catch (err) {
      lastErr = err;
      const msg = err instanceof Error ? err.message : String(err);
      if (attempt >= MAX_ATTEMPTS_PER_PROVIDER || !isRetryable(err)) {
        throw err;
      }
      const delay =
        Math.min(BASE_DELAY_MS * 2 ** (attempt - 1), MAX_DELAY_MS) +
        Math.random() * 200; // jitter
      console.warn(
        `[lyra] provider ${provider.id} call failed (attempt ${attempt}/${MAX_ATTEMPTS_PER_PROVIDER}), retrying in ${Math.round(delay)}ms: ${msg}`,
      );
      await sleep(delay);
    }
  }
  throw lastErr;
}

/**
 * Chat with resilience: retries each provider with exponential backoff, and
 * if a provider exhausts its retries, moves down the chain (primary → fallback).
 * This is what makes the "llm failed" symptom disappear when the fxb gateway
 * stutters — one slow/timed-out call no longer kills the whole turn.
 */
export async function chatWithFallback(
  providers: ModelProvider[],
  messages: ChatMessage[],
  opts?: ChatOptions,
): Promise<ChatResponse> {
  let lastErr: unknown;
  for (const provider of providers) {
    try {
      return await chatWithRetry(provider, messages, opts);
    } catch (err) {
      lastErr = err;
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(
        `[lyra] provider ${provider.id} failed after retries, falling back to next provider: ${msg}`,
      );
    }
  }
  if (lastErr instanceof Error) throw lastErr;
  throw new Error(String(lastErr));
}
