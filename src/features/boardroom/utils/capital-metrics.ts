import type { CreateStrategyDraft } from "../types";

function parsePercentValue(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return null;
  }
  const numeric = Number(trimmed.replace("%", ""));
  if (!Number.isFinite(numeric)) {
    return null;
  }
  return numeric / 100;
}

function strategicLeverageNumericValue(value: string): number | null {
  const match = value.trim().match(/^([1-5])/);
  if (!match) {
    return null;
  }
  return Number(match[1]);
}

function reversibilityWeight(value: string): number | null {
  if (value === "Fully Reversible") {
    return 1;
  }
  if (value === "Partially Reversible") {
    return 0.75;
  }
  if (value === "Hard to Reverse") {
    return 0.5;
  }
  if (value === "Irreversible") {
    return 0.25;
  }
  return null;
}

export function deriveRiskAdjustedValue(draft: CreateStrategyDraft): number {
  const probability = parsePercentValue(draft.capitalAllocation.probabilityOfSuccess);
  if (probability === null) {
    return 0;
  }
  return Math.round(draft.capitalAllocation.grossBenefit12m * probability);
}

export function deriveRiskAdjustedRoi(draft: CreateStrategyDraft, riskAdjustedValue: number): number | null {
  if (draft.capitalAllocation.investmentRequired <= 0) {
    return null;
  }
  return (riskAdjustedValue - draft.capitalAllocation.investmentRequired) / draft.capitalAllocation.investmentRequired;
}

export function deriveWeightedCapitalScore(draft: CreateStrategyDraft, riskAdjustedRoi: number | null): number | null {
  const leverage = strategicLeverageNumericValue(draft.capitalAllocation.strategicLeverageScore);
  const reversibility = reversibilityWeight(draft.capitalAllocation.reversibilityFactor);
  if (leverage === null || reversibility === null || riskAdjustedRoi === null) {
    return null;
  }
  const normalizedRoi = Math.max(0, riskAdjustedRoi + 1);
  return Number((leverage * normalizedRoi * reversibility).toFixed(2));
}

export function deriveRiskScore(draft: CreateStrategyDraft): string {
  const ranking: Record<string, number> = {
    None: 0,
    Low: 1,
    Medium: 2,
    High: 3,
    Critical: 4,
  };

  const levels = [
    draft.riskProperties.regulatoryRisk,
    draft.riskProperties.technicalRisk,
    draft.riskProperties.operationalRisk,
    draft.riskProperties.reputationalRisk,
  ];
  let topLevel = "";
  let topValue = -1;
  for (const level of levels) {
    const value = ranking[level] ?? -1;
    if (value > topValue) {
      topValue = value;
      topLevel = level;
    }
  }
  return topLevel;
}

export function clampTokenInput(value: number): number {
  if (!Number.isFinite(value)) {
    return 1200;
  }
  return Math.max(256, Math.min(8000, Math.round(value)));
}
