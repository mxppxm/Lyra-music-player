import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { InputBox } from "./InputBox";

function setup() {
  const onSubmit = vi.fn();
  render(<InputBox onSubmit={onSubmit} />);
  const textarea = screen.getByRole("textbox") as HTMLTextAreaElement;
  const send = screen.getByRole("button", { name: "发送" });
  return { onSubmit, textarea, send };
}

describe("InputBox", () => {
  it("submits and drops focus when the send button is tapped", () => {
    const { onSubmit, textarea, send } = setup();
    textarea.focus();
    fireEvent.change(textarea, { target: { value: "  今天有点累  " } });

    fireEvent.click(send);

    expect(onSubmit).toHaveBeenCalledWith("今天有点累");
    expect(textarea.value).toBe("");
    // Focus is what keeps the iOS soft keyboard on screen after sending.
    expect(document.activeElement).not.toBe(textarea);
  });

  it("submits on Enter instead of inserting a newline", () => {
    const { onSubmit, textarea } = setup();
    fireEvent.change(textarea, { target: { value: "想听点安静的" } });

    const notCancelled = fireEvent.keyDown(textarea, { key: "Enter" });

    expect(onSubmit).toHaveBeenCalledWith("想听点安静的");
    expect(notCancelled).toBe(false);
  });

  it("lets Enter commit an IME candidate without sending", () => {
    const { onSubmit, textarea } = setup();
    fireEvent.change(textarea, { target: { value: "xiangting" } });

    fireEvent.keyDown(textarea, { key: "Enter", isComposing: true });

    expect(onSubmit).not.toHaveBeenCalled();
    expect(textarea.value).toBe("xiangting");
  });

  it("keeps Shift+Enter as a newline", () => {
    const { onSubmit, textarea } = setup();
    fireEvent.change(textarea, { target: { value: "第一行" } });

    fireEvent.keyDown(textarea, { key: "Enter", shiftKey: true });

    expect(onSubmit).not.toHaveBeenCalled();
  });
});
