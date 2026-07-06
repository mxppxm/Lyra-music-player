import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { TraceStrip } from "./TraceStrip";

describe("TraceStrip", () => {
  it("renders nothing when items is empty", () => {
    render(<TraceStrip items={[]} />);
    expect(screen.queryByTestId("trace-strip")).toBeNull();
  });

  it("renders up to 5 items", () => {
    const items = Array.from({ length: 7 }, (_, i) => ({
      id: `t${i}`,
      coverUrl: `/c/${i}.jpg`,
    }));
    render(<TraceStrip items={items} />);
    expect(screen.getAllByRole("button")).toHaveLength(5);
  });

  it("calls onSelect with item id when a trace is clicked", () => {
    const spy = vi.fn();
    const items = [
      { id: "latest", coverUrl: "/1.jpg" },
      { id: "prev", coverUrl: "/2.jpg" },
    ];
    render(<TraceStrip items={items} onSelect={spy} />);
    fireEvent.click(screen.getAllByRole("button")[0]);
    expect(spy).toHaveBeenCalledWith("latest");
  });
});
