import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { InputBox } from "./InputBox";

vi.mock("./immersiveStatusBar", () => ({
  lightTap: vi.fn(),
  setImmersiveStatusBar: vi.fn(),
}));

import { lightTap } from "./immersiveStatusBar";

function setup(props?: { collapsible?: boolean; keyboardReady?: boolean }) {
  const onSubmit = vi.fn();
  render(
    <InputBox
      onSubmit={onSubmit}
      collapsible={props?.collapsible}
      keyboardReady={props?.keyboardReady}
    />,
  );
  return { onSubmit };
}

describe("InputBox", () => {
  it("submits mood mode and drops focus when the active ↑ is tapped", () => {
    const { onSubmit } = setup();
    const textarea = screen.getByRole("textbox") as HTMLTextAreaElement;
    const moodSend = screen.getByRole("button", { name: "心情发送" });
    textarea.focus();
    fireEvent.change(textarea, { target: { value: "  今天有点累  " } });

    fireEvent.click(moodSend);

    expect(onSubmit).toHaveBeenCalledWith("今天有点累", "mood");
    expect(textarea.value).toBe("");
    expect(document.activeElement).not.toBe(textarea);
  });

  it("switches to song mode without submitting, then sends with ♪", () => {
    const { onSubmit } = setup();
    const textarea = screen.getByRole("textbox") as HTMLTextAreaElement;
    const songSwitch = screen.getByRole("button", { name: "切换到精准搜歌" });
    fireEvent.change(textarea, { target: { value: "山丘" } });

    fireEvent.click(songSwitch);
    expect(onSubmit).not.toHaveBeenCalled();
    expect(lightTap).toHaveBeenCalled();
    expect(screen.getByTestId("input-box")).toHaveAttribute("data-mode", "song");
    expect(textarea.placeholder).toMatch(/歌名/);

    const songSend = screen.getByRole("button", { name: "精准搜歌发送" });
    fireEvent.click(songSend);
    expect(onSubmit).toHaveBeenCalledWith("山丘", "song");
  });

  it("submits on Enter with the current mode", () => {
    const { onSubmit } = setup();
    const textarea = screen.getByRole("textbox") as HTMLTextAreaElement;
    const songSwitch = screen.getByRole("button", { name: "切换到精准搜歌" });
    fireEvent.change(textarea, { target: { value: "想听点安静的" } });
    fireEvent.click(songSwitch);

    const notCancelled = fireEvent.keyDown(textarea, { key: "Enter" });

    expect(onSubmit).toHaveBeenCalledWith("想听点安静的", "song");
    expect(notCancelled).toBe(false);
  });

  it("lets Enter commit an IME candidate without sending", () => {
    const { onSubmit } = setup();
    const textarea = screen.getByRole("textbox") as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: "xiangting" } });

    fireEvent.keyDown(textarea, { key: "Enter", isComposing: true });

    expect(onSubmit).not.toHaveBeenCalled();
    expect(textarea.value).toBe("xiangting");
  });

  it("keeps Shift+Enter as a newline", () => {
    const { onSubmit } = setup();
    const textarea = screen.getByRole("textbox") as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: "第一行" } });

    fireEvent.keyDown(textarea, { key: "Enter", shiftKey: true });

    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("stays short until the soft keyboard is ready, then reveals send", () => {
    const { rerender } = render(
      <InputBox onSubmit={vi.fn()} collapsible keyboardReady={false} />,
    );

    const collapsed = screen.getByRole("button", { name: "展开输入" });
    expect(collapsed).toHaveAttribute("data-phase", "idle");

    act(() => {
      fireEvent.click(collapsed);
    });
    expect(lightTap).toHaveBeenCalled();
    expect(screen.getByTestId("input-box")).toHaveAttribute("data-phase", "pending");
    expect(screen.queryByRole("button", { name: "心情发送" })).toBeNull();

    rerender(<InputBox onSubmit={vi.fn()} collapsible keyboardReady />);
    expect(screen.getByTestId("input-box")).toHaveAttribute("data-phase", "composer");
    expect(screen.getByRole("button", { name: "心情发送" })).toBeTruthy();
  });

  it("re-collapses after blur when empty and collapsible", () => {
    vi.useFakeTimers();
    setup({ collapsible: true, keyboardReady: true });

    act(() => {
      fireEvent.click(screen.getByRole("button", { name: "展开输入" }));
    });
    const textarea = screen.getByRole("textbox") as HTMLTextAreaElement;
    act(() => {
      textarea.focus();
      textarea.blur();
      vi.advanceTimersByTime(180);
    });

    expect(screen.getByRole("button", { name: "展开输入" })).toHaveAttribute(
      "data-collapsed",
      "1",
    );
    vi.useRealTimers();
  });
});
