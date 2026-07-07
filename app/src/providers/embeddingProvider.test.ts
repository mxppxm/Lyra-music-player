import { describe, expect, it, beforeEach, vi } from "vitest";

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

const getSecretMock = vi.fn();
vi.mock("../settings/secrets", () => ({
  SECRET_KEYS: {
    embeddingProvider: "embedding.provider",
    zhipuEmbeddingApiKey: "embedding.zhipu.apiKey",
    openaiApiKey: "embedding.openai.apiKey",
  },
  getSecret: (k: string) => getSecretMock(k),
}));

import {
  ZhipuEmbeddingProvider,
  OpenAIEmbeddingProvider,
  createEmbeddingProvider,
} from "./embeddingProvider";

beforeEach(() => {
  fetchMock.mockReset();
  getSecretMock.mockReset();
});

describe("ZhipuEmbeddingProvider", () => {
  it("returns Float32Array of the right shape on success", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: [{ embedding: [0.1, 0.2, 0.3] }] }),
    });
    const p = new ZhipuEmbeddingProvider("key-123");
    const v = await p.embed("hello");
    expect(v).toBeInstanceOf(Float32Array);
    expect(Array.from(v)).toEqual([
      Math.fround(0.1),
      Math.fround(0.2),
      Math.fround(0.3),
    ]);
  });

  it("throws on auth failure", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 401,
      text: async () => "unauth",
    });
    const p = new ZhipuEmbeddingProvider("bad");
    await expect(p.embed("x")).rejects.toThrow(/401/);
  });

  it("throws on malformed response", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ wrong: true }),
    });
    const p = new ZhipuEmbeddingProvider("k");
    await expect(p.embed("x")).rejects.toThrow();
  });
});

describe("OpenAIEmbeddingProvider", () => {
  it("returns Float32Array on success", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: [{ embedding: [0.9, 0.8] }] }),
    });
    const p = new OpenAIEmbeddingProvider("sk-123");
    const v = await p.embed("hi");
    expect(Array.from(v)).toEqual([Math.fround(0.9), Math.fround(0.8)]);
  });
});

describe("createEmbeddingProvider", () => {
  it("returns null when provider preference is unset", async () => {
    getSecretMock.mockResolvedValue(null);
    const p = await createEmbeddingProvider();
    expect(p).toBeNull();
  });

  it("returns null when key for chosen provider is missing", async () => {
    getSecretMock.mockImplementation(async (k: string) =>
      k === "embedding.provider" ? "zhipu" : null,
    );
    expect(await createEmbeddingProvider()).toBeNull();
  });

  it("constructs Zhipu when configured", async () => {
    getSecretMock.mockImplementation(async (k: string) =>
      k === "embedding.provider" ? "zhipu" : "zhipu-key-abc",
    );
    const p = await createEmbeddingProvider();
    expect(p?.modelId).toBe("zhipu:embedding-3");
    expect(p?.dim).toBe(1024);
  });

  it("constructs OpenAI when configured", async () => {
    getSecretMock.mockImplementation(async (k: string) =>
      k === "embedding.provider" ? "openai" : "sk-openai-abc",
    );
    const p = await createEmbeddingProvider();
    expect(p?.modelId).toBe("openai:text-embedding-3-small");
    expect(p?.dim).toBe(1536);
  });
});
