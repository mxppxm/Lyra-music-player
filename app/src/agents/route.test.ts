import { describe, it, expect } from "vitest";
import { ProviderRegistry } from "../providers/registry";
import type { ModelProvider } from "../types";
import { routeProvider, PRIMARY_FOR, FALLBACK_FOR } from "./route";

function fakeProvider(id: any): ModelProvider {
  return { id, chat: async () => ({ content: "" }) };
}

describe("routeProvider", () => {
  it("PRIMARY_FOR maps every agent→fxb per routing §3.5", () => {
    expect(PRIMARY_FOR.emotion).toBe("fxb");
    expect(PRIMARY_FOR.companion).toBe("fxb");
  });

  it("FALLBACK_FOR keeps deepseek as the fallback per routing §3.5", () => {
    expect(FALLBACK_FOR.emotion).toEqual(["deepseek"]);
    expect(FALLBACK_FOR.companion).toEqual(["zhipu", "deepseek"]);
  });

  it("returns the primary when registered", () => {
    const registry = new ProviderRegistry();
    registry.register(fakeProvider("fxb"));
    expect(routeProvider("emotion", registry).id).toBe("fxb");
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
