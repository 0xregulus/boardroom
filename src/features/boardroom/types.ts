export type NodeType = "INPUT" | "STRATEGY" | "REVIEW" | "SYNTHESIS" | "PRD" | "PERSIST";
export type NodeStatus = "IDLE" | "RUNNING" | "COMPLETED" | "FAILED";
export type ActiveTab = "editor" | "preview";
export type WorkspaceView = "dashboard" | "agent-config";
export type AgentConfigSyncStatus = "loading" | "saving" | "saved" | "dirty" | "error";
export type AppStage = "list" | "create" | "workspace";
export type StrategyStatus = "Proposed" | "In Review" | "Approved" | "Blocked";
export type MatrixSectionKey = "optionsEvaluated" | "riskMatrix";
export type ChessPiece = "king" | "bishop" | "knight" | "rook" | "pawn";

export interface NodePosition {
  x: number;
  y: number;
}

export interface WorkflowNode {
  id: string;
  type: NodeType;
  title: string;
  subtitle: string;
  position: NodePosition;
  status: NodeStatus;
  tasks?: string[];
}

export interface WorkflowEdge {
  id: string;
  source: string;
  target: string;
}

export interface DecisionStrategy {
  id: string;
  name: string;
  status: StrategyStatus;
  owner: string;
  reviewDate: string;
  summary: string;
  primaryKpi: string;
  investment: string;
  strategicObjective: string;
  confidence: string;
  detailsUrl?: string;
  artifactSections?: Record<string, string>;
}

export interface StrategicSectionTemplate {
  key: string;
  title: string;
  defaultValue: string;
}

export interface DraftCoreProperties {
  strategicObjective: string;
  primaryKpi: string;
  baseline: string;
  target: string;
  timeHorizon: string;
  decisionType: string;
}

export interface DraftCapitalAllocation {
  investmentRequired: number;
  grossBenefit12m: number;
  probabilityOfSuccess: string;
  strategicLeverageScore: string;
  reversibilityFactor: string;
}

export interface DraftRiskProperties {
  regulatoryRisk: string;
  technicalRisk: string;
  operationalRisk: string;
  reputationalRisk: string;
}

export interface CreateStrategyDraft {
  name: string;
  owner: string;
  reviewDate: string;
  primaryKpi: string;
  investment: string;
  strategicObjective: string;
  confidence: string;
  coreProperties: DraftCoreProperties;
  capitalAllocation: DraftCapitalAllocation;
  riskProperties: DraftRiskProperties;
  sections: Record<string, string>;
}

export interface SectionMatrix {
  headers: string[];
  rows: string[][];
}

export interface ApiResult {
  mode: "single" | "all_proposed";
  result?: unknown;
  results?: unknown[];
  count?: number;
}

export interface WorkflowRunHistoryResponse {
  runs?: WorkflowRunEntry[];
  error?: string;
  details?: string;
}

export interface WorkflowRunEntry {
  id: number;
  decision_id: string;
  dqs: number;
  gate_decision: string;
  workflow_status: string;
  state_preview: unknown;
  created_at: string;
}

export interface WorkflowRunStateEntry {
  id: number;
  createdAt: string;
  state: unknown;
}

export interface StrategyListResponse {
  strategies?: DecisionStrategy[];
  error?: string;
  details?: string;
}

export interface StrategyDetailsResponse {
  strategy?: DecisionStrategy;
  error?: string;
  details?: string;
}

export interface ReportReviewRisk {
  type: string;
  severity: number;
  evidence: string;
}

export interface ReportReview {
  agent: string;
  thesis: string;
  score: number;
  confidence: number;
  blocked: boolean;
  blockers: string[];
  risks: ReportReviewRisk[];
  required_changes: string[];
  approval_conditions: string[];
  governance_checks_met: Record<string, boolean>;
}

export interface ReportSynthesis {
  executive_summary: string;
  final_recommendation: "Approved" | "Challenged" | "Blocked";
  conflicts: string[];
  blockers: string[];
  required_revisions: string[];
}

export interface ReportPrd {
  title: string;
  scope: string[];
  milestones: string[];
  telemetry: string[];
  risks: string[];
  sections: Record<string, string[]>;
}

export interface ReportDecisionSnapshot {
  properties: Record<string, unknown>;
  excerpt: string;
  governance_checks: Record<string, boolean>;
  autochecked_fields: string[];
}

export interface ReportWorkflowState {
  decision_id: string;
  decision_name: string;
  dqs: number;
  status: string;
  run_id?: number;
  run_created_at?: string;
  missing_sections: string[];
  reviews: Record<string, ReportReview>;
  synthesis: ReportSynthesis | null;
  prd: ReportPrd | null;
  decision_snapshot: ReportDecisionSnapshot | null;
  raw: unknown;
}

export interface SnapshotMetrics {
  primaryKpi: string;
  investment: number | null;
  benefit12m: number | null;
  roi: number | null;
  probability: string;
  timeHorizon: string;
  strategicObjective: string;
  leverageScore: string;
}
