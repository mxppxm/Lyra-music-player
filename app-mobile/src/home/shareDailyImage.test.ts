import { describe, it, expect, vi, beforeEach } from "vitest";
import { shareDailyImage } from "./shareDailyImage";

vi.mock("html-to-image", () => ({
  toPng: vi.fn(async () => "data:image/png;base64,iVBORw0KGgo="),
}));

vi.mock("@capacitor/core", () => ({
  Capacitor: { isNativePlatform: () => false },
}));

vi.mock("@capacitor/filesystem", () => ({
  Directory: { Cache: "CACHE" },
  Filesystem: {
    writeFile: vi.fn(),
    getUri: vi.fn(),
  },
}));

vi.mock("@capacitor/share", () => ({
  Share: { share: vi.fn() },
}));

describe("shareDailyImage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shares a file when navigator.share supports files", async () => {
    const share = vi.fn(async () => {});
    Object.defineProperty(navigator, "share", {
      configurable: true,
      value: share,
    });
    Object.defineProperty(navigator, "canShare", {
      configurable: true,
      value: () => true,
    });

    const el = document.createElement("div");
    Object.defineProperty(el, "scrollWidth", { value: 100 });
    Object.defineProperty(el, "scrollHeight", { value: 200 });
    Object.defineProperty(el, "clientWidth", { value: 100 });
    Object.defineProperty(el, "clientHeight", { value: 200 });
    const result = await shareDailyImage(el, "2026-08-10");
    expect(result).toEqual({ ok: true, via: "share" });
    expect(share).toHaveBeenCalledOnce();
  });
});
