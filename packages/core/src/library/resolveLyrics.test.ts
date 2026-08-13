import { describe, it, expect, vi } from "vitest";
import { resolveAndPersistLyrics } from "./resolveLyrics";
import type { DialogueTurn } from "../types";

const FULL = [
  "故事的小黄花",
  "从出生那年就飘着",
  "童年的荡秋千",
  "随记忆一直晃到现在",
  "Re So So Si Do Si La",
  "So La Si Si Si Si La Si La So",
  "吹着前奏望着天空",
  "我想起花瓣试着掉落",
  "为你翘课的那一天",
  "花落的那一天",
  "教室的那一间",
  "我怎么看不见",
  "消失的下雨天",
  "我好想再淋一遍",
  "没想到失去的风景",
  "习惯在回忆里看见",
].join("\n");

const PARTIAL = [
  "吹着前奏望着天空",
  "我想起花瓣试着掉落",
  "为你翘课的那一天",
  "花落的那一天",
  "吹着前奏望着天空",
  "我想起花瓣试着掉落",
  "为你翘课的那一天",
  "花落的那一天",
].join("\n");

function turn(
  songId: string,
  opts: { id?: string; lyrics?: string; rationale?: string } = {},
): DialogueTurn {
  return {
    id: opts.id ?? `turn-${songId}`,
    timestamp: Date.now(),
    current_emotion: {
      pad: { p: 0, a: 0, d: 0 },
      labels: [],
      confidence: 1,
      source: "emotion-agent-inferred",
    },
    user_utterance: { modality: "text", content: "hi" },
    agent_response: {
      song_id: songId,
      rationale: opts.rationale ?? "note",
      ...(opts.lyrics !== undefined ? { lyrics: opts.lyrics } : {}),
    },
    user_reaction: {
      behavioral: {
        listen_duration_ms: 0,
        completed: false,
        skipped: false,
        repeated: 0,
        volume_delta: 0,
      },
      silence_positive: false,
    },
    emotion_delta: { p: 0, a: 0, d: 0 },
  };
}

describe("resolveAndPersistLyrics", () => {
  it("returns full lyrics already on the current turn without calling LLM", async () => {
    const current = turn("s1", { lyrics: FULL });
    const fetchLyrics = vi.fn();
    const updateTurn = vi.fn();
    const listRecentTurns = vi.fn();

    const out = await resolveAndPersistLyrics({
      turn: current,
      title: "歌",
      artist: "歌手",
      listRecentTurns,
      updateTurn,
      fetchLyrics,
    });

    expect(out).toBe(FULL);
    expect(fetchLyrics).not.toHaveBeenCalled();
    expect(updateTurn).not.toHaveBeenCalled();
    expect(listRecentTurns).not.toHaveBeenCalled();
  });

  it("copies full lyrics from a recent turn with the same song_id", async () => {
    const current = turn("s1", { id: "now" });
    const older = turn("s1", { id: "old", lyrics: FULL });
    const updateTurn = vi.fn(async () => {});
    const fetchLyrics = vi.fn();

    const out = await resolveAndPersistLyrics({
      turn: current,
      title: "歌",
      artist: "歌手",
      listRecentTurns: async () => [current, older],
      updateTurn,
      fetchLyrics,
    });

    expect(out).toBe(FULL);
    expect(fetchLyrics).not.toHaveBeenCalled();
    expect(updateTurn).toHaveBeenCalledOnce();
    const saved = updateTurn.mock.calls[0]![0] as DialogueTurn;
    expect(saved.id).toBe("now");
    expect(saved.agent_response.lyrics).toBe(FULL);
  });

  it("refetches when cached lyrics look like chorus-only", async () => {
    const current = turn("s1", { id: "now", lyrics: PARTIAL });
    const updateTurn = vi.fn(async () => {});
    const fetchLyrics = vi.fn(async () => FULL);

    const out = await resolveAndPersistLyrics({
      turn: current,
      title: "歌",
      artist: "歌手",
      listRecentTurns: async () => [current],
      updateTurn,
      fetchLyrics,
    });

    expect(out).toBe(FULL);
    expect(fetchLyrics).toHaveBeenCalledOnce();
    expect(updateTurn).toHaveBeenCalledOnce();
  });

  it("fetches from LLM and persists when no cache exists", async () => {
    const current = turn("s1", { id: "now" });
    const updateTurn = vi.fn(async () => {});
    const fetchLyrics = vi.fn(async () => FULL);

    const out = await resolveAndPersistLyrics({
      turn: current,
      title: "歌",
      artist: "歌手",
      listRecentTurns: async () => [current],
      updateTurn,
      fetchLyrics,
    });

    expect(out).toBe(FULL);
    expect(fetchLyrics).toHaveBeenCalledWith({
      title: "歌",
      artist: "歌手",
      enableThinking: false,
    });
    expect(updateTurn).toHaveBeenCalledOnce();
  });

  it("force skips cache and overwrites with a fresh LLM fetch", async () => {
    const current = turn("s1", { id: "now", lyrics: FULL });
    const updateTurn = vi.fn(async () => {});
    const fresh = `${FULL}\n再加一段`;
    const fetchLyrics = vi.fn(async () => fresh);

    const out = await resolveAndPersistLyrics({
      turn: current,
      title: "歌",
      artist: "歌手",
      force: true,
      listRecentTurns: async () => [current],
      updateTurn,
      fetchLyrics,
    });

    expect(out).toBe(fresh);
    expect(fetchLyrics).toHaveBeenCalledWith({
      title: "歌",
      artist: "歌手",
      enableThinking: true,
    });
    expect(updateTurn).toHaveBeenCalledOnce();
    const saved = updateTurn.mock.calls[0]![0] as DialogueTurn;
    expect(saved.agent_response.lyrics).toBe(fresh);
  });

  it("does not persist when LLM fetch fails", async () => {
    const current = turn("s1");
    const updateTurn = vi.fn();
    const fetchLyrics = vi.fn(async () => {
      throw new Error("not found");
    });

    await expect(
      resolveAndPersistLyrics({
        turn: current,
        title: "歌",
        artist: "歌手",
        listRecentTurns: async () => [current],
        updateTurn,
        fetchLyrics,
      }),
    ).rejects.toThrow(/not found/);
    expect(updateTurn).not.toHaveBeenCalled();
  });
});
