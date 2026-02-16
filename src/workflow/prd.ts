import { PRDOutput } from "../schemas/prd_output";
import { ReviewOutput } from "../schemas/review_output";
import { WorkflowState } from "./states";

const DECISION_SOURCE_HEADINGS = [
  "Executive Summary",
  "1. Strategic Context",
  "2. Problem Framing",
  "3. Options Evaluated",
  "4. Financial Model",
  "5. Risk Matrix",
  "6. Final Decision",
  "7. Kill Criteria",
  "8. Monitoring Plan",
];

const PRD_SECTION_DEFAULTS: Record<string, string> = {
  Goals: "Define the north star: outcomes, why now, tie to OKRs.",
  Background: "Context: prior decisions, customer insights, incidents, gaps.",
  Research: "Market scans, competitive benchmarks, and evidence.",
  "User Stories": "Use: \"As a [user], I want [action], so I can [benefit].\"",
  Requirements: "Functional, non-functional, and constraints. Make them testable.",
  Telemetry: "Events, properties, funnels, KPIs, dashboards, and review cadence.",
  "UX/UI Design": "Capture UX flows, accessibility, and responsive design notes.",
  Experiment: "Hypothesis, KPIs, success/fail criteria, and sampling plan.",
  "Q&A": "Open questions, blockers, and dependencies.",
  Notes: "Assumptions, pending decisions, and implementation notes.",
};

const LABEL_ONLY_PHRASES = new Set([
  "",
  "+",
  "-",
  "objective supported",
  "kpi impact",
  "cost of inaction",
  "clear problem statement",
  "root cause",
  "affected segment",
  "quantified impact",
  "chosen option",
  "trade-offs",
  "trade offs",
  "primary metric",
  "leading indicators",
  "review cadence",
  "criteria",
  "revenue impact (12m)",
  "cost impact",
  "margin effect",
  "payback period",
  "confidence level",
  "risk",
  "impact",
  "probability",
  "mitigation",
  "we will stop or pivot if",
]);

const LINE_PREFIXES_TO_STRIP = [
  "decision requirement:",
  "executive requirement:",
  "problem framing:",
  "options evaluated:",
  "financial model:",
  "kill criterion:",
  "decision memo:",
];

function lcsLength(a: string, b: string): number {
  const dp: number[] = new Array(b.length + 1).fill(0);

  for (let i = 1; i <= a.length; i += 1) {
    let prev = 0;
    for (let j = 1; j <= b.length; j += 1) {
      const temp = dp[j];
      if (a[i - 1] === b[j - 1]) {
        dp[j] = prev + 1;
      } else {
        dp[j] = Math.max(dp[j], dp[j - 1]);
      }
      prev = temp;
    }
  }

  return dp[b.length] ?? 0;
}

function similarityRatio(a: string, b: string): number {
  if (!a && !b) {
    return 1;
  }

  const denominator = a.length + b.length;
  if (denominator === 0) {
    return 0;
  }

  return (2 * lcsLength(a, b)) / denominator;
}

export function cleanLine(text: string, maxLen = 260): string {
  let normalized = text.replaceAll("**", "").replaceAll("`", "");
  normalized = normalized.replaceAll("\t", " ").split(/\s+/).join(" ").trim();
  normalized = normalized.replace(/^[\s\-•]+|[\s\-•]+$/g, "");

  let lowered = normalized.toLowerCase();
  for (const prefix of LINE_PREFIXES_TO_STRIP) {
    if (lowered.startsWith(prefix)) {
      normalized = normalized.slice(prefix.length).trim();
      lowered = normalized.toLowerCase();
      break;
    }
  }

  const trimmed = normalized.slice(0, maxLen).trim();
  const lowerTrimmed = trimmed.toLowerCase().replace(/:$/, "");

  if (["", "+", "|", "-", "chosen option", "trade-offs", "trade offs"].includes(lowerTrimmed)) {
    return "";
  }

  return trimmed;
}

export function isLabelOnlyLine(line: string): boolean {
  const normalized = cleanLine(line, 260).toLowerCase().trim();

  if (!normalized) {
    return true;
  }
  if (LABEL_ONLY_PHRASES.has(normalized)) {
    return true;
  }
  if (normalized.startsWith("option ")) {
    return true;
  }

  if (normalized.includes(":")) {
    const tail = normalized.split(":").at(-1)?.trim() ?? "";
    if (!tail || LABEL_ONLY_PHRASES.has(tail) || tail.startsWith("option ")) {
      return true;
    }
    if (/^option\s+[a-z0-9]+(?:\s*\(.+\))?$/.test(tail)) {
      return true;
    }
  }

  if (normalized.endsWith(":")) {
    const core = normalized.slice(0, -1).trim();
    if (!core) {
      return true;
    }
    if (LABEL_ONLY_PHRASES.has(core)) {
      return true;
    }
    if (core.split(/\s+/).length <= 4) {
      return true;
    }
  }

  return false;
}

export function dedupeKeepOrder(lines: string[], limit = 8): string[] {
  const output: string[] = [];
  const seen = new Set<string>();

  for (const line of lines) {
    const cleaned = cleanLine(line);
    if (!cleaned) {
      continue;
    }

    const key = cleaned.toLowerCase();
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    output.push(cleaned);

    if (output.length >= limit) {
      break;
    }
  }

  return output;
}

function normalizeSimilarityText(text: string): string {
  let normalized = text.toLowerCase();
  normalized = normalized.replace(/[^a-z0-9\s]/g, " ");
  normalized = normalized.replace(
    /\b(a|an|the|to|for|of|and|or|with|all|ensure|perform|conduct|develop|comprehensive|thorough|potential|required)\b/g,
    " ",
  );
  normalized = normalized.replace(/\s+/g, " ").trim();
  return normalized;
}

function dedupeSemantic(lines: string[], limit = 8, similarity = 0.86): string[] {
  const output: string[] = [];
  const normalizedOutput: string[] = [];

  for (const line of lines) {
    const cleaned = cleanLine(line);
    if (!cleaned) {
      continue;
    }

    let normalized = normalizeSimilarityText(cleaned);
    if (!normalized) {
      normalized = cleaned.toLowerCase();
    }

    let duplicate = false;
    for (const prior of normalizedOutput) {
      if (normalized === prior || similarityRatio(normalized, prior) >= similarity) {
        duplicate = true;
        break;
      }
    }

    if (duplicate) {
      continue;
    }

    output.push(cleaned);
    normalizedOutput.push(normalized);

    if (output.length >= limit) {
      break;
    }
  }

  return output;
}

function requirementTopicKey(text: string): string {
  const lowered = text.toLowerCase();
  if (lowered.includes("downside model") || lowered.includes("downside modeling")) {
    return "downside_modeling";
  }
  if (lowered.includes("compliance review")) {
    return "compliance_review";
  }
  if (lowered.includes("risk matrix")) {
    return "risk_matrix";
  }
  return "";
}

function propertyValue(properties: Record<string, unknown>, name: string): string {
  const raw = properties[name];
  if (typeof raw === "string") {
    return raw;
  }
  if (typeof raw === "number" && Number.isFinite(raw)) {
    return Number.isInteger(raw) ? String(Math.trunc(raw)) : String(raw);
  }
  if (typeof raw === "boolean") {
    return raw ? "Yes" : "No";
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return "";
  }
  const prop = raw as Record<string, unknown>;

  const propType = prop.type;

  if (propType === "title") {
    const title = (prop.title ?? []) as Array<Record<string, unknown>>;
    return title.map((item) => (typeof item.plain_text === "string" ? item.plain_text : "")).join("");
  }

  if (propType === "rich_text") {
    const richText = (prop.rich_text ?? []) as Array<Record<string, unknown>>;
    return richText.map((item) => (typeof item.plain_text === "string" ? item.plain_text : "")).join("");
  }

  if (propType === "number") {
    const value = prop.number;
    if (value === null || value === undefined) {
      return "";
    }
    if (typeof value === "number" && Number.isInteger(value)) {
      return String(Math.trunc(value));
    }
    return String(value);
  }

  if (propType === "select") {
    const select = prop.select as Record<string, unknown> | undefined;
    return typeof select?.name === "string" ? select.name : "";
  }

  if (propType === "status") {
    const status = prop.status as Record<string, unknown> | undefined;
    return typeof status?.name === "string" ? status.name : "";
  }

  if (propType === "checkbox") {
    return prop.checkbox ? "Yes" : "No";
  }

  if (propType === "url") {
    return typeof prop.url === "string" ? prop.url : "";
  }

  if (propType === "email") {
    return typeof prop.email === "string" ? prop.email : "";
  }

  return "";
}

function snapshotBodyText(state: WorkflowState): string {
  const snapshot = state.decision_snapshot;
  if (!snapshot || snapshot.section_excerpt.length === 0) {
    return "";
  }

  const first = snapshot.section_excerpt[0];
  if (!first || typeof first !== "object") {
    return "";
  }

  return typeof first.text.content === "string" ? first.text.content : "";
}

function extractDecisionSection(bodyText: string, heading: string): string {
  if (!bodyText) {
    return "";
  }

  const lowered = bodyText.toLowerCase();
  const marker = heading.toLowerCase();
  const markerPos = lowered.indexOf(marker);

  if (markerPos === -1) {
    return "";
  }

  let contentStart = bodyText.indexOf("\n", markerPos);
  if (contentStart === -1) {
    contentStart = markerPos + heading.length;
  } else {
    contentStart += 1;
  }

  let contentEnd = bodyText.length;

  for (const nextHeading of DECISION_SOURCE_HEADINGS) {
    if (nextHeading.toLowerCase() === marker) {
      continue;
    }

    const idx = lowered.indexOf(nextHeading.toLowerCase(), contentStart);
    if (idx !== -1 && idx < contentEnd) {
      contentEnd = idx;
    }
  }

  return bodyText.slice(contentStart, contentEnd).trim();
}

function sectionLines(text: string, maxLines = 6): string[] {
  if (!text) {
    return [];
  }

  let lines = text
    .split("\n")
    .map((line) => cleanLine(line))
    .filter((line) => line.length > 0);

  if (lines.length <= 1 && lines.length > 0) {
    lines = lines[0]
      .split(/(?<=[.!?])\s+/)
      .map((line) => cleanLine(line))
      .filter((line) => line.length > 0);
  }

  lines = lines.filter((line) => !isLabelOnlyLine(line));
  return dedupeKeepOrder(lines, maxLines);
}

function reviewsRequiredChanges(reviews: Record<string, ReviewOutput>, limit = 6): string[] {
  const lines: string[] = [];
  const seenTopics = new Set<string>();

  for (const review of Object.values(reviews)) {
    for (const change of review.required_changes) {
      const cleaned = cleanLine(change);
      if (!cleaned) {
        continue;
      }

      const topicKey = requirementTopicKey(cleaned);
      if (topicKey && seenTopics.has(topicKey)) {
        continue;
      }
      if (topicKey) {
        seenTopics.add(topicKey);
      }

      lines.push(cleaned);
    }
  }

  return dedupeSemantic(lines, limit);
}

function reviewsRiskEvidence(reviews: Record<string, ReviewOutput>, limit = 6): string[] {
  const lines: string[] = [];

  for (const review of Object.values(reviews)) {
    for (const risk of review.risks) {
      lines.push(`${risk.type}: ${risk.evidence}`);
    }
  }

  return dedupeKeepOrder(lines, limit);
}

function finalDecisionRequirements(finalDecisionText: string): string[] {
  if (!finalDecisionText) {
    return [];
  }

  const cleanText = finalDecisionText.replaceAll("**", "");
  const requirements: string[] = [];

  const optionMatches = [...cleanText.matchAll(/Option\s+([A-Za-z0-9]+)\s*\(([^)]+)\)/g)];

  if (optionMatches.length > 0) {
    const optionDescriptions = dedupeKeepOrder(
      optionMatches.map((match) => `Option ${match[1]} (${match[2].trim()})`),
      4,
    );

    if (optionDescriptions.length === 1) {
      requirements.push(`Implement ${optionDescriptions[0]} as the selected approach.`);
    } else {
      const joined = optionDescriptions.slice(0, 3).join(" + ");
      requirements.push(`Implement a phased rollout combining ${joined}.`);
    }
  }

  for (const line of sectionLines(cleanText, 12)) {
    const lowerLine = line.toLowerCase().replace(/:$/, "");

    if (["chosen option", "trade-offs", "trade offs", "combine", "+"].includes(lowerLine)) {
      continue;
    }

    if (line.toLowerCase().startsWith("option ")) {
      continue;
    }

    if (optionMatches.length > 0 && lowerLine.includes("combine option")) {
      continue;
    }

    if (lowerLine.includes("trade-off") || lowerLine.includes("trade off")) {
      continue;
    }

    if (line.startsWith("Prioritize ") || line.startsWith("Focus ")) {
      requirements.push(`Trade-off guardrail: ${line.replace(/[.]$/, "")}.`);
    } else if (lowerLine.includes("phased rollout") && lowerLine.includes("option")) {
      requirements.push(line.replace(/[.]$/, ""));
    }
  }

  return dedupeSemantic(requirements, 5, 0.8);
}

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
