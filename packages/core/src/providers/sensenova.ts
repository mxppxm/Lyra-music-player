import type {
  ModelProvider,
  ChatMessage,
  ChatOptions,
  ChatResponse,
  ChatToolCall,
} from "../types";
import { RateLimitError } from "./errors";

const DEFAULT_MODEL = "deepseek-v4-flash";
// SenseNova OpenAI-compatible gateway. Replaces the retired fxb gateway
// (fxb.supa.net.cn:6443 — no CORS preflight support + 37% requests hung 50s+).
// Standard 443 port. Latency is bursty — measured 0.5~21s TTFB (2026-08) — so
// CoT is disabled by default (see chat()) and the retry/fallback layer in
// agents/route.ts absorbs the tail.
// CSP connect-src allowlist in tauri.conf.json must include this host.
//
// Default model: gateway-proxied `deepseek-v4-flash`（用户指定优先 flash）。
const ENDPOINT = "https://token.sensenova.cn/v1/chat/completions";
/**
 * Per-request timeout — the gateway is stable (0.5~3s measured), so 20s is a
 * generous safety margin so a slow reasoning pass doesn't get cut short.
 */
const TIMEOUT_MS = 20_000;
/** Thinking pass was measured ~18s; lyrics retry also triples max_tokens. */
const THINKING_TIMEOUT_MS = 60_000;

/** Cap error bodies surfaced to the UI — full gateway JSON blobs (error
 *  details, request ids, …) are why the note overflowed the small-note box. */
const MAX_ERROR_BODY_CHARS = 240;

function parseRetryAfter(header: string | null): number | null {
  if (!header) return null;
  const trimmed = header.trim();
  // Delta-seconds form: "Retry-After: 30"
  const secs = Number.parseInt(trimmed, 10);
  if (Number.isFinite(secs) && secs > 0) return secs * 1000;
  // HTTP-date form: "Retry-After: Wed, 21 Oct 2015 07:28:00 GMT"
  const when = Date.parse(trimmed);
  if (Number.isFinite(when)) {
    const ms = when - Date.now();
    return ms > 0 ? ms : null;
  }
  return null;
}

function toApiMessage(m: ChatMessage): Record<string, unknown> {
  const out: Record<string, unknown> = { role: m.role, content: m.content };
  if (m.tool_call_id) out.tool_call_id = m.tool_call_id;
  if (m.tool_calls?.length) out.tool_calls = m.tool_calls;
  if (m.reasoning_content) out.reasoning_content = m.reasoning_content;
  return out;
}

function parseToolCalls(raw: unknown): ChatToolCall[] | undefined {
  if (!Array.isArray(raw) || raw.length === 0) return undefined;
  const calls: ChatToolCall[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const o = item as {
      id?: string;
      function?: { name?: string; arguments?: string };
    };
    if (!o.id || !o.function?.name) continue;
    calls.push({
      id: o.id,
      type: "function",
      function: {
        name: o.function.name,
        arguments: o.function.arguments ?? "{}",
      },
    });
  }
  return calls.length ? calls : undefined;
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max)}…`;
}

/**
 * SensenovaProvider — OpenAI-compatible gateway (token.sensenova.cn) serving
 * deepseek-v4-flash（用户指定，flash 优先）。Default provider per routing §3.5.
 */
export class SensenovaProvider implements ModelProvider {
  readonly id = "sensenova" as const;
  // Cheap/free gateway — retry generously so the paid fallbacks (DeepSeek
  // official) are only hit when sensenova is fully down. At 40s/request, 6
  // retries alone could reach ~240s, so Orchestrator's 180s turn timeout is
  // the practical ceiling (see Orchestrator.ts).
  readonly maxRetries = 6;
  private apiKey: string;
  private defaultModel: string;

  constructor(opts: { apiKey: string; model?: string }) {
    if (!opts.apiKey) throw new Error("SensenovaProvider requires apiKey");
    this.apiKey = opts.apiKey;
    this.defaultModel = opts.model ?? DEFAULT_MODEL;
  }

  async chat(messages: ChatMessage[], opts?: ChatOptions): Promise<ChatResponse> {
    const body: Record<string, unknown> = {
      model: opts?.model ?? this.defaultModel,
      messages: messages.map(toApiMessage),
    };
    if (opts?.max_tokens != null) body.max_tokens = opts.max_tokens;
    if (opts?.temperature != null) body.temperature = opts.temperature;
    if (opts?.response_format) body.response_format = opts.response_format;
    if (opts?.tools?.length) body.tools = opts.tools;
    if (opts?.tool_choice && opts.tool_choice !== "auto") {
      body.tool_choice = opts.tool_choice;
    }
    // SenseNova's gateway only honors the OpenAI-style `thinking` param —
    // `enable_thinking` (Zhipu's knob) is silently ignored and the model
    // still burns time on CoT. Map ChatOptions.enable_thinking=false →
    // thinking:{type:"disabled"}: measured latency 18s → 0.8s on this
    // gateway (2026-08, token.sensenova.cn).
    if (opts?.enable_thinking === false) {
      body.thinking = { type: "disabled" };
    }

    console.log(`[lyra] sensenova request: model=${String(body.model)} (max_tokens=${String(body.max_tokens ?? "-")})`);

    const timeoutMs =
      opts?.enable_thinking === true ? THINKING_TIMEOUT_MS : TIMEOUT_MS;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(ENDPOINT, {
        method: "POST",
        headers: {
          authorization: `Bearer ${this.apiKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!res.ok) {
        const text = truncate(await res.text(), MAX_ERROR_BODY_CHARS);
        // 429 = gateway RPM throttle (free tier). Carry retry-after so the
        // retry layer waits out the window instead of hammering inside it.
        if (res.status === 429) {
          throw new RateLimitError(
            `Sensenova 429: ${text}`,
            parseRetryAfter(res.headers.get("retry-after")),
          );
        }
        throw new Error(`Sensenova ${res.status}: ${text}`);
      }

      const data = await res.json();
      const message = data.choices?.[0]?.message;
      const tool_calls = parseToolCalls(message?.tool_calls);
      const reasoning =
        (typeof message?.reasoning_content === "string" &&
          message.reasoning_content.trim()) ||
        (typeof message?.reasoning === "string" && message.reasoning.trim()) ||
        undefined;
      // When the model is calling a tool, content is often empty — do not
      // fall back to CoT text (that would leak reasoning into lyrics).
      const content: string = tool_calls?.length
        ? (typeof message?.content === "string" ? message.content : "")
        : message?.content?.trim() || reasoning || "";
      const usage = data.usage
        ? {
            input_tokens: data.usage.prompt_tokens ?? 0,
            output_tokens: data.usage.completion_tokens ?? 0,
          }
        : undefined;

      return {
        content,
        tool_calls,
        reasoning_content: reasoning,
        model: opts?.model ?? this.defaultModel,
        usage,
        raw: data,
      };
    } catch (err) {
      if (controller.signal.aborted) {
        throw new Error(
          `Sensenova request timed out after ${timeoutMs / 1000}s`,
        );
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }
}
