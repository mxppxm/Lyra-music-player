import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { TrackLockButton } from "./TrackLockButton";

describe("TrackLockButton", () => {
  it("toggles aria-pressed and calls onToggle", () => {
    const onToggle = vi.fn();
    render(<TrackLockButton locked={false} onToggle={onToggle} />);
    const btn = screen.getByTestId("track-lock-btn");
    expect(btn).toHaveAttribute("aria-pressed", "false");
    expect(btn).toHaveAttribute("aria-label", "锁定播放");
    fireEvent.click(btn);
    expect(onToggle).toHaveBeenCalledOnce();
  });

  it("shows cancel label when locked", () => {
    render(<TrackLockButton locked onToggle={() => {}} />);
    const btn = screen.getByTestId("track-lock-btn");
    expect(btn).toHaveAttribute("aria-pressed", "true");
    expect(btn).toHaveAttribute("aria-label", "取消锁定播放");
    expect(btn).toHaveClass("lyra-mobile-track-lock--on");
  });

  it("does not fire when disabled", () => {
    const onToggle = vi.fn();
    render(<TrackLockButton locked={false} onToggle={onToggle} disabled />);
    fireEvent.click(screen.getByTestId("track-lock-btn"));
    expect(onToggle).not.toHaveBeenCalled();
  });
});
