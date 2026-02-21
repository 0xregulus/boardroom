import type { DecisionSnapshot } from "../../schemas/decision_snapshot";
import { cleanText, getSnapshotBodyText, includesAny, parseNumber, parsePercent } from "./coercion";
import { extractDocumentProbability, extractLabeledMoney, extractTableMoneyPair } from "./financial";
import type { HygieneEvaluation, HygieneFinding, HygieneFindingStatus } from "./types";

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

  const tableMoney = extractTableMoneyPair(bodyText);
  const tableMarketSize = tableMoney.marketSize;
  const tableProjectedRevenue = tableMoney.projectedRevenue;

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
  } else if (tableMoney.observations > 0) {
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
