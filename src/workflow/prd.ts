import { PRDOutput } from "../schemas/prd_output";
import { ReviewOutput } from "../schemas/review_output";
import { WorkflowState } from "./states";
import {
  PRD_SECTION_DEFAULTS,
  dedupeKeepOrder,
  dedupeSemantic,
  extractDecisionSection,
  finalDecisionRequirements,
  normalizeSimilarityText,
  propertyValue,
  reviewsRequiredChanges,
  reviewsRiskEvidence,
  sectionLines,
  snapshotBodyText,
} from "./prd_helpers";

export { cleanLine, dedupeKeepOrder, isLabelOnlyLine } from "./prd_helpers";

export function buildPrdOutput(state: WorkflowState): PRDOutput {
  const snapshot = state.decision_snapshot;
  const properties = (snapshot?.properties ?? {}) as Record<string, unknown>;
  const bodyText = snapshotBodyText(state);
  const bodyLower = bodyText.toLowerCase();
  const synthesis = state.synthesis ?? {
    executive_summary: "",
    final_recommendation: "Challenged",
    conflicts: [],
    blockers: [],
    required_revisions: [],
  };
  const reviews = state.reviews;

  const objective = propertyValue(properties, "Strategic Objective");
  const decisionType = propertyValue(properties, "Decision Type");
  const primaryKpi = propertyValue(properties, "Primary KPI");
  const baseline = propertyValue(properties, "Baseline");
  const target = propertyValue(properties, "Target");
  const timeHorizon = propertyValue(properties, "Time Horizon");
  const probabilityOfSuccess = propertyValue(properties, "Probability of Success");
  const owner = propertyValue(properties, "Owner");
  const investmentRequired = propertyValue(properties, "Investment Required");
  const grossBenefit = propertyValue(properties, "12-Month Gross Benefit");
  const riskAdjustedRoi = propertyValue(properties, "Risk-Adjusted ROI");

  const executiveSummary = extractDecisionSection(bodyText, "Executive Summary");
  const strategicContext = extractDecisionSection(bodyText, "1. Strategic Context");
  const problemFraming = extractDecisionSection(bodyText, "2. Problem Framing");
  const optionsEvaluated = extractDecisionSection(bodyText, "3. Options Evaluated");
  const financialModel = extractDecisionSection(bodyText, "4. Financial Model");
  const riskMatrix = extractDecisionSection(bodyText, "5. Risk Matrix");
  const finalDecision = extractDecisionSection(bodyText, "6. Final Decision");
  const killCriteria = extractDecisionSection(bodyText, "7. Kill Criteria");
  const monitoringPlan = extractDecisionSection(bodyText, "8. Monitoring Plan");

  const goals: string[] = [];
  if (objective) {
    goals.push(`Strategic objective: ${objective}.`);
  }
  if (primaryKpi) {
    let metricLine = `North-star KPI: ${primaryKpi}.`;
    if (baseline && target) {
      metricLine += ` Baseline ${baseline} -> Target ${target}.`;
    }
    goals.push(metricLine);
  }
  if (timeHorizon) {
    goals.push(`Planning horizon: ${timeHorizon}.`);
  }
  goals.push(...sectionLines(strategicContext, 4));

  const background: string[] = [];
  background.push(...sectionLines(executiveSummary, 4));
  if (decisionType) {
    background.push(`Decision type: ${decisionType}.`);
  }
  if (owner) {
    background.push(`Decision owner: ${owner}.`);
  }

  const research: string[] = [];
  research.push(...sectionLines(problemFraming, 5));
  research.push(...sectionLines(optionsEvaluated, 5));
  research.push(...sectionLines(financialModel, 4));
  research.push(...sectionLines(riskMatrix, 4));

  const userStories: string[] = [];
  if (bodyLower.includes("mobile")) {
    userStories.push(
      "As a mobile buyer, I want a fast and predictable checkout so I can complete purchases with low friction.",
    );
  }
  if (bodyLower.includes("bundle") || bodyLower.includes("recommendation")) {
    userStories.push(
      "As a returning buyer, I want relevant bundles and recommendations so I can discover complementary products quickly.",
    );
  }
  if (bodyLower.includes("international")) {
    userStories.push(
      "As an international buyer, I want transparent fulfillment and delivery options so I can purchase with confidence.",
    );
  }
  if (userStories.length === 0) {
    userStories.push("As a buyer, I want a frictionless purchase flow so I can complete orders quickly and confidently.");
  }

  const requirements: string[] = [];
  requirements.push(...finalDecisionRequirements(finalDecision));
  requirements.push(...reviewsRequiredChanges(reviews, 5));

  const telemetry: string[] = [];
  if (primaryKpi) {
    telemetry.push(`Primary metric: ${primaryKpi}.`);
  }
  const primaryMetricNorm = primaryKpi ? normalizeSimilarityText(primaryKpi) : "";
  for (const line of sectionLines(monitoringPlan, 8)) {
    const normalizedLine = normalizeSimilarityText(line);
    if (line.toLowerCase().startsWith("primary metric")) {
      continue;
    }
    if (
      primaryMetricNorm &&
      (normalizedLine === primaryMetricNorm || normalizedLine.includes(primaryMetricNorm) || primaryMetricNorm.includes(normalizedLine))
    ) {
      continue;
    }
    telemetry.push(line);
  }

  const uxUiDesign: string[] = [];
  if (bodyLower.includes("mobile")) {
    uxUiDesign.push("Prioritize a simplified mobile checkout path with fewer steps and clear progress feedback.");
  }
  if (bodyLower.includes("bundle") || bodyLower.includes("recommendation")) {
    uxUiDesign.push("Design recommendation and bundle surfaces on PDP/cart with clear relevance cues and opt-out controls.");
  }
  uxUiDesign.push("Ensure accessible interaction patterns (contrast, focus order, keyboard support, readable touch targets).");
  uxUiDesign.push("Validate responsive behavior across core mobile breakpoints before rollout.");

  const experiment: string[] = [];
  if (primaryKpi) {
    experiment.push(`Hypothesis: improving checkout and merchandising will increase ${primaryKpi}.`);
  }
  if (probabilityOfSuccess) {
    experiment.push(`Initial probability of success estimate: ${probabilityOfSuccess}.`);
  }
  if (timeHorizon) {
    experiment.push(`Experiment horizon: ${timeHorizon}.`);
  }
  experiment.push(...sectionLines(killCriteria, 4));

  const qa: string[] = [];
  for (const blocker of synthesis.blockers) {
    qa.push(`Open blocker: ${blocker}`);
  }
  for (const conflict of synthesis.conflicts) {
    qa.push(`Conflict to resolve: ${conflict}`);
  }
  for (const revision of synthesis.required_revisions) {
    qa.push(`Required revision: ${revision}`);
  }
  if (qa.length === 0) {
    qa.push("No additional unresolved questions were captured at synthesis time.");
  }

  const notes: string[] = [];
  if (owner) {
    notes.push(`Owner: ${owner}.`);
  }
  if (investmentRequired) {
    notes.push(`Investment required: ${investmentRequired}.`);
  }
  if (grossBenefit) {
    notes.push(`12-month gross benefit estimate: ${grossBenefit}.`);
  }
  if (riskAdjustedRoi) {
    notes.push(`Risk-adjusted ROI estimate: ${riskAdjustedRoi}.`);
  }
  if (synthesis.final_recommendation) {
    notes.push(`Chairperson recommendation snapshot: ${synthesis.final_recommendation}.`);
  }

  let risks = reviewsRiskEvidence(reviews, 6);
  if (risks.length === 0) {
    risks = sectionLines(riskMatrix, 4).map((line) => `Risk matrix: ${line}`);
  }

  const milestones = [
    "Milestone 1: Finalize implementation scope, instrumentation plan, and rollout guardrails.",
    "Milestone 2: Ship core checkout + merchandising changes behind a controlled rollout.",
    "Milestone 3: Evaluate experiment outcomes against kill criteria and decide scale-up or rollback.",
  ];

  if (timeHorizon) {
    milestones[0] = `Milestone 1 (${timeHorizon} plan): finalize scope, instrumentation, and launch criteria.`;
  }

  const sections: Record<string, string[]> = {
    Goals: dedupeKeepOrder(goals, 8),
    Background: dedupeKeepOrder(background, 8),
    Research: dedupeSemantic(research, 10, 0.88),
    "User Stories": dedupeKeepOrder(userStories, 5),
    Requirements: dedupeSemantic(requirements, 8),
    Telemetry: dedupeSemantic(telemetry, 8, 0.88),
    "UX/UI Design": dedupeKeepOrder(uxUiDesign, 6),
    Experiment: dedupeSemantic(experiment, 8, 0.88),
    "Q&A": dedupeKeepOrder(qa, 8),
    Notes: dedupeKeepOrder(notes, 8),
  };

  for (const [sectionName, defaultLine] of Object.entries(PRD_SECTION_DEFAULTS)) {
    if (!sections[sectionName] || sections[sectionName].length === 0) {
      sections[sectionName] = [defaultLine];
    }
  }

  const scope = dedupeKeepOrder([...sections.Requirements, ...sections.Goals], 8);
  const telemetryOut = dedupeKeepOrder(sections.Telemetry, 8);
  const risksOut = dedupeKeepOrder(risks, 8);

  return {
    title: `PRD for Decision ${state.decision_name}`,
    scope: scope.length > 0 ? scope : [PRD_SECTION_DEFAULTS.Requirements],
    milestones,
    telemetry: telemetryOut.length > 0 ? telemetryOut : [PRD_SECTION_DEFAULTS.Telemetry],
    risks:
      risksOut.length > 0
        ? risksOut
        : ["No explicit risks were captured; complete risk review before execution."],
    sections,
  };
}

function headingOne(text: string): Record<string, unknown> {
  return {
    object: "block",
    type: "heading_1",
    heading_1: {
      rich_text: [
        {
          type: "text",
          text: { content: text.slice(0, 1800) },
        },
      ],
    },
  };
}

function paragraph(text: string): Record<string, unknown> {
  return {
    object: "block",
    type: "paragraph",
    paragraph: {
      rich_text: [
        {
          type: "text",
          text: { content: text.slice(0, 1800) },
        },
      ],
    },
  };
}

function bullet(text: string): Record<string, unknown> {
  return {
    object: "block",
    type: "bulleted_list_item",
    bulleted_list_item: {
      rich_text: [
        {
          type: "text",
          text: { content: text.slice(0, 1800) },
        },
      ],
    },
  };
}

export function prdChildren(decisionName: string, prd: PRDOutput | null): Array<Record<string, unknown>> {
  const sectionOrder: Array<[string, string]> = [
    ["1. Goals", "Goals"],
    ["2. Background", "Background"],
    ["3. Research", "Research"],
    ["4. User Stories", "User Stories"],
    ["5. Requirements", "Requirements"],
    ["6. Telemetry", "Telemetry"],
    ["7. UX/UI Design", "UX/UI Design"],
    ["8. Experiment", "Experiment"],
    ["9. Q&A", "Q&A"],
    ["10. Notes", "Notes"],
  ];

  const sections = prd?.sections ?? {};

  const blocks: Array<Record<string, unknown>> = [
    headingOne(`Product Requirements Document: ${decisionName}`),
    paragraph("Generated from the strategic decision document and executive review feedback."),
  ];

  for (const [heading, key] of sectionOrder) {
    blocks.push(headingOne(heading));
    const lines = sections[key] && sections[key].length > 0 ? sections[key] : [PRD_SECTION_DEFAULTS[key] ?? "To be completed."];
    for (const line of dedupeKeepOrder(lines, 8)) {
      blocks.push(bullet(line));
    }
  }

  return blocks.slice(0, 100);
}
