import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { SmallNote } from "./SmallNote";

vi.mock("@lyra/core/daily/trackActivity", () => ({
  trackActivity: vi.fn(async () => {}),
}));
vi.mock("@lyra/core/daily/PlaySessionTracker", () => ({
  playSessionTracker: {
    noteLyricsOpen: vi.fn(),
  },
}));

describe("SmallNote", () => {
  beforeEach(() => {
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
      x: 40,
      y: 120,
      top: 120,
      left: 40,
      width: 220,
      height: 90,
      bottom: 210,
      right: 260,
      toJSON: () => ({}),
    } as DOMRect);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders rationale text by default (no button semantics)", () => {
    render(<SmallNote text="深夜适合听点安静的" />);
    const note = screen.getByTestId("small-note");
    expect(note).toBeInTheDocument();
    expect(note.getAttribute("role")).toBeNull();
    expect(note.className).not.toContain("lyra-mobile-small-note--error");
  });

  it("shows a light loading indicator while textLoading", () => {
    render(<SmallNote text="" textLoading />);
    expect(screen.getByTestId("small-note-text-loading")).toBeInTheDocument();
  });

  it("swaps loading dots for rationale text when generation finishes", () => {
    const { rerender } = render(<SmallNote text="" textLoading />);
    expect(screen.getByTestId("small-note-text-loading")).toBeInTheDocument();
    rerender(<SmallNote text="深夜适合听点安静的" textLoading={false} />);
    expect(screen.queryByTestId("small-note-text-loading")).not.toBeInTheDocument();
    expect(screen.getByTestId("small-note")).toHaveTextContent(
      "深夜适合听点安静的",
    );
  });

  it("error notes are clickable and trigger onClick", () => {
    const onClick = vi.fn();
    render(
      <SmallNote
        text="Sensenova 429: …（点一下重试）"
        error
        onClick={onClick}
      />,
    );
    const note = screen.getByTestId("small-note");
    expect(note.className).toContain("lyra-mobile-small-note--error");
    expect(note.getAttribute("role")).toBe("button");
    fireEvent.click(note);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("flippable note shows lyrics on the back face when flipped", () => {
    const onClick = vi.fn();
    render(
      <SmallNote
        text="正面文案"
        onClick={onClick}
        flip={{ flipped: true, backText: "昨夜星辰昨夜风" }}
      />,
    );
    const note = screen.getByTestId("small-note");
    expect(note.className).toContain("lyra-mobile-small-note--flipped");
    expect(screen.getByTestId("small-note-lyrics")).toHaveTextContent(
      "昨夜星辰昨夜风",
    );
    fireEvent.click(note);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("shows loading and failed copy on the back face", () => {
    const { rerender } = render(
      <SmallNote
        text="正面"
        onClick={() => {}}
        flip={{ flipped: true, loading: true }}
      />,
    );
    const lyrics = screen.getByTestId("small-note-lyrics");
    expect(lyrics).toHaveTextContent("在找歌词");
    expect(lyrics.querySelector(".lyra-mobile-thinking__dots")).not.toBeNull();
    expect(screen.queryByTestId("small-note-expand")).not.toBeInTheDocument();

    rerender(
      <SmallNote
        text="正面"
        onClick={() => {}}
        flip={{ flipped: true, failed: true }}
      />,
    );
    expect(screen.getByTestId("small-note-lyrics")).toHaveTextContent(
      "暂时找不到歌词，点一下重试",
    );
    expect(screen.queryByTestId("small-note-expand")).not.toBeInTheDocument();
  });

  it("expand morphs the card larger without flipping; collapse shrinks back", () => {
    const onClick = vi.fn();
    const onRefresh = vi.fn();
    render(
      <SmallNote
        text="正面文案"
        onClick={onClick}
        flip={{
          flipped: true,
          backText: "昨夜星辰昨夜风\n画楼西畔桂堂东",
          onRefresh,
        }}
      />,
    );

    fireEvent.click(screen.getByTestId("small-note-expand"));
    expect(onClick).not.toHaveBeenCalled();

    const sheet = screen.getByTestId("lyrics-sheet");
    expect(sheet).toHaveTextContent("画楼西畔桂堂东");
    expect(screen.getByTestId("small-note").className).toContain(
      "lyra-mobile-small-note--morphing",
    );

    fireEvent.click(screen.getByTestId("lyrics-sheet-refresh"));
    expect(onRefresh).toHaveBeenCalledTimes(1);
    expect(onClick).not.toHaveBeenCalled();

    act(() => {
      fireEvent.click(screen.getByTestId("lyrics-sheet-close"));
    });
    const card = sheet.querySelector(
      ".lyra-mobile-lyrics-morph__card",
    ) as HTMLElement;
    act(() => {
      fireEvent.transitionEnd(card, { propertyName: "width" });
    });
    expect(screen.queryByTestId("lyrics-sheet")).not.toBeInTheDocument();
  });

  it("refresh icon spins while refreshing and does not re-fire", () => {
    const onRefresh = vi.fn();
    render(
      <SmallNote
        text="正面"
        onClick={() => {}}
        flip={{
          flipped: true,
          backText: "昨夜星辰昨夜风\n画楼西畔桂堂东",
          refreshing: true,
          onRefresh,
        }}
      />,
    );
    fireEvent.click(screen.getByTestId("small-note-expand"));
    const refresh = screen.getByTestId("lyrics-sheet-refresh");
    expect(refresh.className).toContain(
      "lyra-mobile-lyrics-morph__refresh--spin",
    );
    fireEvent.click(refresh);
    expect(onRefresh).not.toHaveBeenCalled();
  });
});
