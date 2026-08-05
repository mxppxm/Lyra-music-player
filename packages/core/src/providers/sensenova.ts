import type {
  ModelProvider,
  ChatMessage,
  ChatOptions,
  ChatResponse,
} from "../types";

const DEFAULT_MODEL = "deepseek-v4-flash";
// SenseNova OpenAI-compatible gateway. Replaces the retired fxb gateway
// (fxb.supa.net.cn:6443 — no CORS preflight support + 37% requests hung 50s+).
// Standard 443 port; measured latency 0.5~3s, stable.
// CSP connect-src allowlist in tauri.conf.json must include this host.
const ENDPOINT = "https://token.sensenova.cn/v1/chat/completions";
/**
 * Per-request timeout — the gateway is stable (0.5~3s measured), so 15s is a
 * 5x safety margin. Tight on purpose: with maxRetries=6 the worst-case wait
 * stays ~90s instead of multi-minute, so a hung gateway degrades to a
 * fallback (DeepSeek official) without an eternity of silence.
 */
const TIMEOUT_MS = 15_000;

/**
 * SensenovaProvider — OpenAI-compatible gateway (token.sensenova.cn) serving
 * deepseek-v4-flash. Default provider per routing §3.5.
 */
export class SensenovaProvider implements ModelProvider {
  readonly id = "sensenova" as const;
  // Cheap/free gateway — retry generously (1 + 5 backoffs ≈ 90s worst case)
  // so the paid fallbacks (DeepSeek official) are only hit when sensenova is
  // fully down. Budget is balanced with Orchestrator's 180s turn timeout:
  // 6×15s sensenova + 3×30s fallback ≈ 180s.
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
      // deepseek-v4-flash is a reasoning model: the final answer lands in
      // `content`; when the token budget is fully burned by the CoT phase,
      // `content` can be empty while `reasoning_content` holds the thoughts.
      const content: string =
        message?.content?.trim() || message?.reasoning_content?.trim() || "";
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
