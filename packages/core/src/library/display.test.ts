import { describe, it, expect } from "vitest";
import { songDisplayTitle } from "./display";

describe("songDisplayTitle", () => {
  it("prefers human title", () => {
    expect(
      songDisplayTitle({ title: "山丘", path: "/x.flac", metadata: {} }),
    ).toBe("山丘");
  });

  it("skips bili: id titles and uses raw_title", () => {
    expect(
      songDisplayTitle({
        title: "bili:BV1xx411c7mD",
        path: "bili:__pending__:BV1xx411c7mD",
        metadata: { raw_title: "李宗盛《山丘》" },
      }),
    ).toBe("李宗盛《山丘》");
  });

  it("never returns bare bili path as the last resort label", () => {
    expect(
      songDisplayTitle({
        title: "",
        path: "bili:__pending__:BV1xx",
        metadata: {},
      }),
    ).toBe("未知曲目");
  });
});
