import type {
  ModelProvider,
  ChatMessage,
  ChatOptions,
  ChatResponse,
} from "../types";

const DEFAULT_MODEL = "deepseek-chat";
// Hard-coded to match the CSP connect-src allowlist in tauri.conf.json.
// If this ever changes, update the CSP simultaneously.
const ENDPOINT = "https://api.deepseek.com/v1/chat/completions";
const MAX_ATTEMPTS = 3;

export class DeepSeekProvider implements ModelProvider {
  readonly id = "deepseek" as const;
  private apiKey: string;
  private defaultModel: string;

  constructor(opts: { apiKey: string; model?: string }) {
    if (!opts.apiKey) throw new Error("DeepSeekProvider requires apiKey");
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

    const res = await this.post(JSON.stringify(body));

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`DeepSeek ${res.status}: ${text}`);
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
  }

  // DeepSeek load-sheds under pressure: 503s are transient, retry with backoff.
  private async post(body: string, attempt = 1): Promise<Response> {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        authorization: `Bearer ${this.apiKey}`,
        "content-type": "application/json",
      },
      body,
    });
    if (res.status === 503 && attempt < MAX_ATTEMPTS) {
      await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
      return this.post(body, attempt + 1);
    }
    return res;
  }
}
