import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

// ── Mock DB repos ─────────────────────────────────────────────────────────────
const listAllMock = vi.fn();
const updateStatusMock = vi.fn();
const insertEntryMock = vi.fn();

vi.mock("../db/repo/roadmapRepo", () => ({
  listAll: (...a: unknown[]) => listAllMock(...a),
  updateStatus: (...a: unknown[]) => updateStatusMock(...a),
}));

vi.mock("../db/repo/engineerAuditRepo", () => ({
  insertEntry: (...a: unknown[]) => insertEntryMock(...a),
}));

// ── Mock EngineerAgent ────────────────────────────────────────────────────────
const runDailyLoopMock = vi.fn();
vi.mock("../engineer/EngineerAgent", () => ({
  EngineerAgent: vi.fn().mockImplementation(() => ({
    runDailyLoop: runDailyLoopMock,
  })),
}));

import { RoadmapBoard } from "./RoadmapBoard";
import type { RoadmapItem } from "../engineer/types";

const makeItem = (overrides: Partial<RoadmapItem> = {}): RoadmapItem => ({
  id: "rm-01",
  created_at: Date.now(),
  created_by: "engineer-daily",
  title: "Add zen theme",
  rationale: "Users want a calmer look.",
  evidence: ["feature_request fr-01"],
  proposed_change: { zone: "green", files: ["themes/zen.css"], summary: "Add zen CSS" },
  status: "proposed",
  priority: 70,
  effort: "S",
  ...overrides,
});

beforeEach(() => {
  listAllMock.mockReset().mockResolvedValue([]);
  updateStatusMock.mockReset().mockResolvedValue(undefined);
  insertEntryMock.mockReset().mockResolvedValue(undefined);
  runDailyLoopMock.mockReset().mockResolvedValue({ proposed: 1, blocked: 0, skipped: [] });
});

describe("RoadmapBoard — rendering", () => {
  it("renders nothing when open=false", () => {
    render(<RoadmapBoard open={false} onClose={vi.fn()} />);
    expect(screen.queryByTestId("roadmap-board")).toBeNull();
  });

  it("renders the board when open=true", async () => {
    render(<RoadmapBoard open={true} onClose={vi.fn()} />);
    await waitFor(() => expect(screen.getByTestId("roadmap-board")).toBeTruthy());
    expect(screen.getByText("Roadmap Board")).toBeTruthy();
  });

  it("renders filter tabs", async () => {
    render(<RoadmapBoard open={true} onClose={vi.fn()} />);
    await waitFor(() => screen.getByTestId("roadmap-board"));
    expect(screen.getByTestId("tab-proposed")).toBeTruthy();
    expect(screen.getByTestId("tab-queued")).toBeTruthy();
    expect(screen.getByTestId("tab-abandoned")).toBeTruthy();
  });

  it("renders item cards when items exist", async () => {
    listAllMock.mockResolvedValue([makeItem()]);
    render(<RoadmapBoard open={true} onClose={vi.fn()} />);
    await waitFor(() => screen.getByText("Add zen theme"));
    expect(screen.getByTestId("roadmap-card")).toBeTruthy();
    expect(screen.getByText("Users want a calmer look.")).toBeTruthy();
  });

  it("shows zone badge on card", async () => {
    listAllMock.mockResolvedValue([makeItem()]);
    render(<RoadmapBoard open={true} onClose={vi.fn()} />);
    await waitFor(() => screen.getByTestId("zone-badge"));
    expect(screen.getByTestId("zone-badge").textContent).toBe("green");
  });
});

describe("RoadmapBoard — filter tabs", () => {
  it("switching tab filters the item list", async () => {
    listAllMock.mockResolvedValue([
      makeItem({ status: "proposed" }),
      makeItem({ id: "rm-02", status: "queued", title: "Queued item" }),
    ]);
    render(<RoadmapBoard open={true} onClose={vi.fn()} />);
    await waitFor(() => screen.getByText("Add zen theme"));

    // Click Queued tab
    fireEvent.click(screen.getByTestId("tab-queued"));
    await waitFor(() => expect(screen.queryByText("Add zen theme")).toBeNull());
    expect(screen.getByText("Queued item")).toBeTruthy();
  });
});

describe("RoadmapBoard — Approve flow", () => {
  it("Approve calls updateStatus with queued and reloads", async () => {
    listAllMock.mockResolvedValue([makeItem()]);
    render(<RoadmapBoard open={true} onClose={vi.fn()} />);
    await waitFor(() => screen.getByTestId("approve-btn"));

    // After click, reload — return updated item
    listAllMock.mockResolvedValueOnce([makeItem({ status: "queued" })]);
    fireEvent.click(screen.getByTestId("approve-btn"));

    await waitFor(() => expect(updateStatusMock).toHaveBeenCalledWith("rm-01", "queued"));
  });
});

describe("RoadmapBoard — Reject flow", () => {
  it("Reject calls updateStatus with abandoned and writes audit entry", async () => {
    listAllMock.mockResolvedValue([makeItem()]);
    render(<RoadmapBoard open={true} onClose={vi.fn()} />);
    await waitFor(() => screen.getByTestId("reject-btn"));

    listAllMock.mockResolvedValueOnce([]);
    fireEvent.click(screen.getByTestId("reject-btn"));

    await waitFor(() => expect(updateStatusMock).toHaveBeenCalledWith("rm-01", "abandoned"));
    await waitFor(() => expect(insertEntryMock).toHaveBeenCalledOnce());
    const entry = insertEntryMock.mock.calls[0][0];
    expect(entry.phase).toBe("user-reject");
  });
});

describe("RoadmapBoard — Run engineer now", () => {
  it("calls runDailyLoop and reloads on button click", async () => {
    render(<RoadmapBoard open={true} onClose={vi.fn()} />);
    await waitFor(() => screen.getByTestId("run-engineer-btn"));

    fireEvent.click(screen.getByTestId("run-engineer-btn"));
    await waitFor(() => expect(runDailyLoopMock).toHaveBeenCalledOnce());
  });
});

describe("RoadmapBoard — close behaviour", () => {
  it("calls onClose when close button clicked", async () => {
    const onClose = vi.fn();
    render(<RoadmapBoard open={true} onClose={onClose} />);
    await waitFor(() => screen.getByTestId("close-btn"));
    fireEvent.click(screen.getByTestId("close-btn"));
    expect(onClose).toHaveBeenCalledOnce();
  });
});
