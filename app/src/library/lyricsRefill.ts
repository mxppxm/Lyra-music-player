// lyricsRefill — Sprint 10
// Back-fill lyrics embeddings for tracks that don't have one for the current
// provider's model_id. Concurrency capped at 3 by default so we don't fan
// out network requests. Fire-and-forget from Settings UI.

import { listMissing } from "../db/repo/lyricsEmbeddingsRepo";
import { getTrack } from "../db/repo/libraryRepo";
import { computeLyricsEmbedding } from "./computeLyricsEmbedding";
import { createEmbeddingProvider } from "../providers/embeddingProvider";
import type { EmbeddingProvider } from "../providers/embeddingProvider";

const DEFAULT_CONCURRENCY = 3;

export async function lyricsRefill(
  opts: {
    concurrency?: number;
    provider?: EmbeddingProvider | null;
  } = {},
): Promise<{ started: number; succeeded: number; failed: number }> {
  const provider =
    opts.provider === undefined ? await createEmbeddingProvider() : opts.provider;
  if (!provider) return { started: 0, succeeded: 0, failed: 0 };

  const ids = await listMissing(provider.modelId);
  const concurrency = Math.max(1, opts.concurrency ?? DEFAULT_CONCURRENCY);

  let succeeded = 0;
  let failed = 0;

  let cursor = 0;
  async function worker(): Promise<void> {
    while (cursor < ids.length) {
      const i = cursor++;
      const id = ids[i];
      const track = await getTrack(id).catch(() => null);
      if (!track) {
        failed++;
        continue;
      }
      const ok = await computeLyricsEmbedding(id, track.path, provider).catch(
        () => false,
      );
      if (ok) succeeded++;
      else failed++;
    }
  }

  const workers = Array.from({ length: concurrency }, () => worker());
  await Promise.all(workers);

  return { started: ids.length, succeeded, failed };
}
