import type { DecisionSnapshot } from "../schemas/decision_snapshot";

export type HygieneFindingStatus = "pass" | "warning" | "fail";

export interface HygieneFinding {
  check: string;
  status: HygieneFindingStatus;
  detail: string;
  score_impact: number;
}

export interface HygieneEvaluation {
  score: number;
  findings: HygieneFinding[];
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

function cleanText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
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
    return value > 1 && value <= 100 ? value : value * 100;
  }

  if (typeof value === "string") {
    const match = value.match(/-?\d+(\.\d+)?/);
    if (!match) {
      return null;
    }

    const parsed = Number(match[0]);
    if (!Number.isFinite(parsed)) {
      return null;
    }

    return parsed > 1 && parsed <= 100 ? parsed : parsed * 100;
  }

  const record = asRecord(value);
  if (!record) {
    return null;
  }

  return parsePercent(record.select ?? record.name ?? record.value ?? null);
}

function getSnapshotBodyText(snapshot: DecisionSnapshot | null): string {
  if (!snapshot || !Array.isArray(snapshot.section_excerpt)) {
    return "";
  }

  return snapshot.section_excerpt
    .map((item) => {
      const itemRecord = asRecord(item);
      const textRecord = asRecord(itemRecord?.text);
      return cleanText(textRecord?.content);
    })
    .join("\n")
    .trim();
}

interface MoneyMatch {
  value: number;
  label: string;
}

interface TabularMoneyObservation {
  key: string;
  value: number;
  label: string;
}

function parseScaledNumber(raw: string, scaleHint: string | undefined): number | null {
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

function extractLabeledMoney(text: string, labels: string[]): MoneyMatch | null {
  if (text.trim().length === 0) {
    return null;
  }

  const pattern = labels.map((label) => label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
  const regex = new RegExp(`(?:${pattern})[^\\n\\r\\d$]{0,40}\\$?([0-9][0-9,]*(?:\\.[0-9]+)?)\\s*(billion|million|thousand|b|m|k)?`, "i");
  const match = text.match(regex);
  if (!match) {
    return null;
  }

  const parsed = parseScaledNumber(match[1] ?? "", match[2]);
  if (parsed === null) {
    return null;
  }

  return {
    value: parsed,
    label: match[0],
  };
}

function normalizeMetricLabel(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function parseMoneyFromCell(raw: string): number | null {
  const cleaned = raw
    .replace(/\$/g, "")
    .replace(/usd/gi, "")
    .replace(/[()]/g, "")
    .trim();
  const scaledMatch = cleaned.match(/([0-9][0-9,]*(?:\.[0-9]+)?)\s*(billion|million|thousand|b|m|k)\b/i);
  if (scaledMatch) {
    return parseScaledNumber(scaledMatch[1], scaledMatch[2]);
  }
  return parseNumber(cleaned);
}

function normalizeTableKey(label: string): string | null {
  const normalized = normalizeMetricLabel(label);
  if (normalized.length === 0) {
    return null;
  }

  if (
    normalized.includes("projected revenue") ||
    normalized.includes("revenue impact") ||
    normalized.includes("annual revenue") ||
    normalized.includes("gross benefit")
  ) {
    return "projected_revenue";
  }

  if (
    normalized.includes("market size") ||
    normalized.includes("tam") ||
    normalized.includes("sam") ||
    normalized.includes("som")
  ) {
    return "market_size";
  }

  if (normalized.includes("investment required") || normalized.includes("investment")) {
    return "investment";
  }

  return null;
}

function extractTabularMoneyObservations(text: string): TabularMoneyObservation[] {
  const observations: TabularMoneyObservation[] = [];
  const lines = text.split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.length === 0) {
      continue;
    }

    if (trimmed.includes("|")) {
      const cells = trimmed
        .split("|")
        .map((cell) => cell.trim())
        .filter((cell) => cell.length > 0);
      if (cells.length < 2 || cells.every((cell) => /^-+$/.test(cell))) {
        continue;
      }

      const label = cells[0];
      const key = normalizeTableKey(label);
      if (!key) {
        continue;
      }

      for (let index = 1; index < cells.length; index += 1) {
        const value = parseMoneyFromCell(cells[index]);
        if (value !== null && value > 0) {
          observations.push({ key, value, label: `${label}: ${cells[index]}` });
          break;
        }
      }
      continue;
    }

    if (trimmed.includes(",")) {
      if (!/^[a-zA-Z][a-zA-Z0-9 _-]{1,80},\s*[$(]?[0-9]/.test(trimmed)) {
        continue;
      }

      const cells = trimmed.split(",").map((cell) => cell.trim());
      if (cells.length < 2) {
        continue;
      }

      const label = cells[0];
      const key = normalizeTableKey(label);
      if (!key) {
        continue;
      }

      for (let index = 1; index < cells.length; index += 1) {
        const value = parseMoneyFromCell(cells[index]);
        if (value !== null && value > 0) {
          observations.push({ key, value, label: `${label}: ${cells[index]}` });
          break;
        }
      }
    }
  }

  return observations;
}

function selectFirstObservation(
  observations: TabularMoneyObservation[],
  key: string,
): MoneyMatch | null {
  const candidate = observations.find((entry) => entry.key === key);
  if (!candidate) {
    return null;
  }

  return {
    value: candidate.value,
    label: candidate.label,
  };
}

function extractDocumentProbability(text: string): number | null {
  if (text.trim().length === 0) {
    return null;
  }

  const match = text.match(/(?:probability of success|success probability|chance of success)[^\n\r\d]{0,30}(\d{1,3}(?:\.\d+)?)\s*%/i);
  if (!match) {
    return null;
  }

  const parsed = Number(match[1]);
  return Number.isFinite(parsed) ? parsed : null;
}

function includesAny(haystack: string, needle: string): boolean {
  const normalizedNeedle = needle.toLowerCase().trim();
  if (normalizedNeedle.length === 0) {
    return true;
  }

  const tokens = normalizedNeedle.split(/\s+/).filter((token) => token.length >= 3);
  if (tokens.length === 0) {
    return haystack.includes(normalizedNeedle);
  }

  return tokens.some((token) => haystack.includes(token));
}

function buildFinding(
  check: string,
  status: HygieneFindingStatus,
  detail: string,
  scoreImpact: number,
): HygieneFinding {
  return {
    check,
    status,
    detail,
    score_impact: Number(scoreImpact.toFixed(2)),
  };
}

export function evaluateHygiene(snapshot: DecisionSnapshot | null, missingSections: string[]): HygieneEvaluation {
  const findings: HygieneFinding[] = [];
  let score = 10;
  const properties = snapshot?.properties ?? {};
  const bodyText = getSnapshotBodyText(snapshot);
  const bodyTextLower = bodyText.toLowerCase();

  if (missingSections.length > 0) {
    const impact = Math.min(4, missingSections.length * 0.5);
    score -= impact;
    findings.push(
      buildFinding(
        "required_artifacts",
        "fail",
        `Missing required sections: ${missingSections.join(", ")}.`,
        impact,
      ),
    );
  } else {
    findings.push(buildFinding("required_artifacts", "pass", "All required baseline governance sections are present.", 0));
  }

  const investment = parseNumber(properties["Investment Required"]);
  const benefit12m = parseNumber(properties["12-Month Gross Benefit"]);
  const declaredRoi = parseNumber(properties["Risk-Adjusted ROI"]);

  if (investment !== null && investment > 0 && benefit12m !== null) {
    const impliedRoi = benefit12m / investment;
    const diff = declaredRoi !== null ? Math.abs(impliedRoi - declaredRoi) : 0;

    if (declaredRoi !== null && diff > Math.max(0.35, Math.abs(declaredRoi) * 0.35)) {
      score -= 1.2;
      findings.push(
        buildFinding(
          "financial_sanity",
          "warning",
          `Implied ROI (${impliedRoi.toFixed(2)}) diverges from stated Risk-Adjusted ROI (${declaredRoi.toFixed(2)}).`,
          1.2,
        ),
      );
    } else {
      findings.push(
        buildFinding(
          "financial_sanity",
          "pass",
          `Investment and benefit imply ROI ${impliedRoi.toFixed(2)} and remain internally consistent.`,
          0,
        ),
      );
    }
  } else {
    score -= 0.8;
    findings.push(
      buildFinding(
        "financial_sanity",
        "warning",
        "Could not verify financial coherence because investment or projected benefit is missing.",
        0.8,
      ),
    );
  }

  const tableMoneyObservations = extractTabularMoneyObservations(bodyText);
  const tableMarketSize = selectFirstObservation(tableMoneyObservations, "market_size");
  const tableProjectedRevenue = selectFirstObservation(tableMoneyObservations, "projected_revenue");

  if (tableMarketSize && tableProjectedRevenue) {
    if (tableProjectedRevenue.value > tableMarketSize.value * 1.05) {
      score -= 2.4;
      findings.push(
        buildFinding(
          "financial_table_sanity",
          "fail",
          `Parsed table values are inconsistent: projected revenue (${tableProjectedRevenue.label}) is above market size (${tableMarketSize.label}).`,
          2.4,
        ),
      );
    } else {
      findings.push(
        buildFinding(
          "financial_table_sanity",
          "pass",
          "Parsed financial table values are internally consistent (projected revenue <= market size).",
          0,
        ),
      );
    }
  } else if (tableMoneyObservations.length > 0) {
    score -= 0.6;
    findings.push(
      buildFinding(
        "financial_table_sanity",
        "warning",
        "Detected a structured table/csv block but could not extract both market-size and projected-revenue values.",
        0.6,
      ),
    );
  }

  const marketSize = tableMarketSize ?? extractLabeledMoney(bodyText, ["market size", "tam", "sam", "som"]);
  const projectedRevenue =
    tableProjectedRevenue ??
    extractLabeledMoney(bodyText, ["projected revenue", "revenue impact", "annual revenue", "12-month gross benefit"]) ??
    (benefit12m !== null ? { value: benefit12m, label: "12-Month Gross Benefit property" } : null);

  if (marketSize && projectedRevenue && projectedRevenue.value > marketSize.value * 1.05) {
    score -= 2;
    findings.push(
      buildFinding(
        "market_size_vs_revenue",
        "fail",
        `Projected revenue appears above market size (${projectedRevenue.label} > ${marketSize.label}).`,
        2,
      ),
    );
  } else if (marketSize && projectedRevenue) {
    findings.push(
      buildFinding(
        "market_size_vs_revenue",
        "pass",
        "Projected revenue remains within stated market-size bounds.",
        0,
      ),
    );
  } else {
    findings.push(
      buildFinding(
        "market_size_vs_revenue",
        "warning",
        "Market-size and projected-revenue values were not both detectable for automated comparison.",
        0.6,
      ),
    );
    score -= 0.6;
  }

  const primaryKpi = cleanText(properties["Primary KPI"]);
  if (primaryKpi.length > 0 && !includesAny(bodyTextLower, primaryKpi)) {
    score -= 0.8;
    findings.push(
      buildFinding(
        "metadata_consistency",
        "warning",
        `Primary KPI "${primaryKpi}" is not clearly reflected in the decision document text.`,
        0.8,
      ),
    );
  } else {
    findings.push(
      buildFinding(
        "metadata_consistency",
        "pass",
        primaryKpi.length > 0
          ? `Primary KPI "${primaryKpi}" is represented in the decision narrative.`
          : "No explicit primary KPI set in metadata to cross-check.",
        primaryKpi.length > 0 ? 0 : 0.4,
      ),
    );

    if (primaryKpi.length === 0) {
      score -= 0.4;
    }
  }

  const strategicObjective = cleanText(properties["Strategic Objective"]);
  if (strategicObjective.length > 0 && !includesAny(bodyTextLower, strategicObjective)) {
    score -= 0.7;
    findings.push(
      buildFinding(
        "metadata_consistency_strategic_objective",
        "warning",
        `Strategic objective "${strategicObjective}" is not traceable in the decision document.`,
        0.7,
      ),
    );
  } else if (strategicObjective.length > 0) {
    findings.push(
      buildFinding(
        "metadata_consistency_strategic_objective",
        "pass",
        `Strategic objective "${strategicObjective}" is represented in the document narrative.`,
        0,
      ),
    );
  }

  const decisionType = cleanText(properties["Decision Type"]);
  if (decisionType.length > 0) {
    const decisionTypeLower = decisionType.toLowerCase();
    const saysReversible = decisionTypeLower.includes("reversible");
    const saysIrreversible = decisionTypeLower.includes("irreversible");
    const textMentionsReversible = /\breversible\b|\btwo-way door\b/i.test(bodyText);
    const textMentionsIrreversible = /\birreversible\b|\bone-way door\b/i.test(bodyText);

    if ((saysReversible && textMentionsIrreversible) || (saysIrreversible && textMentionsReversible)) {
      score -= 1;
      findings.push(
        buildFinding(
          "metadata_consistency_decision_type",
          "fail",
          `Decision type metadata "${decisionType}" conflicts with wording in the decision document.`,
          1,
        ),
      );
    } else if (!textMentionsReversible && !textMentionsIrreversible) {
      score -= 0.4;
      findings.push(
        buildFinding(
          "metadata_consistency_decision_type",
          "warning",
          "Decision type is set in metadata but not explicitly stated in the decision document.",
          0.4,
        ),
      );
    } else {
      findings.push(
        buildFinding(
          "metadata_consistency_decision_type",
          "pass",
          `Decision type "${decisionType}" aligns with the narrative framing.`,
          0,
        ),
      );
    }
  }

  const timeHorizon = cleanText(properties["Time Horizon"]);
  if (timeHorizon.length > 0 && !includesAny(bodyTextLower, timeHorizon)) {
    score -= 0.5;
    findings.push(
      buildFinding(
        "metadata_consistency_time_horizon",
        "warning",
        `Time horizon "${timeHorizon}" is in metadata but not clearly stated in the decision document.`,
        0.5,
      ),
    );
  } else if (timeHorizon.length > 0) {
    findings.push(
      buildFinding(
        "metadata_consistency_time_horizon",
        "pass",
        `Time horizon "${timeHorizon}" is represented in the decision narrative.`,
        0,
      ),
    );
  }

  const baseline = parseNumber(properties.Baseline);
  const target = parseNumber(properties.Target);
  if (baseline !== null && target !== null && target <= baseline) {
    score -= 1.2;
    findings.push(
      buildFinding(
        "metric_directionality",
        "fail",
        `Target (${target}) is not above baseline (${baseline}), making success criteria ambiguous.`,
        1.2,
      ),
    );
  } else {
    findings.push(buildFinding("metric_directionality", "pass", "Baseline and target progression is directionally coherent.", 0));
  }

  const probability = parsePercent(properties["Probability of Success"]);
  if (probability !== null && (probability < 0 || probability > 100)) {
    score -= 0.8;
    findings.push(
      buildFinding(
        "probability_range",
        "warning",
        `Probability of success (${probability.toFixed(1)}%) falls outside 0-100%.`,
        0.8,
      ),
    );
  } else if (probability !== null) {
    findings.push(buildFinding("probability_range", "pass", `Probability of success is ${probability.toFixed(1)}%.`, 0));
  }

  const docProbability = extractDocumentProbability(bodyText);
  if (probability !== null && docProbability !== null) {
    const diff = Math.abs(probability - docProbability);
    if (diff > 20) {
      score -= 1;
      findings.push(
        buildFinding(
          "metadata_consistency_probability",
          "warning",
          `Probability of success differs between metadata (${probability.toFixed(1)}%) and document (${docProbability.toFixed(1)}%).`,
          1,
        ),
      );
    } else {
      findings.push(
        buildFinding(
          "metadata_consistency_probability",
          "pass",
          "Probability of success is consistent between metadata and document language.",
          0,
        ),
      );
    }
  }

  const boundedScore = Math.max(0, Math.min(10, Number(score.toFixed(2))));
  return {
    score: boundedScore,
    findings,
  };
}
