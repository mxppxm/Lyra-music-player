import type {
  ChatMessage,
  ChatOptions,
  ChatResponse,
  ModelProvider,
  ProviderId,
} from "../types";
import { registry as defaultRegistry, ProviderRegistry } from "../providers/registry";
import { RateLimitError } from "../providers/errors";

export type AgentKind =
  | "emotion"
  | "companion"
  | "perception"
  | "music-profile"
  | "lyrics";

export const PRIMARY_FOR: Record<AgentKind, ProviderId> = {
  emotion: "sensenova",
  companion: "sensenova",
  perception: "sensenova",
  "music-profile": "sensenova",
  lyrics: "sensenova",
};

// Chat uses only the free SenseNova gateway — no paid official DeepSeek /
// Zhipu fallbacks, so no third-party LLM billing is ever incurred.
export const FALLBACK_FOR: Record<AgentKind, ProviderId[]> = {
  emotion: [],
  companion: [],
  perception: [],
  "music-profile": [],
  lyrics: [],
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

/** True for a 429 rate-limit failure (typed or detected via the message). */
function isRateLimit(err: unknown): boolean {
  if (err instanceof RateLimitError) return true;
  const msg = err instanceof Error ? err.message : String(err);
  return /\b429\b/.test(msg);
}

/**
 * How long to wait before retrying a 429: the server's retry-after wins;
 * otherwise fall back to a generous fixed wait. Returns ms or null when the
 * error is not a rate limit.
 */
function rateLimitRetryAfterMs(err: unknown): number | null {
  if (err instanceof RateLimitError) return err.retryAfterMs;
  // Some gateways put the hint in the body, e.g. "retry-after: 30s".
  const msg = err instanceof Error ? err.message : String(err);
  const m = /retry[-\s]?after[=: ]\s*(\d+)\s*s?/i.exec(msg);
  if (m) {
    const secs = Number.parseInt(m[1], 10);
    if (Number.isFinite(secs) && secs > 0) return secs * 1000;
  }
  return null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const DEFAULT_MAX_ATTEMPTS = 3; // 1 initial + 2 retries
const BASE_DELAY_MS = 600; // exponential backoff: 600ms → 1200ms → … (cap 5s)
const MAX_DELAY_MS = 5_000;
// 429 is different from a flaky 5xx: the server wants us to wait out a
// throttle window (often 10s~60s), so the 600ms→5s backoff just burns
// retries *inside* the window. Wait retry-after (clamped) instead, with its
// own budget so a sustained throttle never eats the whole provider retry
// budget that ordinary 5xx flakiness still needs.
const RATE_LIMIT_MAX_RETRIES = 3; // 1 initial + 3 rate-limit waits
const RATE_LIMIT_FALLBACK_DELAY_MS = 10_000;
const RATE_LIMIT_MIN_DELAY_MS = 5_000;
const RATE_LIMIT_MAX_DELAY_MS = 30_000;

async function chatWithRetry(
  provider: ModelProvider,
  messages: ChatMessage[],
  opts?: ChatOptions,
): Promise<ChatResponse> {
  const maxAttempts = provider.maxRetries ?? DEFAULT_MAX_ATTEMPTS;
  let lastErr: unknown;
  // Ordinary failures (timeout / 5xx) are capped at maxAttempts; 429 waits
  // get a separate budget so a sustained throttle never starves the
  // flakiness retries, and vice versa.
  let ordinaryAttempts = 0;
  let rateLimitHits = 0;
  while (true) {
    const startedAt = Date.now();
    try {
      const res = await provider.chat(messages, opts);
      console.log(
        `[lyra] provider ${provider.id} responded in ${Date.now() - startedAt}ms (model=${res.model ?? opts?.model ?? "unknown"})`,
      );
      return res;
    } catch (err) {
      lastErr = err;
      const msg = err instanceof Error ? err.message : String(err);
      // Rate-limited: wait out the window (retry-after authoritative), then
      // retry — the ordinary attempts counter stays untouched so a long
      // throttle doesn't consume the backoff budget that 5xx flakiness needs.
      if (isRateLimit(err)) {
        if (rateLimitHits >= RATE_LIMIT_MAX_RETRIES) throw err;
        rateLimitHits++;
        const delay = Math.min(
          Math.max(
            rateLimitRetryAfterMs(err) ?? RATE_LIMIT_FALLBACK_DELAY_MS,
            RATE_LIMIT_MIN_DELAY_MS,
          ),
          RATE_LIMIT_MAX_DELAY_MS,
        );
        console.warn(
          `[lyra] provider ${provider.id} rate-limited (429), waiting ${Math.round(delay / 1000)}s then retrying: ${msg}`,
        );
        await sleep(delay);
        continue;
      }
      // Ordinary failure (timeout / 5xx / network) — bounded by maxAttempts.
      ordinaryAttempts++;
      if (ordinaryAttempts >= maxAttempts || !isRetryable(err)) {
        throw err;
      }
      const delay =
        Math.min(BASE_DELAY_MS * 2 ** (ordinaryAttempts - 1), MAX_DELAY_MS) +
        Math.random() * 200; // jitter
      console.warn(
        `[lyra] provider ${provider.id} call failed (attempt ${ordinaryAttempts}/${maxAttempts}), retrying in ${Math.round(delay)}ms: ${msg}`,
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
  console.log(
    `[lyra] fallback chain: ${providers.map((p) => p.id).join(" → ")}`,
  );
  for (const provider of providers) {
    try {
      const res = await chatWithRetry(provider, messages, opts);
      console.log(
        `[lyra] answer from provider: ${provider.id} (model=${res.model ?? opts?.model ?? "unknown"})`,
      );
      return res;
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
