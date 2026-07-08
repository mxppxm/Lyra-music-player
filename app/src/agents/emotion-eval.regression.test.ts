// Regression eval for EmotionAgent — held-out items from
// skills-repo/emotion-capture-cn-skill/examples/few-shot-cn.jsonl (12 cases
// NOT in the prompt's few-shot, so this measures the model's generalization
// rather than its ability to recite examples).
//
// Gated by env var. Default `pnpm test` skips this entire describe block.
//
//   LYRA_EVAL=1 ZHIPU_API_KEY=xxx pnpm eval:emotion
//
// Not a hard-asserting test — prints a table + summary so you can eyeball
// drift over time. The soft assertion at the bottom only catches catastrophic
// regression (mean L1 > 1.5). Each run appends a JSONL trace to
// `app/.eval-runs/emotion-<ISO>.jsonl` so you can diff prompts across time.

import { describe, it, expect } from "vitest";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { ZhipuProvider } from "../providers/zhipu";
import { EmotionAgent } from "./EmotionAgent";
import type { CurrentEmotion } from "../types";

const RUN = process.env.LYRA_EVAL === "1";
const HERE = dirname(fileURLToPath(import.meta.url));
const REGRESSION_PATH = resolve(HERE, "emotion-eval.regression.jsonl");
const RUNS_DIR = resolve(HERE, "../../.eval-runs");

type Expected = {
  pad: { p: number; a: number; d: number };
  labels: string[];
  confidence: number;
};
type Item = { input: string; expected: Expected };

function loadRegression(): Item[] {
  const raw = readFileSync(REGRESSION_PATH, "utf8");
  return raw.split("\n").filter((l) => l.trim()).map((l) => JSON.parse(l) as Item);
}

function padL1(
  a: CurrentEmotion["pad"],
  b: Expected["pad"],
): number {
  return Math.abs(a.p - b.p) + Math.abs(a.a - b.a) + Math.abs(a.d - b.d);
}

function fmt(n: number, digits = 2): string {
  const s = n.toFixed(digits);
  return (n >= 0 ? " " : "") + s;
}

describe.runIf(RUN)("EmotionAgent regression eval", () => {
  it(
    "scores held-out utterances against the current prompt",
    { timeout: 300_000 },
    async () => {
      const key = process.env.ZHIPU_API_KEY;
      if (!key) throw new Error("Missing ZHIPU_API_KEY.");
      const provider = new ZhipuProvider({ apiKey: key });
      const agent = new EmotionAgent({ provider });
      const items = loadRegression();

      type Row = {
        i: number;
        input: string;
        expected: Expected;
        predicted: CurrentEmotion;
        l1: number;
        confDelta: number;
      };
      const rows: Row[] = [];

      console.log(`\n─── EmotionAgent regression (${items.length} items) ───\n`);
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const predicted = await agent.analyze({ userUtterance: item.input });
        const l1 = padL1(predicted.pad, item.expected.pad);
        const confDelta = predicted.confidence - item.expected.confidence;
        rows.push({ i, input: item.input, expected: item.expected, predicted, l1, confDelta });
        const e = item.expected.pad;
        const p = predicted.pad;
        console.log(
          `[${String(i + 1).padStart(2)}/${items.length}] L1=${l1.toFixed(2)}  Δconf=${fmt(confDelta, 2)}  "${item.input}"\n` +
            `      exp: p=${fmt(e.p)} a=${fmt(e.a)} d=${fmt(e.d)}  c=${item.expected.confidence.toFixed(2)}  [${item.expected.labels.join(", ")}]\n` +
            `      got: p=${fmt(p.p)} a=${fmt(p.a)} d=${fmt(p.d)}  c=${predicted.confidence.toFixed(2)}  [${predicted.labels.join(", ")}]`,
        );
      }

      const meanL1 = rows.reduce((s, r) => s + r.l1, 0) / rows.length;
      const meanAbsConfDelta =
        rows.reduce((s, r) => s + Math.abs(r.confDelta), 0) / rows.length;
      const worst3 = [...rows].sort((a, b) => b.l1 - a.l1).slice(0, 3);

      console.log(`\n─── SUMMARY ───`);
      console.log(`items         : ${rows.length}`);
      console.log(`mean PAD L1   : ${meanL1.toFixed(3)}   (lower is better; single-axis max = 2.0, 3-axis max = 6.0)`);
      console.log(`mean |Δconf|  : ${meanAbsConfDelta.toFixed(3)}`);
      console.log(`worst 3 by L1 :`);
      for (const r of worst3) {
        console.log(`  L1=${r.l1.toFixed(3)}   "${r.input}"`);
      }

      // Persist trace for historical comparison
      mkdirSync(RUNS_DIR, { recursive: true });
      const stamp = new Date().toISOString().replace(/[:.]/g, "-");
      const runPath = resolve(RUNS_DIR, `emotion-${stamp}.jsonl`);
      const runLines = [
        JSON.stringify({
          kind: "summary",
          ts: Date.now(),
          items: rows.length,
          mean_l1: meanL1,
          mean_abs_conf_delta: meanAbsConfDelta,
          model: provider.id,
        }),
        ...rows.map((r) =>
          JSON.stringify({
            kind: "row",
            input: r.input,
            expected: r.expected,
            predicted: {
              pad: r.predicted.pad,
              labels: r.predicted.labels,
              confidence: r.predicted.confidence,
            },
            l1: r.l1,
            conf_delta: r.confDelta,
          }),
        ),
      ];
      writeFileSync(runPath, runLines.join("\n") + "\n");
      console.log(`\ntrace written: ${runPath}`);

      // Soft sanity: only fires on catastrophic regression, not normal drift.
      expect(
        meanL1,
        "mean PAD L1 exploded (>1.5) — prompt likely broken",
      ).toBeLessThan(1.5);
    },
  );
});
