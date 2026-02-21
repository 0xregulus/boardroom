export type StrategicDecisionLogStatus = "Proposed" | "In Review" | "Approved" | "Blocked";

export interface StrategicDecisionLogEntry {
  id: string;
  name: string;
  status: StrategicDecisionLogStatus;
  owner: string;
  reviewDate: string;
  summary: string;
  primaryKpi: string;
  investment: string;
  strategicObjective: string;
  confidence: string;
  detailsUrl?: string;
}

export interface DecisionForWorkflow {
  id: string;
  name: string;
  createdAt: string;
  bodyText: string;
  properties: Record<string, unknown>;
  governanceChecks: Record<string, boolean>;
}

export interface DecisionAncestryCandidate {
  id: string;
  name: string;
  summary: string;
  bodyText: string;
  gateDecision: string | null;
  dqs: number | null;
  finalRecommendation: "Approved" | "Challenged" | "Blocked" | null;
  executiveSummary: string;
  blockers: string[];
  requiredRevisions: string[];
  lastRunAt: string;
}

export interface DecisionAncestryEmbedding {
  decisionId: string;
  sourceHash: string;
  embeddingModel: string;
  embeddingProvider: string;
  embeddingDimensions: number;
  embedding: number[];
  updatedAt: string;
}

export interface DecisionUpsertInput {
  id: string;
  name: string;
  status?: string | null;
  owner?: string | null;
  reviewDate?: string | null;
  summary?: string | null;
  primaryKpi?: string | null;
  investmentRequired?: number | null;
  strategicObjective?: string | null;
  confidence?: string | null;
  baseline?: number | null;
  target?: number | null;
  timeHorizon?: string | null;
  probabilityOfSuccess?: string | null;
  leverageScore?: string | null;
  riskAdjustedRoi?: number | null;
  benefit12mGross?: number | null;
  decisionType?: string | null;
  mitigations?: unknown[] | null;
  detailsUrl?: string | null;
  createdAt?: string | null;
}

export interface WorkflowRunRecord {
  id: number;
  decisionId: string;
  dqs: number;
  gateDecision: string;
  workflowStatus: string;
  decisionName: string | null;
  stateStatus: string | null;
  summaryLine: string | null;
  missingSections: string[];
  createdAt: string;
  reviewStances: WorkflowRunReviewStanceSummary[];
  riskFindingsCount: number;
  mitigationCount: number;
  pendingMitigationsCount: number;
  frictionScore: number;
}

export interface WorkflowRunReviewStanceSummary {
  agent: string;
  stance: "approved" | "caution" | "blocked";
  score: number;
  confidence: number;
}

export interface PortfolioInsightsSummary {
  avgPortfolioDqs: number;
  totalDecisionsMade: number;
  totalRunsConsidered: number;
  riskMitigationRate: number;
}

export interface PortfolioInsightsRadarEntry {
  agentName: string;
  avgSentiment: number;
  totalVetos: number;
  avgInfluence: number;
  totalReviews: number;
}

export interface PortfolioInsightsBlindspotEntry {
  gapCategory: string;
  frequency: number;
}

export interface PortfolioInsightsMitigationVelocityEntry {
  strategyId: string;
  identifiedAt: string;
  resolvedAt: string;
  minutesToMitigate: number;
}

export interface PortfolioInsightsMitigationVelocity {
  averageMinutes: number;
  medianMinutes: number;
  unresolvedCount: number;
  trendPercent30d: number | null;
  resolved: PortfolioInsightsMitigationVelocityEntry[];
}

export interface PortfolioInsightsStats {
  summary: PortfolioInsightsSummary;
  radar: PortfolioInsightsRadarEntry[];
  blindspots: PortfolioInsightsBlindspotEntry[];
  mitigationVelocity: PortfolioInsightsMitigationVelocity;
}
