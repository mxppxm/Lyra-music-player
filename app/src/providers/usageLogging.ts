// usageLogging — decorator that logs every chat call to the llm_usage table.
// Applied in boot.ts to every provider before it enters the registry so that
// every agent's chat() call is captured without touching the agents.

import type {
  ChatMessage,
  ChatOptions,
  ChatResponse,
  ModelProvider,
} from "../types";
import * as llmUsageRepo from "../db/repo/llmUsageRepo";

type Logger = (entry: {
  ts: number;
  provider: string;
  model: string;
  agent: string | null;
  input_tokens: number;
  output_tokens: number;
}) => Promise<void>;

const defaultLogger: Logger = (entry) => llmUsageRepo.insert(entry);

export function withUsageLogging(
  inner: ModelProvider,
  logger: Logger = defaultLogger,
): ModelProvider {
  const wrapped: ModelProvider = {
    id: inner.id,
    async chat(messages: ChatMessage[], opts?: ChatOptions): Promise<ChatResponse> {
      const res = await inner.chat(messages, opts);
      if (res.usage) {
        logger({
          ts: Date.now(),
          provider: inner.id,
          model: res.model ?? opts?.model ?? "unknown",
          agent: opts?.agent ?? null,
          input_tokens: res.usage.input_tokens,
          output_tokens: res.usage.output_tokens,
        }).catch((err) => {
          console.warn("[lyra] llm_usage log failed:", err);
        });
      }
      return res;
    },
  };
  if (inner.embed) {
    wrapped.embed = (text: string) => inner.embed!(text);
  }
  return wrapped;
}
