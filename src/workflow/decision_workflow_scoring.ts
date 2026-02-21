import type { ReviewOutput } from "../schemas/review_output";
import {
  CONFIDENCE_THRESHOLD,
  CORE_DQS_WEIGHTS,
  DQS_THRESHOLD,
  EXTRA_AGENT_WEIGHT,
  HYGIENE_WEIGHT,
  SUBSTANCE_WEIGHT,
} from "./constants";
import type { WorkflowState } from "./states";

export function clampScore(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.min(10, Number(value.toFixed(2))));
}

export function average(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }

  const total = values.reduce((sum, value) => sum + value, 0);
  return total / values.length;
}

export function isRiskWeightedAgent(agentId: string): boolean {
  const lowered = agentId.toLowerCase();
  return (
    lowered === "compliance" ||
    lowered === "cfo" ||
    lowered === "pre-mortem" ||
    lowered === "resource-competitor" ||
    lowered === "risk-simulation" ||
    lowered === "devils-advocate"
  );
}

function isGrowthWeightedAgent(agentId: string): boolean {
  const lowered = agentId.toLowerCase();
  return lowered === "ceo" || lowered === "cto";
}

function reviewDisposition(review: ReviewOutput): "blocked" | "challenged" | "approved" {
  if (review.blocked) {
    return "blocked";
  }
  if (review.score < DQS_THRESHOLD || review.confidence < CONFIDENCE_THRESHOLD) {
    return "challenged";
  }
  return "approved";
}

function conflictAdjustedWeight(agentId: string, review: ReviewOutput): number {
  const baseWeight = CORE_DQS_WEIGHTS[agentId] ?? EXTRA_AGENT_WEIGHT;
  const disposition = reviewDisposition(review);

  if (isRiskWeightedAgent(agentId) && disposition !== "approved") {
    return baseWeight * 1.35;
  }

  if (isGrowthWeightedAgent(agentId) && disposition === "approved") {
    return baseWeight * 0.85;
  }

  return baseWeight;
}

function dissentPenaltyByAgent(agentId: string, score: number, blocked: boolean): number {
  const lowered = agentId.toLowerCase();
  const blockPenalty =
    lowered === "compliance" || lowered === "cfo"
      ? 2
      : lowered === "cto"
        ? 1.4
        : 1;

  if (blocked) {
    return blockPenalty;
  }

  const deficit = Math.max(0, 7 - score);
  if (deficit <= 0) {
    return 0;
  }

  if (lowered === "compliance" || lowered === "cfo") {
    return deficit * 0.35;
  }
  if (lowered === "cto") {
    return deficit * 0.25;
  }
  return deficit * 0.12;
}

export function specializedConfidenceValues(reviews: Record<string, ReviewOutput>): number[] {
  return ["cfo", "cto", "compliance", "pre-mortem", "resource-competitor", "risk-simulation", "devils-advocate"]
    .map((agentId) => reviews[agentId]?.confidence)
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
}

export function hasLowSpecializedConfidence(reviews: Record<string, ReviewOutput>): boolean {
  const values = specializedConfidenceValues(reviews);
  if (values.length === 0) {
    return false;
  }
  return values.some((value) => value < CONFIDENCE_THRESHOLD);
}

export function calculateDqs(state: WorkflowState): WorkflowState {
  const reviewEntries = Object.entries(state.reviews);
  if (reviewEntries.length === 0) {
    return {
      ...state,
      dqs: 0,
      substance_score: 0,
      confidence_score: 0,
      dissent_penalty: 0,
      confidence_penalty: 0,
    };
  }

  let weightedScore = 0;
  let totalWeight = 0;
  let dissentPenalty = 0;

  for (const [agentId, review] of reviewEntries) {
    const weight = conflictAdjustedWeight(agentId, review);
    weightedScore += review.score * weight;
    totalWeight += weight;
    dissentPenalty += dissentPenaltyByAgent(agentId, review.score, review.blocked) * Math.max(0.8, weight);
  }

  const substanceScore = totalWeight > 0 ? weightedScore / totalWeight : 0;
  const confidenceScore = average(specializedConfidenceValues(state.reviews));
  const confidencePenalty = Math.max(0, CONFIDENCE_THRESHOLD - confidenceScore) * 2.5;
  const hygieneScore = clampScore(state.hygiene_score ?? 0);
  const adjustedSubstance = clampScore(substanceScore - dissentPenalty - confidencePenalty);
  const dqs = clampScore(adjustedSubstance * SUBSTANCE_WEIGHT + hygieneScore * HYGIENE_WEIGHT);

  return {
    ...state,
    dqs,
    substance_score: clampScore(substanceScore),
    confidence_score: Number(confidenceScore.toFixed(4)),
    dissent_penalty: Number(dissentPenalty.toFixed(4)),
    confidence_penalty: Number(confidencePenalty.toFixed(4)),
  };
}
