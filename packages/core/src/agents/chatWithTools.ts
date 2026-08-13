import type {
  ChatMessage,
  ChatOptions,
  ChatResponse,
  ModelProvider,
} from "../types";
import { chatWithFallback } from "./route";

export type ToolHandler = (
  args: Record<string, unknown>,
) => Promise<string>;

const DEFAULT_MAX_ROUNDS = 4;

/**
 * OpenAI-style tool loop: call the model, execute any tool_calls, append
 * `role: "tool"` results, repeat until the model answers in plain text.
 */
export async function chatWithTools(
  providers: ModelProvider[],
  messages: ChatMessage[],
  opts: ChatOptions | undefined,
  handlers: Record<string, ToolHandler>,
  maxRounds = DEFAULT_MAX_ROUNDS,
): Promise<ChatResponse> {
  const convo = [...messages];
  let last: ChatResponse | undefined;
  for (let round = 0; round < maxRounds; round++) {
    last = await chatWithFallback(providers, convo, opts);
    const calls = last.tool_calls ?? [];
    if (calls.length === 0) return last;

    convo.push({
      role: "assistant",
      content: last.content ?? "",
      tool_calls: calls,
      reasoning_content: last.reasoning_content,
    });

    for (const call of calls) {
      let result: string;
      try {
        const raw = call.function.arguments?.trim() || "{}";
        const args = JSON.parse(raw) as Record<string, unknown>;
        const handler = handlers[call.function.name];
        result = handler
          ? await handler(args)
          : `unknown tool: ${call.function.name}`;
      } catch (err) {
        result = `tool error: ${err instanceof Error ? err.message : String(err)}`;
      }
      convo.push({
        role: "tool",
        tool_call_id: call.id,
        content: result,
      });
    }
  }
  if (last) return last;
  throw new Error("tool loop produced no response");
}
