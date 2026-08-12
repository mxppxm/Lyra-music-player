import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const css = readFileSync("src/home/mobile.css", "utf8");

function ruleBody(selector: string): string {
  const start = css.indexOf(`${selector} {`);
  if (start < 0) return "";
  const bodyStart = css.indexOf("{", start) + 1;
  const end = css.indexOf("}", bodyStart);
  return css.slice(bodyStart, end);
}

function pixels(source: string, pattern: RegExp): number {
  const match = pattern.exec(source);
  if (!match) throw new Error(`no match for ${pattern} in: ${source}`);
  return Number(match[1]);
}

describe("mobile progress layout", () => {
  it("keeps the collapsed progress row out of the capsule", () => {
    const base = ruleBody(".lyra-mobile-progress-wrap");
    const shown = ruleBody(".lyra-mobile-progress-wrap--show");

    expect(base).toMatch(/max-height:\s*0/);
    expect(base).not.toMatch(/\bheight:\s*44px/);
    expect(shown).toMatch(/max-height:\s*44px/);
  });

  it("reserves the row's growth on the dock so the cover never re-centers", () => {
    const base = ruleBody(".lyra-mobile-progress-wrap");
    const shown = ruleBody(".lyra-mobile-progress-wrap--show");
    const dock = ruleBody(".lyra-mobile-dock");
    const dockWithProgress = ruleBody(".lyra-mobile-dock--progress");

    expect(dock).toMatch(/margin-top:\s*var\(--lyra-progress-reserve\)/);
    expect(dockWithProgress).toMatch(/margin-top:\s*0/);

    // The capsule may only grow into space the dock already gave back.
    const reserve = pixels(css, /--lyra-progress-reserve:\s*(\d+)px/);
    const row = pixels(shown, /max-height:\s*(\d+)px/);
    const cancelledGap = pixels(base, /margin-top:\s*-(\d+)px/);
    expect(reserve).toBe(row + cancelledGap);
  });

  it("uses a dedicated visible thinking style without moving backdrop blur", () => {
    const thinking = ruleBody(".lyra-mobile-cover-rail__thinking");
    const thinkingSlot = ruleBody(
      ".lyra-mobile-cover-rail__slot--thinking",
    );

    expect(thinking).toMatch(/opacity:\s*1/);
    expect(thinkingSlot).not.toMatch(/backdrop-filter/);
  });

  it("re-enables pointer events on the cover hit so MV tap is not swallowed by the stage", () => {
    const slot = ruleBody(".lyra-mobile-cover-rail__slot");
    const hit = ruleBody(".lyra-mobile-cover-rail__hit");
    expect(slot).toMatch(/pointer-events:\s*none/);
    expect(hit).toMatch(/pointer-events:\s*auto/);
  });
});

describe("input capsule", () => {
  it("sizes a single line of text to the send button so the icon reads centred", () => {
    const send = pixels(css, /--lyra-send-size:\s*(\d+)px/);
    const input = ruleBody(".lyra-mobile-input");
    const padding = pixels(input, /padding:\s*(\d+)px 0/);
    const lineHeight = pixels(input, /line-height:\s*(\d+)px/);

    // Any slack here shows up as dead space above the flex-end button.
    expect(padding * 2 + lineHeight).toBe(send);
    expect(ruleBody(".lyra-mobile-mode-seg")).toMatch(
      /height:\s*var\(--lyra-send-size\)/,
    );
  });

  it("does not add an extra song-mode outer ring on the input capsule", () => {
    expect(css).not.toMatch(/\.lyra-mobile-input-wrap--song\s*\{/);
  });
});

describe("immersive copy modules", () => {
  it("stops a remounted copy module from replaying its intro over the vinyl", () => {
    const suppressed = ruleBody(
      ".lyra-mobile-stage--immersive .lyra-mobile-content > *:not(.lyra-mobile-cover-shift)",
    );

    expect(suppressed).toMatch(/animation:\s*none/);
  });

  it("scopes the stagger intro to the scene change so leaving immersive only fades", () => {
    // An unscoped `.lyra-mobile-content > *` intro would restart the keyframes
    // the moment the immersive `animation: none` override is dropped, holding
    // the copy invisible through its 520ms delay instead of fading it back in.
    expect(css).toMatch(
      /\.lyra-mobile-content--intro > \*:not\(\.lyra-mobile-cover-shift\),[\s\S]*?animation: lyra-mobile-module-in/,
    );
    expect(css).not.toMatch(
      /^\.lyra-mobile-content > \*:not\(\.lyra-mobile-cover-shift\),$/m,
    );

    const copy = ruleBody(".lyra-mobile-song-info,\n.lyra-mobile-small-note");
    expect(copy).toMatch(/opacity 480ms/);
  });

  it("keeps immersive chrome in normal flow so enter/exit FLIP is measured against real boxes", () => {
    const content = ruleBody(".lyra-mobile-stage--immersive .lyra-mobile-content");
    expect(content).not.toMatch(/grid-template/);
    expect(content).toMatch(/overflow:\s*visible/);

    // Hidden with opacity only — layout boxes stay so the cover doesn't jump
    // when toggling immersive (see song-info / dock immersive rules).
    const songInfo = ruleBody(".lyra-mobile-stage--immersive .lyra-mobile-song-info");
    expect(songInfo).toMatch(/opacity:\s*0/);
    expect(songInfo).not.toMatch(/display:\s*none/);
  });
});
