// Engineer Agent — core types (Sprint 5)

export type Zone = "green" | "yellow";

export type RoadmapItemCreatedBy =
  | "engineer-daily"
  | "engineer-weekly"
  | "user-verbal"
  | "user-explicit"
  | "soul-request"
  | "dream-seed";

export type RoadmapItemStatus =
  | "proposed"
  | "queued"
  | "in_progress"
  | "review"
  | "merged"
  | "abandoned"
  | "failed";

export type Effort = "S" | "M" | "L";

export type ProposedChange = {
  zone: Zone; // red rejected at ingest — never stored
  files: string[];
  summary: string;
};

export type RoadmapItem = {
  id: string;
  created_at: number;
  created_by: RoadmapItemCreatedBy;
  title: string;
  rationale: string;
  evidence: string[];
  proposed_change: ProposedChange;
  status: RoadmapItemStatus;
  priority: number; // 0-100
  effort: Effort;
};

// ── FeatureRequest ────────────────────────────────────────────────────────────

export type FeatureRequestFromAgent =
  | "companion"
  | "library"
  | "emotion"
  | "perception";

export type FeatureRequestUrgency = "nice_to_have" | "important" | "blocking";

export type FeatureRequest = {
  id: string;
  created_at: number;
  from_agent: FeatureRequestFromAgent;
  desire: string;
  observed_pattern: string;
  urgency: FeatureRequestUrgency;
  consumed: boolean;
};

// ── EngineerAudit ─────────────────────────────────────────────────────────────

export type EngineerAuditEntry = {
  id: string;
  timestamp: number;
  task_id: string;
  phase: string;
  payload_json: string;
};
