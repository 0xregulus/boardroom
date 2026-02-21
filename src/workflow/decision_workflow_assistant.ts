import { CONFIDENCE_THRESHOLD } from "./constants";
import type { WorkflowState } from "./states";

export function deriveArtifactAssistantQuestions(state: WorkflowState): string[] {
  const questions: string[] = [];

  for (const section of state.missing_sections.slice(0, 4)) {
    questions.push(`What concrete evidence will you add to satisfy the missing "${section}" section?`);
  }

  for (const finding of state.hygiene_findings ?? []) {
    if (finding.status === "pass") {
      continue;
    }

    if (finding.check === "financial_sanity") {
      questions.push(
        "How do your investment, projected benefit, and risk-adjusted ROI connect numerically, and what assumptions support them?",
      );
      continue;
    }

    if (finding.check === "market_size_vs_revenue" || finding.check === "financial_table_sanity") {
      questions.push(
        "If the market-size assumptions change by 30%, does projected revenue still hold and what is your blocked threshold?",
      );
      continue;
    }

    if (finding.check.startsWith("metadata_consistency")) {
      questions.push(
        "Where exactly in the decision document do you define the primary KPI mechanism and why it is the right success signal?",
      );
    }
  }

  const riskSimulation = state.risk_simulation;
  if (riskSimulation?.mode === "insufficient") {
    questions.push(
      "Risk simulation is unavailable. What Investment Required, Projected Benefit, and Probability of Success inputs will you add so probabilistic risk can be evaluated?",
    );
  } else if (riskSimulation?.outcomes) {
    if (riskSimulation.outcomes.probability_of_loss >= 0.4) {
      questions.push(
        `Monte Carlo indicates ${Math.round(riskSimulation.outcomes.probability_of_loss * 100)}% probability of loss. What concrete mitigations reduce this below 30%?`,
      );
    }
    if (riskSimulation.outcomes.worst_case.net_value < 0) {
      questions.push(
        "Worst-case scenario remains net negative. What staged rollout guardrails and stop-loss triggers will prevent capital destruction?",
      );
    }
  }

  const lowConfidenceReviews = Object.values(state.reviews)
    .filter((review) => review.confidence < CONFIDENCE_THRESHOLD)
    .slice(0, 2);
  for (const review of lowConfidenceReviews) {
    questions.push(
      `${review.agent} confidence is low (${Math.round(review.confidence * 100)}%). What specific evidence would raise confidence above 70%?`,
    );
  }

  const evidenceGaps = state.evidence_verification?.by_agent
    ?.filter((result) => result.verdict === "insufficient")
    .slice(0, 2);
  for (const result of evidenceGaps ?? []) {
    for (const gap of result.gaps.slice(0, 2)) {
      questions.push(`${result.agent_name} evidence gap: ${gap} What verifiable source will you add to close it?`);
    }
  }

  return [...new Set(questions)].slice(0, 8);
}
