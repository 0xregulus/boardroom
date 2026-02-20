import type { DecisionSnapshot } from "../schemas/decision_snapshot";

export interface WorkflowRiskSimulationInputs {
  investment_required: number | null;
  projected_benefit_12m: number | null;
  probability_of_success: number | null;
  market_size: number | null;
}

export interface WorkflowRiskSimulationBand {
  net_value: number;
  roi: number;
}

export interface WorkflowRiskSimulationOutcomes {
  base_case: WorkflowRiskSimulationBand;
  expected_case: WorkflowRiskSimulationBand;
  worst_case: WorkflowRiskSimulationBand;
  best_case: WorkflowRiskSimulationBand;
  probability_of_loss: number;
  probability_of_outperforming_base_case: number;
}

export interface WorkflowRiskSimulation {
  generated_at: string;
  mode: "estimated" | "insufficient";
  sample_size: number;
  inputs: WorkflowRiskSimulationInputs;
  assumptions: string[];
  summary: string;
  outcomes: WorkflowRiskSimulationOutcomes | null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function parseNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const cleaned = value.replace(/[,$]/g, "").trim();
    if (cleaned.length === 0) {
      return null;
    }
    const parsed = Number(cleaned);
    return Number.isFinite(parsed) ? parsed : null;
  }

  const record = asRecord(value);
  if (!record) {
    return null;
  }
  return parseNumber(record.number ?? record.value ?? record.amount ?? null);
}

function parsePercent(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    if (value < 0) {
      return null;
    }
    if (value > 1 && value <= 100) {
      return value / 100;
    }
    return value <= 1 ? value : null;
  }

  if (typeof value === "string") {
    const match = value.match(/-?\d+(\.\d+)?/);
    if (!match) {
      return null;
    }
    const parsed = Number(match[0]);
    if (!Number.isFinite(parsed) || parsed < 0) {
      return null;
    }
    if (parsed > 1 && parsed <= 100) {
      return parsed / 100;
    }
    return parsed <= 1 ? parsed : null;
  }

  const record = asRecord(value);
  if (!record) {
    return null;
  }
  return parsePercent(record.select ?? record.value ?? record.name ?? null);
}

function bodyText(snapshot: DecisionSnapshot | null): string {
  if (!snapshot || !Array.isArray(snapshot.section_excerpt)) {
    return "";
  }

  return snapshot.section_excerpt
    .map((entry) => {
      const item = asRecord(entry);
      const text = asRecord(item?.text);
      return typeof text?.content === "string" ? text.content : "";
    })
    .join("\n")
    .trim();
}

function parseScaled(raw: string, scaleHint?: string): number | null {
  const numeric = Number(raw.replace(/,/g, ""));
  if (!Number.isFinite(numeric)) {
    return null;
  }

  const unit = (scaleHint ?? "").toLowerCase();
  if (unit.startsWith("b")) {
    return numeric * 1_000_000_000;
  }
  if (unit.startsWith("m")) {
    return numeric * 1_000_000;
  }
  if (unit.startsWith("k")) {
    return numeric * 1_000;
  }
  return numeric;
}

function extractLabeledMoney(text: string, labels: string[]): number | null {
  if (!text) {
    return null;
  }

  const escaped = labels.map((label) => label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
  const regex = new RegExp(`(?:${escaped})[^\\n\\r\\d$]{0,40}\\$?([0-9][0-9,]*(?:\\.[0-9]+)?)\\s*(billion|million|thousand|b|m|k)?`, "i");
  const match = text.match(regex);
  if (!match) {
    return null;
  }

  return parseScaled(match[1] ?? "", match[2]);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function normalizeMoney(value: number): number {
  return Number(value.toFixed(2));
}

function normalizeRate(value: number): number {
  return Number(value.toFixed(4));
}

function hashSeed(input: string): number {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

class SeededRng {
  constructor(private state: number) {}

  next(): number {
    this.state = (Math.imul(1664525, this.state) + 1013904223) >>> 0;
    return this.state / 4294967296;
  }
}

function triangular(rng: SeededRng, min: number, mode: number, max: number): number {
  const span = max - min;
  if (span <= 0) {
    return min;
  }

  const c = (mode - min) / span;
  const u = rng.next();
  if (u <= c) {
    return min + Math.sqrt(u * span * (mode - min));
  }
  return max - Math.sqrt((1 - u) * span * (max - mode));
}

function percentile(values: number[], p: number): number {
  if (values.length === 0) {
    return 0;
  }

  const index = (values.length - 1) * clamp(p, 0, 1);
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) {
    return values[lower];
  }
  const weight = index - lower;
  return values[lower] * (1 - weight) + values[upper] * weight;
}

function average(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }
  return values.reduce((total, value) => total + value, 0) / values.length;
}

export function runRiskSimulation(
  snapshot: DecisionSnapshot | null,
  decisionId: string,
  sampleSize = 1200,
): WorkflowRiskSimulation | null {
  if (!snapshot) {
    return null;
  }

  const properties = snapshot.properties ?? {};
  const text = bodyText(snapshot);

  const investment = parseNumber(properties["Investment Required"]);
  const projectedBenefit =
    parseNumber(properties["12-Month Gross Benefit"]) ??
    parseNumber(properties["Projected Revenue"]) ??
    parseNumber(properties["Revenue Impact"]);
  const probability = parsePercent(properties["Probability of Success"]);
  const marketSize = extractLabeledMoney(text, ["market size", "tam", "sam", "som"]);

  const inputs: WorkflowRiskSimulationInputs = {
    investment_required: investment,
    projected_benefit_12m: projectedBenefit,
    probability_of_success: probability,
    market_size: marketSize,
  };

  if (investment === null || projectedBenefit === null || investment <= 0 || projectedBenefit <= 0) {
    return {
      generated_at: new Date().toISOString(),
      mode: "insufficient",
      sample_size: Math.max(100, Math.round(sampleSize)),
      inputs,
      assumptions: [
        "Monte Carlo simulation requires both Investment Required and Projected Benefit inputs.",
      ],
      summary:
        "Risk simulation unavailable due to missing baseline financial inputs (investment and/or projected benefit).",
      outcomes: null,
    };
  }

  const effectiveProbability = clamp(probability ?? 0.6, 0.05, 0.95);
  const trials = Math.max(250, Math.min(10000, Math.round(sampleSize)));
  const rng = new SeededRng(hashSeed(`${decisionId}:${snapshot.captured_at}:${investment}:${projectedBenefit}`));

  const nets: number[] = [];
  const rois: number[] = [];
  let lossCount = 0;
  let outperformBaseCount = 0;
  const baseCaseNet = projectedBenefit - investment;
  const boundedBenefit =
    marketSize !== null ? Math.min(projectedBenefit, marketSize * 1.02) : projectedBenefit;

  for (let i = 0; i < trials; i += 1) {
    const success = rng.next() < effectiveProbability;
    const demandFactor = triangular(rng, 0.55, 1, 1.35);
    const executionFactor = triangular(rng, 0.6, 1, 1.25);
    const externalShock = rng.next() < 0.2 ? triangular(rng, 0.35, 0.6, 0.9) : 1;

    let realizedBenefit = boundedBenefit * demandFactor * executionFactor * externalShock;
    if (marketSize !== null && realizedBenefit > marketSize * 1.02) {
      realizedBenefit = marketSize * triangular(rng, 0.92, 0.98, 1.02);
    }

    const costMultiplier = success
      ? triangular(rng, 0.9, 1.05, 1.35)
      : triangular(rng, 1.0, 1.28, 1.9);
    const recoveredBenefitMultiplier = success ? triangular(rng, 0.9, 1.08, 1.45) : triangular(rng, 0.02, 0.12, 0.35);

    const adjustedInvestment = investment * costMultiplier;
    const adjustedBenefit = realizedBenefit * recoveredBenefitMultiplier;
    const net = adjustedBenefit - adjustedInvestment;
    const roi = adjustedInvestment > 0 ? adjustedBenefit / adjustedInvestment : 0;

    nets.push(net);
    rois.push(roi);
    if (net < 0) {
      lossCount += 1;
    }
    if (net >= baseCaseNet) {
      outperformBaseCount += 1;
    }
  }

  nets.sort((a, b) => a - b);
  rois.sort((a, b) => a - b);

  const expectedNet = average(nets);
  const expectedRoi = average(rois);
  const bestNet = percentile(nets, 0.9);
  const worstNet = percentile(nets, 0.1);
  const bestRoi = percentile(rois, 0.9);
  const worstRoi = percentile(rois, 0.1);
  const probabilityOfLoss = lossCount / trials;
  const probabilityOutperformBase = outperformBaseCount / trials;

  const summary =
    probabilityOfLoss >= 0.5
      ? "Downside-heavy distribution: loss probability is above 50%; proceed only with explicit mitigations."
      : probabilityOfLoss >= 0.35
        ? "Material downside tail risk detected; require stronger controls and staged capital deployment."
        : "Risk distribution is comparatively controlled, but downside tails remain non-trivial.";

  const assumptions = [
    "Triangular distributions are used for demand, execution, and cost-overrun uncertainty.",
    `Probability of success baseline = ${(effectiveProbability * 100).toFixed(1)}%.`,
    marketSize !== null
      ? "Simulated benefit is capped near the detected market-size bound."
      : "No explicit market-size cap detected; benefit tails are unconstrained by TAM/SAM/SOM.",
  ];

  return {
    generated_at: new Date().toISOString(),
    mode: "estimated",
    sample_size: trials,
    inputs,
    assumptions,
    summary,
    outcomes: {
      base_case: {
        net_value: normalizeMoney(baseCaseNet),
        roi: normalizeRate(projectedBenefit / investment),
      },
      expected_case: {
        net_value: normalizeMoney(expectedNet),
        roi: normalizeRate(expectedRoi),
      },
      worst_case: {
        net_value: normalizeMoney(worstNet),
        roi: normalizeRate(worstRoi),
      },
      best_case: {
        net_value: normalizeMoney(bestNet),
        roi: normalizeRate(bestRoi),
      },
      probability_of_loss: normalizeRate(probabilityOfLoss),
      probability_of_outperforming_base_case: normalizeRate(probabilityOutperformBase),
    },
  };
}
