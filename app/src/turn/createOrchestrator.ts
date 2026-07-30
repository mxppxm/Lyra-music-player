import { Orchestrator } from "./Orchestrator";
import { EmotionAgent } from "../agents/EmotionAgent";
import { CompanionAgent } from "../agents/CompanionAgent";
import { LibraryAgent } from "../agents/LibraryAgent";
import { createSoulStore } from "./soulStore";
import * as turnRepo from "../db/repo/turnRepo";
import { playFile, stopPlayback, pausePlayback, resumePlayback } from "../audio/player";
import { registry } from "../providers/registry";
import { bus as perceptionBus } from "../perception/events";
import type { LibraryTrack, PAD } from "../types";
import type { TargetProfile } from "../agents/types";
import type { RecommendationContext } from "../recommendation";

/**
 * createDefaultOrchestrator — factory that wires all Sprint 1b-β agents.
 *
 * When the local music library is empty, automatically falls back to
 * searching Bilibili for music videos and playing their audio streams.
 * No config needed — it's automatic.
 *
 * Returns null when no provider is registered (no API key configured),
 * which HomeView renders as the cold-boot "needs API key" state.
 */
export function createDefaultOrchestrator(): Orchestrator | null {
  if (registry.list().length === 0) {
    return null;
  }

  let emotion: EmotionAgent;
  let companion: CompanionAgent;

  try {
    emotion = new EmotionAgent();
    companion = new CompanionAgent();
  } catch {
    // routeProvider throws when neither primary nor fallback is registered
    return null;
  }

  const library = new LibraryAgent();
  const soulStore = createSoulStore();

  // ── Bilibili fallback ──────────────────────────────────────────────────
  // First visit: sync ALL ~1800 songs' metadata to SQLite (no audio URLs
  // yet — just path="bili:__pending__:BVxxxx"). Then enrich only the top
  // `limit` for immediate playback. Subsequent turns hit the DB directly
  // and URLs are resolved lazily by the playFile wrapper below.
  //
  // On every prefilter call we also load the audio feature cache and
  // convert to PADProfile map so LibraryAgent can use real FFT-extracted
  // PAD values (energy, valence, dominance) instead of LLM guesses.
  let bilibiliSynced = false;

  const originalPrefilter = library.prefilter.bind(library);
  library.prefilter = async function (
    target: TargetProfile,
    currentPAD: PAD,
    limit = 30,
    recCtx?: RecommendationContext,
  ): Promise<LibraryTrack[]> {
    // ── Load audio PAD map from feature cache ──
    let audioPadMap: Map<string, import("../bilibili/audioFeatures").PADProfile> | undefined;
    try {
      const { readFeatureCache, featuresToPAD } =
        await import("../bilibili/audioFeatures");
      const fc = await readFeatureCache();
      audioPadMap = new Map();
      for (const [bvid, feat] of Object.entries(fc)) {
        audioPadMap.set(bvid, featuresToPAD(feat));
      }
    } catch {
      // feature cache unavailable — fall through without audio PAD
    }

    // Try local first (with audio PAD injected)
    const local = await originalPrefilter(target, currentPAD, limit, recCtx, audioPadMap);
    if (local.length > 0) return local;

    // Empty — search Bilibili
    try {
      console.log("[lyra] Bilibili fallback: searching for", String(target).slice(0, 40));
      const { searchBilibili, enrichTracksWithAudio } =
        await import("../bilibili/api");
      const { readFeatureCache } =
        await import("../bilibili/audioFeatures");

      const query = String(target).replace(/\s+/g, " ").trim();
      // Fetch ALL tracks (use huge limit to get everything)
      const { tracks } = await searchBilibili(query, 9999);
      if (tracks.length === 0) return [];

      // ── One-time full metadata sync ──
      if (!bilibiliSynced) {
        bilibiliSynced = true;
        const featureCache = await readFeatureCache();

        const allMetadata: LibraryTrack[] = tracks.map((t): LibraryTrack => ({
          id: `bili:${t.bvid}`,
          title: t.title,
          artist: t.author || undefined,
          album: undefined,
          path: `bili:__pending__:${t.bvid}`, // lazy resolve on play
          duration_ms: t.duration_ms,
          origin: "web" as const,
          added_at: Date.now(),
          metadata: {
            bvid: t.bvid,
            aid: t.aid,
            tag: t.tag,
            cover: t.cover,
            play_count: t.play_count,
            ...(featureCache[t.bvid] ? { audio_features: featureCache[t.bvid] } : {}),
          },
        }));

        const { batchInsertTracks } = await import("../db/repo/libraryRepo");
        const n = await batchInsertTracks(allMetadata);
        console.log(`[lyra] synced ${n} Bilibili track metadata to library`);

        // Re-run prefilter now that metadata is in SQLite
        const rescored = await originalPrefilter(target, currentPAD, limit, recCtx, audioPadMap);
        if (rescored.length > 0) return rescored;
      }

      // ── Enrich top `limit` for immediate playback ──
      const toEnrich = tracks.slice(0, Math.min(tracks.length, limit));
      const enriched = await enrichTracksWithAudio(toEnrich);

      // Fire-and-forget: analyze up to 8 uncached tracks for future turns
      void (async () => {
        const featureCache = await readFeatureCache();
        const { getOrAnalyzeFeatures } = await import("../bilibili/audioFeatures");
        const uncached = enriched.filter((t) => t.audioUrl && !featureCache[t.bvid]);
        for (const t of uncached.slice(0, 8)) {
          getOrAnalyzeFeatures(t.bvid, t.audioUrl!).catch(() => {});
        }
      })();

      // Fire-and-forget: generate LLM music profiles for new tracks
      void (async () => {
        const { MusicProfileAgent } = await import("../agents/MusicProfileAgent");
        const profileAgent = new MusicProfileAgent();
        const { hasProfiles, upsert } = await import("../db/repo/musicProfileRepo");
        const bvids = enriched.filter((t) => t.audioUrl).map((t) => t.bvid);
        if (bvids.length === 0) return;
        const existing = await hasProfiles(bvids.map((b) => `bili:${b}`));
        const newTracks = enriched.filter(
          (t) => t.audioUrl && !existing.has(`bili:${t.bvid}`),
        );
        for (const t of newTracks.slice(0, 8)) {
          try {
            const profile = await profileAgent.analyze({
              title: t.title,
              artist: t.author || undefined,
            });
            if (profile) {
              profile.track_id = `bili:${t.bvid}`;
              await upsert(profile);
            }
          } catch (e) {
            // best-effort background analysis
          }
        }
      })();

      const excludeIds = recCtx?.excludeIds;
      return enriched
        .filter((t) => t.audioUrl !== null)
        .filter((t) => !excludeIds?.has(`bili:${t.bvid}`))
        .map(
          (t): LibraryTrack => ({
            id: `bili:${t.bvid}`,
            title: t.title,
            artist: t.author || undefined,
            album: undefined,
            path: t.audioUrl!,
            duration_ms: t.duration_ms,
            origin: "web" as const,
            added_at: Date.now(),
            metadata: {
              bvid: t.bvid,
              aid: t.aid,
              tag: t.tag,
              cover: t.cover,
              play_count: t.play_count,
            },
          }),
        );
    } catch (err) {
      console.warn("[lyra] Bilibili search failed:", err);
      return [];
    }
  };

  // ── Lazy Bilibili URL resolver ────────────────────────────────────────
  // Tracks synced as metadata-only have path="bili:__pending__:BVxxxx".
  // Resolve the real DASH audio URL on first play. Bilibili DASH URLs
  // are temporary (hours), so we don't bother caching them — resolve fresh
  // every time.
  const lazyPlayFile = async (rawPath: string, durationMs?: number | null) => {
    let path = rawPath;
    if (path.startsWith("bili:__pending__:")) {
      const bvid = path.slice("bili:__pending__:".length);
      try {
        const { getVideoCid, getAudioUrl } = await import("../bilibili/api");
        const cid = await getVideoCid(bvid);
        const url = await getAudioUrl(bvid, cid);
        if (url) {
          path = url;
          console.log(`[lyra] resolved ${bvid} → audio URL`);
        } else {
          console.warn(`[lyra] failed to resolve audio URL for ${bvid}`);
        }
      } catch (e) {
        console.warn(`[lyra] URL resolution error for ${bvid}:`, e);
      }
    }
    return playFile(path, durationMs ?? null);
  };

  // ── Inject real audio PAD into CompanionAgent candidates ───────────────
  // CompanionAgent.choose receives candidates with LLM music profiles.
  // We intercept to inject real FFT-extracted PAD so the LLM can use
  // hard audio data instead of guessing from titles.
  const originalChoose = companion.choose.bind(companion);
  companion.choose = async function (input) {
    // Load feature cache and build bvid → PAD map
    try {
      const { readFeatureCache, featuresToPAD } =
        await import("../bilibili/audioFeatures");
      const fc = await readFeatureCache();
      for (const c of input.candidates) {
        if (c.audioPad) continue; // already has real PAD
        const bvid = c.id.startsWith("bili:") ? c.id.slice(5) : null;
        if (!bvid) continue;
        const feat = fc[bvid];
        if (feat) {
          c.audioPad = featuresToPAD(feat);
        }
      }
    } catch {
      // feature cache unavailable — proceed without audio PAD
    }
    return originalChoose(input);
  };

  const audio = {
    playFile: lazyPlayFile,
    stop: stopPlayback,
    pause: pausePlayback,
    resume: resumePlayback,
  };

  return new Orchestrator({
    emotion,
    companion,
    library,
    soulStore,
    turnRepo: {
      insertTurn: turnRepo.insertTurn,
      updateTurn: turnRepo.updateTurn,
      setTurnLatency: turnRepo.setTurnLatency,
    },
    audio,
    eventBus: perceptionBus,
  });
}
