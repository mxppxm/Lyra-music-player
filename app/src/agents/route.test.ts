import { describe, it, expect } from "vitest";
import { ProviderRegistry } from "../providers/registry";
import type { ModelProvider } from "../types";
import { routeProvider, PRIMARY_FOR, FALLBACK_FOR } from "./route";

function fakeProvider(id: any): ModelProvider {
  return { id, chat: async () => ({ content: "" }) };
}

describe("routeProvider", () => {
  it("PRIMARY_FOR maps emotion→zhipu and companion→anthropic per spec §3.5", () => {
    expect(PRIMARY_FOR.emotion).toBe("zhipu");
    expect(PRIMARY_FOR.companion).toBe("anthropic");
  });

  it("FALLBACK_FOR maps emotion→deepseek and companion→zhipu per spec §3.5", () => {
    expect(FALLBACK_FOR.emotion).toBe("deepseek");
    expect(FALLBACK_FOR.companion).toBe("zhipu");
  });

  it("returns the primary when registered", () => {
    const registry = new ProviderRegistry();
    registry.register(fakeProvider("zhipu"));
    expect(routeProvider("emotion", registry).id).toBe("zhipu");
  });

  it("returns the fallback when primary is not registered but fallback is", () => {
    const registry = new ProviderRegistry();
    registry.register(fakeProvider("deepseek"));
    expect(routeProvider("emotion", registry).id).toBe("deepseek");
  });

  it("throws when neither primary nor fallback is registered", () => {
    const registry = new ProviderRegistry();
    expect(() => routeProvider("emotion", registry)).toThrow(/no provider/i);
  });
});
