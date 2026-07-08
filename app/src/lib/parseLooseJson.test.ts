import { describe, it, expect } from "vitest";
import { parseLooseJson } from "./parseLooseJson";

describe("parseLooseJson", () => {
  it("parses pure JSON", () => {
    expect(parseLooseJson('{"a":1}')).toEqual({ a: 1 });
  });

  it("strips ```json fences", () => {
    expect(parseLooseJson('```json\n{"a":1}\n```')).toEqual({ a: 1 });
  });

  it("strips bare ``` fences", () => {
    expect(parseLooseJson('```\n{"a":1}\n```')).toEqual({ a: 1 });
  });

  it("strips <think> blocks emitted by reasoning models", () => {
    const raw = '<think>让我分析一下用户情绪…</think>\n{"pad":{"p":0.1,"a":0,"d":0}}';
    expect(parseLooseJson(raw)).toEqual({ pad: { p: 0.1, a: 0, d: 0 } });
  });

  it("recovers JSON surrounded by prose via first-{ / last-} slice", () => {
    const raw = '让我分析:\n{"a":1,"b":"x"}\n上面就是结果。';
    expect(parseLooseJson(raw)).toEqual({ a: 1, b: "x" });
  });

  it("handles fence + think together", () => {
    const raw = '<think>reasoning…</think>\n```json\n{"ok":true}\n```';
    expect(parseLooseJson(raw)).toEqual({ ok: true });
  });

  it("throws 'bad JSON' when no valid object is present", () => {
    expect(() => parseLooseJson("完全不是 JSON")).toThrow(/bad JSON/);
  });
});
