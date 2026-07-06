import { describe, it, expect, beforeEach } from "vitest";
import { ProviderRegistry } from "./registry";
import type { ModelProvider, ChatMessage } from "../types";

const fake = (id: any): ModelProvider => ({
  id,
  async chat(_: ChatMessage[]) {
    return { content: "" };
  },
});

describe("ProviderRegistry", () => {
  let r: ProviderRegistry;
  beforeEach(() => {
    r = new ProviderRegistry();
  });

  it("registers and retrieves by id", () => {
    const p = fake("anthropic");
    r.register(p);
    expect(r.get("anthropic")).toBe(p);
  });

  it("throws when getting an unregistered id", () => {
    expect(() => r.get("openai")).toThrow(/openai/);
  });

  it("has() returns boolean without throwing", () => {
    expect(r.has("anthropic")).toBe(false);
    r.register(fake("anthropic"));
    expect(r.has("anthropic")).toBe(true);
  });

  it("list() returns registered ids", () => {
    r.register(fake("anthropic"));
    r.register(fake("deepseek"));
    expect(r.list().sort()).toEqual(["anthropic", "deepseek"]);
  });

  it("re-registering same id overwrites", () => {
    const a = fake("anthropic");
    const b = fake("anthropic");
    r.register(a);
    r.register(b);
    expect(r.get("anthropic")).toBe(b);
  });
});
