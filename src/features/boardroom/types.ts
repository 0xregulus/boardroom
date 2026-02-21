export type NodeType = "INPUT" | "STRATEGY" | "REVIEW" | "INTERACTION" | "SYNTHESIS" | "PRD" | "PERSIST";
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
  tasks?: WorkflowTask[];
}

export interface WorkflowTask {
  id: string;
  title: string;
  status: NodeStatus;
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
  mitigations: StrategicMitigationEntry[];
}

export interface StrategicMitigationEntry {
  id: string;
  sectionKey: string;
  riskTitle: string;
  description: string;
  mitigationText: string;
  resolvedAt: string;
}

export interface SocraticArtifactQuestion {
  id: string;
  prompt: string;
  sectionKey: string;
  answerLabel: string;
  placeholder: string;
  helperText: string;
}

export interface SocraticResearchLink {
  title: string;
  url: string;
  snippet: string;
  publishedDate: string | null;
}

export type SocraticPillar = "Viability" | "Integrity" | "Feasibility" | "Compliance" | "Red-Team";
export type SocraticChecklistStatus = "ready" | "attention" | "research";

export interface SocraticPersona {
  name: string;
  stance: string;
}

export interface SocraticSuggestion {
  id: string;
  sectionKey: string;
  sectionTitle: string;
  question: string;
  rationale: string;
  ghostText: string;
  pillar: SocraticPillar;
  isThinSection: boolean;
  researchLinks: SocraticResearchLink[];
}

export interface SocraticDiscoveryQuestion {
  id: string;
  sectionKey: string;
  question: string;
  placeholder: string;
}

export interface SocraticChecklistItem {
  sectionKey: string;
  sectionTitle: string;
  prompt: string;
  pillar: SocraticPillar;
  status: SocraticChecklistStatus;
}

export interface StrategicEvidenceSlot {
  id: string;
  source: string;
  link: string;
}

export type EconomicValueDriver = "Efficiency" | "Revenue" | "Risk";
export type StrategicBlastRadius = "Low" | "Medium" | "High";
export type DraftBoardAction = "simulate_red_team" | "verify_assumptions";

export interface StrategicDecisionMetadata {
  title: string;
  version: string;
  lastModified: string;
  owner: string;
  readinessScore: number;
}

export interface StrategicProblemStatementSection {
  content: string;
  logic_gaps: string[];
  evidence_slots: StrategicEvidenceSlot[];
}

export interface StrategicEconomicLogicSection {
  value_driver: EconomicValueDriver;
  base_assumptions: string[];
  capital_allocation: string;
}

export interface StrategicDownsideModelingSection {
  fail_state: string;
  blast_radius: StrategicBlastRadius;
  reversion_plan: string;
}

export interface StrategicGovernanceComplianceSection {
  regulations: string[];
  data_privacy: boolean;
}

export interface StrategicSocraticLayer {
  active_inquiry: string;
  suggested_research: string[];
  red_team_critique: string;
  logic_gaps: StrategicSocraticLogicGap[];
  risk_pills: StrategicSocraticRiskPill[];
}

export type StrategicLogicGapType = "Hygiene" | "Substance";

export interface StrategicSocraticLogicGap {
  section_key: string;
  section_title: string;
  gap: string;
  gap_type: StrategicLogicGapType;
}

export type StrategicRiskLevel = "Critical" | "Warning";

export interface StrategicSocraticRiskPill {
  section_key: string;
  section_title: string;
  risk_title: string;
  description: string;
  risk_level: StrategicRiskLevel;
}

export interface StrategicDecisionSections {
  problem_statement: StrategicProblemStatementSection;
  economic_logic: StrategicEconomicLogicSection;
  downside_modeling: StrategicDownsideModelingSection;
  governance_compliance: StrategicGovernanceComplianceSection;
}

export interface StrategicDecisionDocument {
  metadata: StrategicDecisionMetadata;
  sections: StrategicDecisionSections;
  socratic_layer: StrategicSocraticLayer;
}

export interface SocraticLiveFeedItem {
  id: string;
  sectionKey: string;
  section: string;
  message: string;
}

export interface SocraticSession {
  documentSnapshot: CreateStrategyDraft;
  suggestions: SocraticSuggestion[];
  checklist: SocraticChecklistItem[];
  confidenceScore: number;
  hygieneScore: number;
  substanceScore: number;
  thinSections: string[];
  sectionReadinessByKey: Record<string, number>;
  personaBySection: Record<string, SocraticPersona>;
  ghostTextBySection: Record<string, string>;
  discoveryQuestions: SocraticDiscoveryQuestion[];
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

export interface PortfolioInsightsStatsResponse {
  summary?: {
    avg_portfolio_dqs: number;
    total_decisions_made: number;
    total_runs_considered: number;
    risk_mitigation_rate: number;
  };
  radar?: Array<{
    agent_name: string;
    avg_sentiment: number;
    total_vetos: number;
    avg_influence: number;
    total_reviews: number;
  }>;
  blindspots?: Array<{
    gap_category: string;
    frequency: number;
  }>;
  mitigation_velocity?: {
    average_minutes: number;
    median_minutes: number;
    unresolved_count: number;
    trend_percent_30d: number | null;
    resolved: Array<{
      strategy_id: string;
      identified_at: string;
      resolved_at: string;
      minutes_to_mitigate: number;
    }>;
  };
  window_days?: number;
  error?: string;
}

export interface ReportReviewRisk {
  type: string;
  severity: number;
  evidence: string;
}

export interface ReportReviewCitation {
  url: string;
  title: string;
  claim: string;
}

export interface ReportReview {
  agent: string;
  thesis: string;
  score: number;
  confidence: number;
  blocked: boolean;
  blockers: string[];
  risks: ReportReviewRisk[];
  citations: ReportReviewCitation[];
  required_changes: string[];
  approval_conditions: string[];
  governance_checks_met: Record<string, boolean>;
}

export interface ReportSynthesis {
  executive_summary: string;
  final_recommendation: "Approved" | "Challenged" | "Blocked";
  consensus_points: string[];
  point_of_contention: string;
  residual_risks: string[];
  evidence_citations: string[];
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

export interface ReportInteractionDelta {
  agent_id: string;
  agent_name: string;
  previous_score: number;
  revised_score: number;
  score_delta: number;
  previous_blocked: boolean;
  revised_blocked: boolean;
}

export interface ReportInteractionRound {
  round: number;
  summary: string;
  deltas: ReportInteractionDelta[];
}

export interface ReportDecisionAncestryOutcome {
  gate_decision: string | null;
  final_recommendation: "Approved" | "Challenged" | "Blocked" | null;
  dqs: number | null;
  run_at: string;
}

export interface ReportDecisionAncestryMatch {
  decision_id: string;
  decision_name: string;
  similarity: number;
  outcome: ReportDecisionAncestryOutcome;
  lessons: string[];
  summary: string;
}

export interface ReportHygieneFinding {
  check: string;
  status: "pass" | "warning" | "fail";
  detail: string;
  score_impact: number;
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
  hygiene_score: number;
  substance_score: number;
  confidence_score: number;
  dissent_penalty: number;
  confidence_penalty: number;
  status: string;
  run_id?: number;
  run_created_at?: string;
  missing_sections: string[];
  decision_ancestry_retrieval_method?: "vector-db" | "lexical-fallback";
  interaction_rounds?: ReportInteractionRound[];
  decision_ancestry: ReportDecisionAncestryMatch[];
  hygiene_findings: ReportHygieneFinding[];
  artifact_assistant_questions: string[];
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
