import type {
  ModelProvider,
  ChatMessage,
  ChatOptions,
  ChatResponse,
} from "../types";

const DEFAULT_MODEL = "deepseek-v4-flash";
// Hard-coded to match the CSP connect-src allowlist in tauri.conf.json.
// If this ever changes, update the CSP simultaneously.
const ENDPOINT = "https://fxb.supa.net.cn:6443/v1/chat/completions";
/**
 * Per-request timeout — prevents infinite thinking when the API hangs.
 * 30s → 15s: the fxb gateway is flaky (0.5s~20s+ latency); a tighter timeout
 * lets the retry/fallback layer (agents/route.ts chatWithFallback) kick in
 * sooner instead of stalling the whole turn.
 * 15s → 45s: measured gateway latency is 0.5s~16s+ (bursty); 15s sat exactly
 * on the slow-tail boundary and caused spurious timeouts on device.
 */
const TIMEOUT_MS = 45_000;

/**
 * FxbProvider — OpenAI-compatible gateway (fxb.supa.net.cn) serving
 * deepseek-v4-flash. Default provider per routing §3.5.
 */
export class FxbProvider implements ModelProvider {
  readonly id = "fxb" as const;
  private apiKey: string;
  private defaultModel: string;

  constructor(opts: { apiKey: string; model?: string }) {
    if (!opts.apiKey) throw new Error("FxbProvider requires apiKey");
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
        throw new Error(`Fxb ${res.status}: ${text}`);
      }

      const data = await res.json();
      const content: string = data.choices?.[0]?.message?.content ?? "";
      const usage = data.usage
        ? {
            input_tokens: data.usage.prompt_tokens ?? 0,
            output_tokens: data.usage.completion_tokens ?? 0,
          }
        : undefined;

      return { content, model: opts?.model ?? this.defaultModel, usage, raw: data };
    } catch (err) {
      if (controller.signal.aborted) {
        throw new Error(`Fxb request timed out after ${TIMEOUT_MS / 1000}s`);
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }
}
