// DataExplorer — full-screen read-only view of every persisted Lyra state.
// Opened via Cmd+Shift+D. Purely for observability; nothing here mutates.

import { useState, useEffect, useCallback } from "react";
import type { DialogueTurn, LibraryTrack, SoulState } from "../types";
import type { SalientMoment } from "../memory/types";
import * as turnRepo from "../db/repo/turnRepo";
import * as soulRepo from "../db/repo/soulRepo";
import * as sharedMemoryRepo from "../db/repo/sharedMemoryRepo";
import * as libraryRepo from "../db/repo/libraryRepo";
import * as libraryFeaturesRepo from "../db/repo/libraryFeaturesRepo";
import type { LibraryFeatures } from "../db/repo/libraryFeaturesRepo";
import * as perceptionAuditRepo from "../db/repo/perceptionAuditRepo";
import type { PerceptionAuditRow } from "../db/repo/perceptionAuditRepo";
import * as engineerAuditRepo from "../db/repo/engineerAuditRepo";
import type { EngineerAuditEntry } from "../engineer/types";
import * as roadmapRepo from "../db/repo/roadmapRepo";
import type { RoadmapItem } from "../engineer/types";
import * as featureRequestRepo from "../db/repo/featureRequestRepo";
import type { FeatureRequest } from "../engineer/types";
import { readMemoryFile } from "../memory/fileIO";

type TabId =
  | "turns"
  | "soul"
  | "salient"
  | "library"
  | "perception"
  | "roadmap"
  | "features_req"
  | "engineer"
  | "memory_md";

const TABS: { id: TabId; label: string }[] = [
  { id: "turns", label: "对话回合" },
  { id: "soul", label: "灵魂状态" },
  { id: "salient", label: "显著时刻" },
  { id: "library", label: "曲库 + 特征" },
  { id: "perception", label: "感知审计" },
  { id: "roadmap", label: "Roadmap" },
  { id: "features_req", label: "功能请求" },
  { id: "engineer", label: "工程师审计" },
  { id: "memory_md", label: "memory.md" },
];

export type DataExplorerProps = {
  open: boolean;
  onClose: () => void;
};

export function DataExplorer({ open, onClose }: DataExplorerProps) {
  const [tab, setTab] = useState<TabId>("turns");
  const [expandedRowId, setExpandedRowId] = useState<string | null>(null);

  const toggleRow = useCallback((id: string) => {
    setExpandedRowId((cur) => (cur === id ? null : id));
  }, []);

  // Reset expansion when tab changes
  useEffect(() => setExpandedRowId(null), [tab]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      data-testid="data-explorer"
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.9)",
        zIndex: 8500,
        display: "flex",
        flexDirection: "column",
        color: "#fff",
        fontFamily:
          "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
        fontSize: "0.875rem",
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
          padding: "1rem 1.5rem",
          borderBottom: "1px solid rgba(255,255,255,0.1)",
        }}
      >
        <h2 style={{ margin: 0, fontWeight: 400, letterSpacing: "0.03em" }}>
          Data Explorer
        </h2>
        <span style={{ marginLeft: "1rem", opacity: 0.5, fontSize: "0.8rem" }}>
          Cmd+Shift+D · read-only · Esc to close
        </span>
        <button
          onClick={onClose}
          style={{
            marginLeft: "auto",
            padding: "6px 14px",
            borderRadius: 4,
            border: "1px solid rgba(255,255,255,0.2)",
            background: "transparent",
            color: "#fff",
            cursor: "pointer",
          }}
        >
          Close
        </button>
      </div>

      {/* Tabs */}
      <div
        style={{
          display: "flex",
          padding: "0 1.5rem",
          gap: "0.25rem",
          borderBottom: "1px solid rgba(255,255,255,0.1)",
          overflowX: "auto",
        }}
      >
        {TABS.map((t) => (
          <button
            key={t.id}
            data-testid={`tab-${t.id}`}
            onClick={() => setTab(t.id)}
            style={{
              padding: "0.75rem 1rem",
              background: "transparent",
              border: "none",
              borderBottom:
                tab === t.id
                  ? "2px solid #4caf50"
                  : "2px solid transparent",
              color: tab === t.id ? "#fff" : "rgba(255,255,255,0.6)",
              cursor: "pointer",
              whiteSpace: "nowrap",
              fontSize: "0.875rem",
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "1rem 1.5rem",
        }}
      >
        {tab === "turns" && (
          <TurnsPanel expandedId={expandedRowId} onToggle={toggleRow} />
        )}
        {tab === "soul" && <SoulPanel />}
        {tab === "salient" && (
          <SalientPanel expandedId={expandedRowId} onToggle={toggleRow} />
        )}
        {tab === "library" && (
          <LibraryPanel expandedId={expandedRowId} onToggle={toggleRow} />
        )}
        {tab === "perception" && (
          <PerceptionAuditPanel expandedId={expandedRowId} onToggle={toggleRow} />
        )}
        {tab === "roadmap" && (
          <RoadmapPanel expandedId={expandedRowId} onToggle={toggleRow} />
        )}
        {tab === "features_req" && (
          <FeatureRequestsPanel expandedId={expandedRowId} onToggle={toggleRow} />
        )}
        {tab === "engineer" && (
          <EngineerAuditPanel expandedId={expandedRowId} onToggle={toggleRow} />
        )}
        {tab === "memory_md" && <MemoryMdPanel />}
      </div>
    </div>
  );
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatTs(ms: number): string {
  return new Date(ms).toLocaleString();
}

function JsonBlock({ data }: { data: unknown }) {
  return (
    <pre
      style={{
        background: "rgba(0,0,0,0.4)",
        padding: "0.75rem",
        borderRadius: 4,
        fontSize: "0.75rem",
        margin: "0.5rem 0 0 0",
        overflowX: "auto",
        whiteSpace: "pre-wrap",
        wordBreak: "break-word",
      }}
    >
      {JSON.stringify(data, null, 2)}
    </pre>
  );
}

type RowShellProps = {
  id: string;
  expanded: boolean;
  onToggle: (id: string) => void;
  summary: React.ReactNode;
  detail: unknown;
};

function RowShell({ id, expanded, onToggle, summary, detail }: RowShellProps) {
  return (
    <div
      data-testid="data-row"
      onClick={() => onToggle(id)}
      style={{
        padding: "0.75rem 1rem",
        borderBottom: "1px solid rgba(255,255,255,0.06)",
        cursor: "pointer",
        background: expanded ? "rgba(255,255,255,0.03)" : "transparent",
      }}
    >
      {summary}
      {expanded && <JsonBlock data={detail} />}
    </div>
  );
}

function Empty({ label }: { label: string }) {
  return (
    <p style={{ opacity: 0.5, padding: "1rem 0" }}>{label}</p>
  );
}

// ─── Panels ─────────────────────────────────────────────────────────────────

type PanelProps = {
  expandedId: string | null;
  onToggle: (id: string) => void;
};

function TurnsPanel({ expandedId, onToggle }: PanelProps) {
  const [rows, setRows] = useState<DialogueTurn[] | null>(null);
  useEffect(() => {
    turnRepo.listRecentTurns(100).then(setRows).catch(() => setRows([]));
  }, []);
  if (rows === null) return <Empty label="加载中…" />;
  if (rows.length === 0) return <Empty label="还没有对话回合" />;

  return (
    <>
      {rows.map((t) => (
        <RowShell
          key={t.id}
          id={t.id}
          expanded={expandedId === t.id}
          onToggle={onToggle}
          summary={
            <div style={{ display: "flex", gap: "0.75rem" }}>
              <span style={{ opacity: 0.5, minWidth: 160 }}>
                {formatTs(t.timestamp)}
              </span>
              <span style={{ flex: 1 }}>
                <strong>{t.user_utterance.modality}</strong>
                {" · "}
                {t.user_utterance.content
                  ? t.user_utterance.content.slice(0, 80)
                  : "(空 · autoAdvance)"}
              </span>
              <span style={{ opacity: 0.7 }}>
                → {t.agent_response.rationale?.slice(0, 40) ?? "no rationale"}
              </span>
            </div>
          }
          detail={t}
        />
      ))}
    </>
  );
}

function SoulPanel() {
  const [soul, setSoul] = useState<SoulState | null | undefined>(undefined);
  useEffect(() => {
    soulRepo.loadSoulState("lyra_001").then(setSoul).catch(() => setSoul(null));
  }, []);
  if (soul === undefined) return <Empty label="加载中…" />;
  if (soul === null) return <Empty label="灵魂状态还没写入过" />;
  return <JsonBlock data={soul} />;
}

function SalientPanel({ expandedId, onToggle }: PanelProps) {
  const [rows, setRows] = useState<SalientMoment[] | null>(null);
  useEffect(() => {
    sharedMemoryRepo.listRecent(50).then(setRows).catch(() => setRows([]));
  }, []);
  if (rows === null) return <Empty label="加载中…" />;
  if (rows.length === 0) return <Empty label="还没有显著时刻" />;
  return (
    <>
      {rows.map((m, i) => {
        const rowId = `salient-${i}`;
        return (
          <RowShell
            key={rowId}
            id={rowId}
            expanded={expandedId === rowId}
            onToggle={onToggle}
            summary={
              <div style={{ display: "flex", gap: "0.75rem" }}>
                <span style={{ opacity: 0.5, minWidth: 200 }}>
                  {m.timestampISO}
                </span>
                <span style={{ flex: 1 }}>{m.songTitle}</span>
                <span style={{ opacity: 0.7 }}>{m.narrative}</span>
              </div>
            }
            detail={m}
          />
        );
      })}
    </>
  );
}

function LibraryPanel({ expandedId, onToggle }: PanelProps) {
  const [tracks, setTracks] = useState<LibraryTrack[] | null>(null);
  const [features, setFeatures] = useState<Map<string, LibraryFeatures>>(new Map());
  useEffect(() => {
    (async () => {
      try {
        const all = await libraryRepo.listAll();
        setTracks(all);
        const f = await libraryFeaturesRepo.getBatch(all.map((t) => t.id));
        setFeatures(f);
      } catch {
        setTracks([]);
      }
    })();
  }, []);
  if (tracks === null) return <Empty label="加载中…" />;
  if (tracks.length === 0) return <Empty label="曲库为空 — 先在 Settings 里导入一个文件夹" />;
  return (
    <>
      <p style={{ opacity: 0.6, marginBottom: "0.75rem" }}>
        共 {tracks.length} 首，有音频特征 {features.size} 首。
      </p>
      {tracks.map((t) => {
        const f = features.get(t.id);
        return (
          <RowShell
            key={t.id}
            id={t.id}
            expanded={expandedId === t.id}
            onToggle={onToggle}
            summary={
              <div style={{ display: "flex", gap: "0.75rem" }}>
                <span style={{ flex: 1 }}>
                  <strong>{t.title ?? "(无标题)"}</strong>
                  {" — "}
                  {t.artist ?? "(无艺人)"}
                </span>
                <span style={{ opacity: 0.6, minWidth: 140 }}>
                  {f
                    ? `energy ${(f.energy ?? 0).toFixed(2)} · valence ${(f.valence ?? 0).toFixed(2)}`
                    : "no features"}
                </span>
              </div>
            }
            detail={{ track: t, features: f ?? null }}
          />
        );
      })}
    </>
  );
}

function PerceptionAuditPanel({ expandedId, onToggle }: PanelProps) {
  const [rows, setRows] = useState<PerceptionAuditRow[] | null>(null);
  useEffect(() => {
    perceptionAuditRepo.listRecent(100).then(setRows).catch(() => setRows([]));
  }, []);
  if (rows === null) return <Empty label="加载中…" />;
  if (rows.length === 0) return <Empty label="感知层还没写入过（开启 perception 后每 60s 会有一条）" />;
  return (
    <>
      {rows.map((r) => {
        let bias: { reason?: string; confidence?: number } = {};
        try {
          bias = JSON.parse(r.bias_json);
        } catch { /* ignore */ }
        return (
          <RowShell
            key={r.id}
            id={r.id}
            expanded={expandedId === r.id}
            onToggle={onToggle}
            summary={
              <div style={{ display: "flex", gap: "0.75rem" }}>
                <span style={{ opacity: 0.5, minWidth: 160 }}>
                  {formatTs(r.ts)}
                </span>
                <span style={{ opacity: 0.7, minWidth: 60 }}>{r.source}</span>
                <span style={{ flex: 1 }}>
                  {bias.reason ?? "(no reason)"}
                </span>
                <span style={{ opacity: 0.6 }}>
                  conf {bias.confidence ?? 0}
                </span>
              </div>
            }
            detail={{
              ...r,
              features: (() => {
                try {
                  return JSON.parse(r.features_json);
                } catch {
                  return r.features_json;
                }
              })(),
              bias: bias,
            }}
          />
        );
      })}
    </>
  );
}

function RoadmapPanel({ expandedId, onToggle }: PanelProps) {
  const [rows, setRows] = useState<RoadmapItem[] | null>(null);
  useEffect(() => {
    roadmapRepo.listAll().then(setRows).catch(() => setRows([]));
  }, []);
  if (rows === null) return <Empty label="加载中…" />;
  if (rows.length === 0) return <Empty label="工程师 agent 还没提议过任何 roadmap item" />;
  return (
    <>
      {rows.map((r) => (
        <RowShell
          key={r.id}
          id={r.id}
          expanded={expandedId === r.id}
          onToggle={onToggle}
          summary={
            <div style={{ display: "flex", gap: "0.75rem" }}>
              <span style={{ opacity: 0.5, minWidth: 100 }}>{r.status}</span>
              <span style={{ opacity: 0.7, minWidth: 80 }}>
                {r.proposed_change.zone}
              </span>
              <span style={{ flex: 1 }}>{r.title}</span>
              <span style={{ opacity: 0.5 }}>P{r.priority}</span>
            </div>
          }
          detail={r}
        />
      ))}
    </>
  );
}

function FeatureRequestsPanel({ expandedId, onToggle }: PanelProps) {
  const [rows, setRows] = useState<FeatureRequest[] | null>(null);
  useEffect(() => {
    featureRequestRepo
      .listSince(0)
      .then(setRows)
      .catch(() => setRows([]));
  }, []);
  if (rows === null) return <Empty label="加载中…" />;
  if (rows.length === 0) return <Empty label="其他 agent 还没提过功能请求" />;
  return (
    <>
      {rows.map((r) => (
        <RowShell
          key={r.id}
          id={r.id}
          expanded={expandedId === r.id}
          onToggle={onToggle}
          summary={
            <div style={{ display: "flex", gap: "0.75rem" }}>
              <span style={{ opacity: 0.5, minWidth: 160 }}>
                {formatTs(r.created_at)}
              </span>
              <span style={{ opacity: 0.7, minWidth: 100 }}>{r.from_agent}</span>
              <span style={{ opacity: 0.6, minWidth: 60 }}>{r.urgency}</span>
              <span style={{ flex: 1 }}>{r.desire}</span>
              <span style={{ opacity: 0.5 }}>
                {r.consumed ? "consumed" : "pending"}
              </span>
            </div>
          }
          detail={r}
        />
      ))}
    </>
  );
}

function EngineerAuditPanel({ expandedId, onToggle }: PanelProps) {
  const [rows, setRows] = useState<EngineerAuditEntry[] | null>(null);
  useEffect(() => {
    engineerAuditRepo.listRecent(100).then(setRows).catch(() => setRows([]));
  }, []);
  if (rows === null) return <Empty label="加载中…" />;
  if (rows.length === 0) return <Empty label="工程师 agent 还没运行过" />;
  return (
    <>
      {rows.map((r) => (
        <RowShell
          key={r.id}
          id={r.id}
          expanded={expandedId === r.id}
          onToggle={onToggle}
          summary={
            <div style={{ display: "flex", gap: "0.75rem" }}>
              <span style={{ opacity: 0.5, minWidth: 160 }}>
                {formatTs(r.timestamp)}
              </span>
              <span style={{ opacity: 0.7, minWidth: 200 }}>{r.task_id}</span>
              <span style={{ flex: 1 }}>{r.phase}</span>
            </div>
          }
          detail={{
            ...r,
            payload: (() => {
              try {
                return JSON.parse(r.payload_json);
              } catch {
                return r.payload_json;
              }
            })(),
          }}
        />
      ))}
    </>
  );
}

function MemoryMdPanel() {
  const [content, setContent] = useState<string | null>(null);
  useEffect(() => {
    readMemoryFile().then(setContent).catch(() => setContent(""));
  }, []);
  if (content === null) return <Empty label="加载中…" />;
  if (content.trim() === "") return <Empty label="memory.md 还是空的（第一次 Reflect 后会有内容）" />;
  return (
    <pre
      style={{
        background: "rgba(0,0,0,0.4)",
        padding: "1rem",
        borderRadius: 4,
        fontSize: "0.8rem",
        whiteSpace: "pre-wrap",
        wordBreak: "break-word",
      }}
    >
      {content}
    </pre>
  );
}
