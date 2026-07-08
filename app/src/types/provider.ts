// types/provider.ts — Model Provider 抽象层
export type ChatRole = "system" | "user" | "assistant";

export type ChatMessage = {
  role: ChatRole;
  content: string;
};

export type ChatOptions = {
  model?: string;
  max_tokens?: number;
  temperature?: number;
  // OpenAI-compat JSON mode. Providers that support it (Zhipu, DeepSeek) forward
  // it as `response_format: {type: "json_object"}`. Others silently ignore it.
  response_format?: { type: "json_object" };
  // Attribution for the LLM-usage log. Providers ignore this; the usage-logging
  // decorator reads it to tag which agent originated the call.
  agent?: string;
};

export type ChatResponse = {
  content: string;
  // Model actually used for the call (provider-side default or opts.model).
  // Populated by providers so the usage log records the exact model without
  // having to guess from opts.
  model?: string;
  usage?: {
    input_tokens: number;
    output_tokens: number;
  };
  raw?: unknown;
};

export type ProviderId =
  | "anthropic"
  | "deepseek"
  | "zhipu"
  | "doubao"
  | "openai"
  | "local-ollama";

export interface ModelProvider {
  readonly id: ProviderId;
  chat(messages: ChatMessage[], opts?: ChatOptions): Promise<ChatResponse>;
  embed?(text: string): Promise<number[]>;
}
