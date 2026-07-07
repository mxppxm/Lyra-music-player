// computeLyricsEmbedding — Sprint 10
// Orchestrator: extract USLT via tauri → embed → upsert.
// Every failure returns false; caller (import path or refill) treats false
// as "row simply not written this time".

import { lyricsExtract } from "./lyricsExtract";
import { upsert } from "../db/repo/lyricsEmbeddingsRepo";
import type { EmbeddingProvider } from "../providers/embeddingProvider";
import { createEmbeddingProvider } from "../providers/embeddingProvider";

async function sha256Hex16(input: string): Promise<string> {
  const buf = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(digest).slice(0, 8))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function computeLyricsEmbedding(
  trackId: string,
  path: string,
  provider?: EmbeddingProvider | null,
): Promise<boolean> {
  const p = provider === undefined ? await createEmbeddingProvider() : provider;
  if (!p) return false;
  const lyrics = await lyricsExtract(path);
  if (!lyrics) return false;
  try {
    const embedding = await p.embed(lyrics);
    if (embedding.length !== p.dim) return false;
    await upsert({
      trackId,
      lyricsHash: await sha256Hex16(lyrics),
      modelId: p.modelId,
      dim: p.dim,
      embedding,
      updatedAt: Date.now(),
    });
    return true;
  } catch {
    return false;
  }
}
