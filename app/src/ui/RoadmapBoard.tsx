// RoadmapBoard — full-screen modal for Roadmap items (Sprint 5 T3)
// Opened only via Cmd+Shift+E. No chrome added to HomeView.
import { useState, useEffect, useCallback } from "react";
import type { RoadmapItem, RoadmapItemStatus } from "../engineer/types";
import { listAll, updateStatus } from "../db/repo/roadmapRepo";
import { insertEntry } from "../db/repo/engineerAuditRepo";
import { EngineerAgent } from "../engineer/EngineerAgent";

const FILTER_TABS: { label: string; status: RoadmapItemStatus | "all" }[] = [
  { label: "Proposed", status: "proposed" },
  { label: "Queued", status: "queued" },
  { label: "In Review", status: "review" },
  { label: "Merged", status: "merged" },
  { label: "Rejected", status: "abandoned" },
];

const ZONE_COLORS: Record<string, string> = {
  green: "#4caf50",
  yellow: "#ffc107",
  red: "#f44336",
};

function ZoneBadge({ zone }: { zone: string }) {
  return (
    <span
      data-testid="zone-badge"
      style={{
        display: "inline-block",
        padding: "2px 8px",
        borderRadius: 4,
        fontSize: "0.75rem",
        fontWeight: 600,
        color: "#fff",
        background: ZONE_COLORS[zone] ?? "#888",
        textTransform: "uppercase",
      }}
    >
      {zone}
    </span>
  );
}

type RoadmapCardProps = {
  item: RoadmapItem;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
};

function RoadmapCard({ item, onApprove, onReject }: RoadmapCardProps) {
  const canAct = item.status === "proposed";
  return (
    <div
      data-testid="roadmap-card"
      style={{
        background: "rgba(255,255,255,0.05)",
        borderRadius: 8,
        padding: "1rem",
        marginBottom: "0.75rem",
        border: "1px solid rgba(255,255,255,0.1)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.25rem" }}>
        <strong style={{ flex: 1 }}>{item.title}</strong>
        <ZoneBadge zone={item.proposed_change.zone} />
        <span style={{ opacity: 0.5, fontSize: "0.75rem" }}>
          {item.effort} · P{item.priority}
        </span>
      </div>
      <p style={{ margin: "0.25rem 0", opacity: 0.7, fontSize: "0.875rem" }}>{item.rationale}</p>
      {item.evidence.length > 0 && (
        <ul style={{ margin: "0.25rem 0 0.5rem 1rem", padding: 0, opacity: 0.6, fontSize: "0.8rem" }}>
          {item.evidence.map((e, i) => (
            <li key={i}>{e}</li>
          ))}
        </ul>
      )}
      {canAct && (
        <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.5rem" }}>
          <button
            data-testid="approve-btn"
            onClick={() => onApprove(item.id)}
            style={{
              padding: "4px 14px",
              borderRadius: 4,
              border: "none",
              background: "#4caf50",
              color: "#fff",
              cursor: "pointer",
              fontWeight: 600,
            }}
          >
            Approve
          </button>
          <button
            data-testid="reject-btn"
            onClick={() => onReject(item.id)}
            style={{
              padding: "4px 14px",
              borderRadius: 4,
              border: "none",
              background: "#555",
              color: "#fff",
              cursor: "pointer",
            }}
          >
            Reject
          </button>
        </div>
      )}
    </div>
  );
}

export type RoadmapBoardProps = {
  open: boolean;
  onClose: () => void;
};

export function RoadmapBoard({ open, onClose }: RoadmapBoardProps) {
  const [items, setItems] = useState<RoadmapItem[]>([]);
  const [activeTab, setActiveTab] = useState<RoadmapItemStatus | "all">("proposed");
  const [running, setRunning] = useState(false);

  const reload = useCallback(async () => {
    try {
      const all = await listAll();
      setItems(all);
    } catch {
      // silently ignore in test env where DB is unavailable
    }
  }, []);

  useEffect(() => {
    if (open) void reload();
  }, [open, reload]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  const handleApprove = useCallback(
    async (id: string) => {
      await updateStatus(id, "queued");
      await reload();
    },
    [reload],
  );

  const handleReject = useCallback(
    async (id: string) => {
      await updateStatus(id, "abandoned");
      await insertEntry({
        id: crypto.randomUUID(),
        timestamp: Date.now(),
        task_id: `user-reject-${id}`,
        phase: "user-reject",
        payload_json: JSON.stringify({ roadmap_id: id }),
      });
      await reload();
    },
    [reload],
  );

  const handleRunNow = useCallback(async () => {
    setRunning(true);
    try {
      const agent = new EngineerAgent();
      await agent.runDailyLoop();
      await reload();
    } finally {
      setRunning(false);
    }
  }, [reload]);

  if (!open) return null;

  const filtered =
    activeTab === "all" ? items : items.filter((i) => i.status === activeTab);

  const countFor = (status: RoadmapItemStatus | "all") =>
    status === "all" ? items.length : items.filter((i) => i.status === status).length;

  return (
    <div
      data-testid="roadmap-board"
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.85)",
        zIndex: 8000,
        display: "flex",
        flexDirection: "column",
        color: "#fff",
        fontFamily: "inherit",
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "1rem 1.5rem",
          borderBottom: "1px solid rgba(255,255,255,0.12)",
        }}
      >
        <h2 style={{ margin: 0, fontSize: "1.25rem" }}>Roadmap Board</h2>
        <div style={{ display: "flex", gap: "0.75rem", alignItems: "center" }}>
          <button
            data-testid="run-engineer-btn"
            onClick={handleRunNow}
            disabled={running}
            style={{
              padding: "6px 16px",
              borderRadius: 4,
              border: "1px solid rgba(255,255,255,0.3)",
              background: "transparent",
              color: "#fff",
              cursor: "pointer",
              opacity: running ? 0.5 : 1,
            }}
          >
            {running ? "Running…" : "Run engineer now"}
          </button>
          <button
            data-testid="close-btn"
            onClick={onClose}
            style={{
              padding: "6px 14px",
              borderRadius: 4,
              border: "none",
              background: "rgba(255,255,255,0.1)",
              color: "#fff",
              cursor: "pointer",
            }}
          >
            ✕
          </button>
        </div>
      </div>

      {/* Filter tabs */}
      <div
        style={{
          display: "flex",
          gap: "0.25rem",
          padding: "0.75rem 1.5rem 0",
          borderBottom: "1px solid rgba(255,255,255,0.08)",
        }}
      >
        {FILTER_TABS.map((tab) => (
          <button
            key={tab.status}
            data-testid={`tab-${tab.status}`}
            onClick={() => setActiveTab(tab.status)}
            style={{
              padding: "6px 14px",
              borderRadius: "4px 4px 0 0",
              border: "none",
              background: activeTab === tab.status ? "rgba(255,255,255,0.12)" : "transparent",
              color: activeTab === tab.status ? "#fff" : "rgba(255,255,255,0.5)",
              cursor: "pointer",
              fontWeight: activeTab === tab.status ? 600 : 400,
            }}
          >
            {tab.label} ({countFor(tab.status)})
          </button>
        ))}
      </div>

      {/* Item list */}
      <div
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "1rem 1.5rem",
        }}
      >
        {filtered.length === 0 ? (
          <p style={{ opacity: 0.4, textAlign: "center", marginTop: "3rem" }}>
            No items in this category yet.
          </p>
        ) : (
          filtered.map((item) => (
            <RoadmapCard
              key={item.id}
              item={item}
              onApprove={handleApprove}
              onReject={handleReject}
            />
          ))
        )}
      </div>
    </div>
  );
}
