import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { InputBox } from "./InputBox";

describe("InputBox", () => {
  it("renders with the default placeholder", () => {
    render(<InputBox onSubmit={() => {}} />);
    expect(screen.getByPlaceholderText("和 Lyra 说点什么…")).toBeInTheDocument();
  });

  it("uses a custom placeholder when provided", () => {
    render(<InputBox onSubmit={() => {}} placeholder="say something" />);
    expect(screen.getByPlaceholderText("say something")).toBeInTheDocument();
  });

  it("submits on Enter and clears the input", () => {
    const spy = vi.fn();
    render(<InputBox onSubmit={spy} />);
    const input = screen.getByPlaceholderText("和 Lyra 说点什么…") as HTMLTextAreaElement;
    fireEvent.change(input, { target: { value: "最近有点累" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(spy).toHaveBeenCalledWith("最近有点累");
    expect(input.value).toBe("");
  });

  it("does not submit on Shift+Enter (multi-line)", () => {
    const spy = vi.fn();
    render(<InputBox onSubmit={spy} />);
    const input = screen.getByPlaceholderText("和 Lyra 说点什么…") as HTMLTextAreaElement;
    fireEvent.change(input, { target: { value: "line1" } });
    fireEvent.keyDown(input, { key: "Enter", shiftKey: true });
    expect(spy).not.toHaveBeenCalled();
    expect(input.value).toBe("line1");
  });

  it("disables submission when the disabled prop is set", () => {
    const spy = vi.fn();
    render(<InputBox onSubmit={spy} disabled />);
    const input = screen.getByPlaceholderText("和 Lyra 说点什么…") as HTMLTextAreaElement;
    expect(input.disabled).toBe(true);
    fireEvent.change(input, { target: { value: "x" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(spy).not.toHaveBeenCalled();
  });
});
