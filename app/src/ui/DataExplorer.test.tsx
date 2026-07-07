import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { DataExplorer } from "./DataExplorer";

vi.mock("../db/repo/turnRepo", () => ({
  listRecentTurns: vi.fn(() => Promise.resolve([])),
}));
vi.mock("../db/repo/soulRepo", () => ({
  loadSoulState: vi.fn(() => Promise.resolve(null)),
}));
vi.mock("../db/repo/sharedMemoryRepo", () => ({
  listRecent: vi.fn(() => Promise.resolve([])),
}));
vi.mock("../db/repo/libraryRepo", () => ({
  listAll: vi.fn(() => Promise.resolve([])),
}));
vi.mock("../db/repo/libraryFeaturesRepo", () => ({
  getBatch: vi.fn(() => Promise.resolve(new Map())),
}));
vi.mock("../db/repo/perceptionAuditRepo", () => ({
  listRecent: vi.fn(() => Promise.resolve([])),
}));
vi.mock("../db/repo/engineerAuditRepo", () => ({
  listRecent: vi.fn(() => Promise.resolve([])),
}));
vi.mock("../db/repo/roadmapRepo", () => ({
  listAll: vi.fn(() => Promise.resolve([])),
}));
vi.mock("../db/repo/featureRequestRepo", () => ({
  listSince: vi.fn(() => Promise.resolve([])),
}));
vi.mock("../memory/fileIO", () => ({
  readMemoryFile: vi.fn(() => Promise.resolve("")),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe("DataExplorer", () => {
  it("does not render when open=false", () => {
    render(<DataExplorer open={false} onClose={() => {}} />);
    expect(screen.queryByTestId("data-explorer")).toBeNull();
  });

  it("renders modal + tab strip when open", () => {
    render(<DataExplorer open={true} onClose={() => {}} />);
    expect(screen.getByTestId("data-explorer")).toBeInTheDocument();
    expect(screen.getByTestId("tab-turns")).toBeInTheDocument();
    expect(screen.getByTestId("tab-soul")).toBeInTheDocument();
    expect(screen.getByTestId("tab-salient")).toBeInTheDocument();
    expect(screen.getByTestId("tab-library")).toBeInTheDocument();
    expect(screen.getByTestId("tab-perception")).toBeInTheDocument();
    expect(screen.getByTestId("tab-roadmap")).toBeInTheDocument();
    expect(screen.getByTestId("tab-features_req")).toBeInTheDocument();
    expect(screen.getByTestId("tab-engineer")).toBeInTheDocument();
    expect(screen.getByTestId("tab-memory_md")).toBeInTheDocument();
  });

  it("starts on the turns tab and shows empty-state when there are no turns", async () => {
    render(<DataExplorer open={true} onClose={() => {}} />);
    await waitFor(() =>
      expect(screen.getByText(/还没有对话回合/)).toBeInTheDocument(),
    );
  });
});
