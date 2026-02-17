import { AgentConfig } from "../config/agent_config";
import { DecisionSnapshot, PRDOutput, ReviewOutput } from "../schemas";

export type DecisionWorkflowState = "PROPOSED" | "REVIEWING" | "SYNTHESIZED" | "DECIDED" | "PERSISTED";

export interface ChairpersonSynthesis {
  executive_summary: string;
  final_recommendation: "Approved" | "Challenged" | "Blocked";
  conflicts: string[];
  blockers: string[];
  required_revisions: string[];
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
}
