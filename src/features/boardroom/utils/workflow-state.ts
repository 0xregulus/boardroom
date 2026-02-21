import { REVIEW_ORDER } from "../constants";
import type { ReportReview, ReportWorkflowState, SnapshotMetrics } from "../types";
import {
  normalizeWorkflowStates,
  parseSnapshotNumberProperty,
  parseSnapshotSelectName,
  parseSnapshotTextProperty,
} from "./workflow-state-parsers";

export { normalizeWorkflowStates };

export function recommendationForState(state: ReportWorkflowState): "Approved" | "Challenged" | "Blocked" {
  if (state.synthesis?.final_recommendation) {
    return state.synthesis.final_recommendation;
  }

  const blocked = Object.values(state.reviews).some((review) => review.blocked);
  if (blocked) {
    return "Blocked";
  }

  if (state.status === "DECIDED" || state.status === "PERSISTED") {
    return "Approved";
  }

  return "Challenged";
}

export function recommendationTone(recommendation: "Approved" | "Challenged" | "Blocked"): "approved" | "challenged" | "blocked" {
  if (recommendation === "Blocked") {
    return "blocked";
  }
  if (recommendation === "Approved") {
    return "approved";
  }
  return "challenged";
}

export function extractSnapshotMetrics(state: ReportWorkflowState): SnapshotMetrics {
  const properties = state.decision_snapshot?.properties ?? {};

  return {
    primaryKpi: parseSnapshotTextProperty(properties["Primary KPI"]) || "Not specified",
    investment: parseSnapshotNumberProperty(properties["Investment Required"]),
    benefit12m: parseSnapshotNumberProperty(properties["12-Month Gross Benefit"]),
    roi: parseSnapshotNumberProperty(properties["Risk-Adjusted ROI"]),
    probability: parseSnapshotSelectName(properties["Probability of Success"]) || "N/A",
    timeHorizon: parseSnapshotSelectName(properties["Time Horizon"]) || "N/A",
    strategicObjective: parseSnapshotSelectName(properties["Strategic Objective"]) || "N/A",
    leverageScore: parseSnapshotSelectName(properties["Strategic Leverage Score"]) || "N/A",
  };
}

export function extractGovernanceRows(state: ReportWorkflowState): Array<{ label: string; met: boolean }> {
  const checks = state.decision_snapshot?.governance_checks ?? {};

  if (Object.keys(checks).length > 0) {
    return Object.entries(checks).map(([label, met]) => ({ label, met }));
  }

  const fallbackReview = Object.values(state.reviews)[0];
  if (!fallbackReview) {
    return [];
  }

  return Object.entries(fallbackReview.governance_checks_met).map(([label, met]) => ({ label, met }));
}

export function sortReviews(state: ReportWorkflowState): ReportReview[] {
  return Object.values(state.reviews).sort((a, b) => {
    const indexA = REVIEW_ORDER.findIndex((name) => name.toLowerCase() === a.agent.toLowerCase());
    const indexB = REVIEW_ORDER.findIndex((name) => name.toLowerCase() === b.agent.toLowerCase());
    const normalizedA = indexA === -1 ? 999 : indexA;
    const normalizedB = indexB === -1 ? 999 : indexB;
    return normalizedA - normalizedB;
  });
}
