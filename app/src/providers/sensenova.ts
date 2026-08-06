import type {
  ModelProvider,
  ChatMessage,
  ChatOptions,
  ChatResponse,
} from "../types";

const DEFAULT_MODEL = "sensenova-6.7-flash-lite";
// SenseNova OpenAI-compatible gateway. Replaces the retired fxb gateway
// (fxb.supa.net.cn:6443 — no CORS preflight support + 37% requests hung 50s+).
// Standard 443 port; measured latency 0.5~3s, stable.
// CSP connect-src allowlist in tauri.conf.json must include this host.
//
// Default model is SenseNova's own free-tier `sensenova-6.7-flash-lite`
// (NOT DeepSeek's paid `deepseek-v4-flash`) so this provider costs nothing.
const ENDPOINT = "https://token.sensenova.cn/v1/chat/completions";
/**
 * Per-request timeout — the gateway is stable (0.5~3s measured), so 40s is a
 * generous safety margin so a slow reasoning pass doesn't get cut short.
 */
const TIMEOUT_MS = 40_000;

/**
 * SensenovaProvider — OpenAI-compatible gateway (token.sensenova.cn) serving
 * sensenova-6.7-flash-lite (SenseNova's free model). Default provider per
 * routing §3.5.
 */
export class SensenovaProvider implements ModelProvider {
  readonly id = "sensenova" as const;
  // Cheap/free gateway — retry generously.
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
      // sensenova-6.7-flash-lite is a reasoning model: the final answer lands in
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