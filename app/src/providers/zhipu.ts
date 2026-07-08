import type {
  ModelProvider,
  ChatMessage,
  ChatOptions,
  ChatResponse,
} from "../types";

const DEFAULT_MODEL = "glm-5.1";
// Hard-coded to match the CSP connect-src allowlist in tauri.conf.json.
// If this ever changes, update the CSP simultaneously.
const ENDPOINT = "https://open.bigmodel.cn/api/paas/v4/chat/completions";

/**
 * ZhipuProvider — 智谱 GLM adapter, OpenAI-compat wire format.
 * Recommended per spec §3.5 as the emotion agent's primary model.
 */
export class ZhipuProvider implements ModelProvider {
  readonly id = "zhipu" as const;
  private apiKey: string;
  private defaultModel: string;

  constructor(opts: { apiKey: string; model?: string }) {
    if (!opts.apiKey) throw new Error("ZhipuProvider requires apiKey");
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

    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        authorization: `Bearer ${this.apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Zhipu ${res.status}: ${text}`);
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
}
