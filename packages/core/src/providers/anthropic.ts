import type {
  ModelProvider,
  ChatMessage,
  ChatOptions,
  ChatResponse,
} from "../types";

const DEFAULT_MODEL = "claude-opus-4-7";
const DEFAULT_MAX_TOKENS = 1024;
// Hard-coded to match the CSP connect-src allowlist in tauri.conf.json.
// If this ever changes, update the CSP simultaneously.
const ENDPOINT = "https://api.anthropic.com/v1/messages";
/** Per-request timeout — prevents infinite thinking when the API hangs. */
const TIMEOUT_MS = 30_000;

export class AnthropicProvider implements ModelProvider {
  readonly id = "anthropic" as const;
  private apiKey: string;
  private defaultModel: string;

  constructor(opts: { apiKey: string; model?: string }) {
    if (!opts.apiKey) throw new Error("AnthropicProvider requires apiKey");
    this.apiKey = opts.apiKey;
    this.defaultModel = opts.model ?? DEFAULT_MODEL;
  }

  async chat(messages: ChatMessage[], opts?: ChatOptions): Promise<ChatResponse> {
    const systemParts = messages
      .filter((m) => m.role === "system")
      .map((m) => m.content);
    const nonSystem = messages.filter((m) => m.role !== "system");

    const body: Record<string, unknown> = {
      model: opts?.model ?? this.defaultModel,
      max_tokens: opts?.max_tokens ?? DEFAULT_MAX_TOKENS,
      messages: nonSystem.map((m) => ({ role: m.role, content: m.content })),
    };
    if (systemParts.length > 0) body.system = systemParts.join("\n\n");
    if (opts?.temperature != null) body.temperature = opts.temperature;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
      const res = await fetch(ENDPOINT, {
        method: "POST",
        headers: {
          "x-api-key": this.apiKey,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Anthropic ${res.status}: ${text}`);
      }

      const data = await res.json();
      const content = (data.content ?? [])
        .filter((b: { type: string }) => b.type === "text")
        .map((b: { text: string }) => b.text)
        .join("");

      return {
        content,
        model: opts?.model ?? this.defaultModel,
        usage: data.usage,
        raw: data,
      };
    } catch (err) {
      if (controller.signal.aborted) {
        throw new Error(`Anthropic request timed out after ${TIMEOUT_MS / 1000}s`);
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }
}
