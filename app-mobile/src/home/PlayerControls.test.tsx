import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { PlayerControls } from "./PlayerControls";

const baseProps = {
  canControl: true,
  paused: false,
  onTogglePlay: vi.fn(),
  onSkip: vi.fn(),
  onHistory: vi.fn(),
  onShare: vi.fn(),
};

describe("PlayerControls share button", () => {
  it("renders the share button to the LEFT of the history button (same row)", () => {
    render(<PlayerControls {...baseProps} />);
    const share = screen.getByTestId("share-btn");
    const history = screen.getByTestId("history-open-btn");
    expect(share).toBeInTheDocument();
    expect(history).toBeInTheDocument();
    // Same row, share on the left.
    expect(share.compareDocumentPosition(history)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
  });

  it("triggers onShare when clicked", () => {
    render(<PlayerControls {...baseProps} />);
    fireEvent.click(screen.getByTestId("share-btn"));
    expect(baseProps.onShare).toHaveBeenCalledTimes(1);
  });

  it("is disabled when playback is unavailable (no current song)", () => {
    render(<PlayerControls {...baseProps} canControl={false} />);
    expect(screen.getByTestId("share-btn")).toBeDisabled();
  });

  it("does not render share button when no onShare handler is provided", () => {
    render(
      <PlayerControls
        {...baseProps}
        onShare={undefined}
      />,
    );
    expect(screen.queryByTestId("share-btn")).not.toBeInTheDocument();
  });
});

describe("PlayerControls previous / skip gates", () => {
  it("enables previous when canGoPrevious and onPrevious are set", () => {
    const onPrevious = vi.fn();
    render(
      <PlayerControls
        {...baseProps}
        canGoPrevious
        onPrevious={onPrevious}
      />,
    );
    const prev = screen.getByTestId("prev-btn");
    expect(prev).not.toBeDisabled();
    fireEvent.click(prev);
    expect(onPrevious).toHaveBeenCalledTimes(1);
  });

  it("disables skip when canSkip is false", () => {
    render(<PlayerControls {...baseProps} canSkip={false} />);
    expect(screen.getByTestId("skip-btn")).toBeDisabled();
  });
});
