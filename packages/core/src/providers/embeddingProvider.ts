// embeddingProvider — Sprint 10
// Cloud embedding via Zhipu embedding-3 or OpenAI text-embedding-3-small.
// BYOK — reads provider preference + API key from the keyring via secrets.
// Returns null when either the preference or corresponding key is missing;
// LibraryAgent uses that null → graceful degradation to kw+pad scoring.

import { SECRET_KEYS } from "../settings/secrets";
import { resolveSecret } from "./resolveSecret";
import { bundledEmbeddingProvider, bundledEmbeddingKey } from "./bundledKeys";

export type EmbeddingProviderId = "zhipu" | "openai";

export interface EmbeddingProvider {
  readonly modelId: string;
  readonly dim: number;
  embed(text: string): Promise<Float32Array>;
}

export class ZhipuEmbeddingProvider implements EmbeddingProvider {
  readonly modelId = "zhipu:embedding-3";
  readonly dim = 1024;

  constructor(private apiKey: string) {}

  async embed(text: string): Promise<Float32Array> {
    const res = await fetch(
      "https://open.bigmodel.cn/api/paas/v4/embeddings",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: "embedding-3",
          input: text,
          dimensions: this.dim,
        }),
      },
    );
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`zhipu embedding failed: ${res.status} ${body}`);
    }
    const j = (await res.json()) as {
      data?: Array<{ embedding?: number[] }>;
    };
    const arr = j?.data?.[0]?.embedding;
    if (!Array.isArray(arr)) throw new Error("zhipu: missing embedding");
    return Float32Array.from(arr);
  }
}

export class OpenAIEmbeddingProvider implements EmbeddingProvider {
  readonly modelId = "openai:text-embedding-3-small";
  readonly dim = 1536;

  constructor(private apiKey: string) {}

  async embed(text: string): Promise<Float32Array> {
    const res = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: "text-embedding-3-small",
        input: text,
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`openai embedding failed: ${res.status} ${body}`);
    }
    const j = (await res.json()) as {
      data?: Array<{ embedding?: number[] }>;
    };
    const arr = j?.data?.[0]?.embedding;
    if (!Array.isArray(arr)) throw new Error("openai: missing embedding");
    return Float32Array.from(arr);
  }
}

/** Returns null when either the provider preference or the corresponding
 *  API key is missing. LibraryAgent silently degrades when this returns null. */
export async function createEmbeddingProvider(): Promise<EmbeddingProvider | null> {
  const stored = (await resolveSecret(SECRET_KEYS.embeddingProvider)) as
    | EmbeddingProviderId
    | ""
    | null;
  const which =
    stored === "zhipu" || stored === "openai"
      ? stored
      : bundledEmbeddingProvider();
  if (which === "zhipu") {
    const key =
      (await resolveSecret(SECRET_KEYS.zhipuEmbeddingApiKey)) ??
      bundledEmbeddingKey("zhipu");
    if (!key) return null;
    return new ZhipuEmbeddingProvider(key);
  }
  if (which === "openai") {
    const key =
      (await resolveSecret(SECRET_KEYS.openaiApiKey)) ?? bundledEmbeddingKey("openai");
    if (!key) return null;
    return new OpenAIEmbeddingProvider(key);
  }
  return null;
}
