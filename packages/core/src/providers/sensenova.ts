import type {
  ModelProvider,
  ChatMessage,
  ChatOptions,
  ChatResponse,
} from "../types";

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
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
    };
    if (opts?.max_tokens != null) body.max_tokens = opts.max_tokens;
    if (opts?.temperature != null) body.temperature = opts.temperature;
    if (opts?.response_format) body.response_format = opts.response_format;
    // SenseNova's gateway only honors the OpenAI-style `thinking` param —
    // `enable_thinking` (Zhipu's knob) is silently ignored and the model
    // still burns time on CoT. Map ChatOptions.enable_thinking=false →
    // thinking:{type:"disabled"}: measured latency 18s → 0.8s on this
    // gateway (2026-08, token.sensenova.cn).
    if (opts?.enable_thinking === false) {
      body.thinking = { type: "disabled" };
    }

    console.log(`[lyra] sensenova request: model=${String(body.model)} (max_tokens=${String(body.max_tokens ?? "-")})`);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

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
        const text = await res.text();
        throw new Error(`Sensenova ${res.status}: ${text}`);
      }

      const data = await res.json();
      const message = data.choices?.[0]?.message;
      // deepseek-v4-flash is a reasoning model: the final answer lands in
      // `content`; when the token budget is fully burned by the CoT phase,
      // `content` can be empty while the thoughts live in `reasoning`
      // (older DeepSeek responses used `reasoning_content` — keep both).
      const content: string =
        message?.content?.trim() ||
        message?.reasoning_content?.trim() ||
        message?.reasoning?.trim() ||
        "";
      const usage = data.usage
        ? {
            input_tokens: data.usage.prompt_tokens ?? 0,
            output_tokens: data.usage.completion_tokens ?? 0,
          }
        : undefined;

      return { content, model: opts?.model ?? this.defaultModel, usage, raw: data };
    } catch (err) {
      if (controller.signal.aborted) {
        throw new Error(`Sensenova request timed out after ${TIMEOUT_MS / 1000}s`);
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }
}
