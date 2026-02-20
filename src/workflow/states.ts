import { AgentConfig } from "../config/agent_config";
import { DecisionSnapshot, PRDOutput, ReviewOutput } from "../schemas";
import { HygieneFinding } from "./hygiene";

export type DecisionWorkflowState = "PROPOSED" | "REVIEWING" | "SYNTHESIZED" | "DECIDED" | "PERSISTED";

export interface ChairpersonSynthesis {
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

export interface DecisionAncestryMatch {
  decision_id: string;
  decision_name: string;
  similarity: number;
  outcome: {
    gate_decision: string | null;
    final_recommendation: "Approved" | "Challenged" | "Blocked" | null;
    dqs: number | null;
    run_at: string;
  };
  lessons: string[];
  summary: string;
}

export interface AgentInteractionDelta {
  agent_id: string;
  agent_name: string;
  previous_score: number;
  revised_score: number;
  score_delta: number;
  previous_blocked: boolean;
  revised_blocked: boolean;
}

export interface AgentInteractionRound {
  round: number;
  summary: string;
  deltas: AgentInteractionDelta[];
}

export interface WorkflowMarketIntelligenceSignal {
  analyst: string;
  lens: string;
  query: string;
  highlights: string[];
  source_urls: string[];
}

export interface WorkflowMarketIntelligence {
  generated_at: string;
  highlights: string[];
  source_urls: string[];
  signals: WorkflowMarketIntelligenceSignal[];
}

export interface WorkflowEvidenceVerificationAgentResult {
  agent_id: string;
  agent_name: string;
  verdict: "sufficient" | "insufficient";
  citation_count: number;
  risk_evidence_count: number;
  gaps: string[];
}

export interface WorkflowEvidenceVerification {
  generated_at: string;
  verdict: "sufficient" | "insufficient";
  summary: string;
  required_actions: string[];
  by_agent: WorkflowEvidenceVerificationAgentResult[];
}

export interface WorkflowState {
  decision_id: string;
  user_context: Record<string, unknown>;
  business_constraints: Record<string, unknown>;
  strategic_goals: string[];
  decision_snapshot: DecisionSnapshot | null;
  reviews: Record<string, ReviewOutput>;
  dqs: number;
  status: DecisionWorkflowState;
  synthesis: ChairpersonSynthesis | null;
  prd: PRDOutput | null;
  missing_sections: string[];
  decision_name: string;
  interaction_rounds: AgentInteractionRound[];
  decision_ancestry?: DecisionAncestryMatch[];
  decision_ancestry_retrieval_method?: "vector-db" | "lexical-fallback";
  hygiene_score?: number;
  substance_score?: number;
  confidence_score?: number;
  dissent_penalty?: number;
  confidence_penalty?: number;
  hygiene_findings?: HygieneFinding[];
  artifact_assistant_questions?: string[];
  chairperson_evidence_citations?: string[];
  market_intelligence?: WorkflowMarketIntelligence | null;
  evidence_verification?: WorkflowEvidenceVerification | null;
}

export interface RunWorkflowOptions {
  decisionId: string;
  userContext?: Record<string, unknown>;
  businessConstraints?: Record<string, unknown>;
  strategicGoals?: string[];
  modelName?: string;
  temperature?: number;
  maxTokens?: number;
  agentConfigs?: AgentConfig[];
  includeExternalResearch?: boolean;
  interactionRounds?: number;
  includeRedTeamPersonas?: boolean;
}
