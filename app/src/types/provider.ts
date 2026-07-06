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
};

export type ChatResponse = {
  content: string;
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
