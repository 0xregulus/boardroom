import { STRATEGIC_ARTIFACT_SECTIONS } from "../constants";
import type {
  CreateStrategyDraft,
  MatrixSectionKey,
  SocraticChecklistItem,
  SocraticChecklistStatus,
  SocraticDiscoveryQuestion,
  SocraticPersona,
  SocraticPillar,
  SocraticResearchLink,
  SocraticSession,
  SocraticSuggestion,
} from "../types";
import { defaultMatrixForSection, isMatrixSectionKey, parseSectionMatrix } from "./section-matrix";

const SECTION_TEMPLATE_BY_KEY = Object.fromEntries(
  STRATEGIC_ARTIFACT_SECTIONS.map((section) => [section.key, section]),
) as Record<string, (typeof STRATEGIC_ARTIFACT_SECTIONS)[number]>;

const SOCRATIC_DISCOVERY_QUESTIONS: SocraticDiscoveryQuestion[] = [
  {
    id: "discovery-burning-platform",
    sectionKey: "problemFraming",
    question: "Is this a burning platform or a nice-to-have optimization?",
    placeholder: "Quantify urgency, affected segment, and cost of waiting.",
  },
  {
    id: "discovery-economic-logic",
    sectionKey: "financialModel",
    question: "What is the dominant value driver: efficiency, revenue, or risk mitigation?",
    placeholder: "State driver, unit economics, and key assumptions.",
  },
  {
    id: "discovery-downside",
    sectionKey: "downsideModel",
    question: "If this fails, what is the blast radius and can we reverse in under 48 hours?",
    placeholder: "Name trigger, fallout scope, and rollback path.",
  },
];

const HYGIENE_SECTION_KEYS = ["riskMatrix", "downsideModel", "killCriteria", "complianceMonitoring"] as const;
const SUBSTANCE_SECTION_KEYS = ["strategicContext", "problemFraming", "optionsEvaluated", "financialModel", "finalDecision"] as const;
const THIN_SECTION_THRESHOLD = 0.45;
const BOARD_READY_SCORE = 75;

const SECTION_PILLAR_MAP: Record<string, SocraticPillar> = {
  strategicContext: "Viability",
  problemFraming: "Integrity",
  optionsEvaluated: "Feasibility",
  financialModel: "Viability",
  riskMatrix: "Compliance",
  downsideModel: "Feasibility",
  finalDecision: "Red-Team",
  killCriteria: "Integrity",
  complianceMonitoring: "Compliance",
  executiveSummary: "Integrity",
};

const SECTION_PERSONA_MAP: Record<string, SocraticPersona> = {
  strategicContext: {
    name: "Chief of Staff",
    stance: "Strategic context gate: clarify top-priority alignment and cost of inaction.",
  },
  problemFraming: {
    name: "Strategy Analyst",
    stance: "Constraint gate: define root cause and quantify impact.",
  },
  optionsEvaluated: {
    name: "CTO Shadow",
    stance: "Execution gate: pressure-test option complexity, sequencing, and reversibility.",
  },
  financialModel: {
    name: "CFO Shadow",
    stance: "Capital gate: challenge assumptions, ROI math, and churn sensitivity.",
  },
  riskMatrix: {
    name: "Risk Counsel",
    stance: "Control gate: assess probability-impact logic and mitigation ownership.",
  },
  downsideModel: {
    name: "COO Shadow",
    stance: "Resilience gate: model blast radius, triggers, and rollback speed.",
  },
  finalDecision: {
    name: "Red-Team Partner",
    stance: "Dissent gate: surface strongest counter-argument before commitment.",
  },
  killCriteria: {
    name: "Investment Committee",
    stance: "Discipline gate: define stop-loss thresholds and escalation paths.",
  },
  complianceMonitoring: {
    name: "Compliance Shadow",
    stance: "Governance gate: verify controls, reporting cadence, and accountability.",
  },
  executiveSummary: {
    name: "Board Liaison",
    stance: "Clarity gate: compress rationale into a precise investment thesis.",
  },
};

function scoreTextSectionReadiness(sectionKey: string, rawValue: string): number {
  const trimmed = rawValue.trim();
  if (trimmed.length === 0) {
    return 0;
  }

  const template = SECTION_TEMPLATE_BY_KEY[sectionKey]?.defaultValue.trim() ?? "";
  if (template.length > 0 && trimmed === template) {
    return 0;
  }

  const lines = trimmed
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  let informativeLineCount = 0;
  for (const line of lines) {
    if (line.startsWith("-")) {
      const [, value = ""] = line.split(":", 2);
      if (value.trim().length >= 4) {
        informativeLineCount += 1;
      }
      continue;
    }

    if (line.endsWith(":")) {
      continue;
    }

    if (line.length >= 14) {
      informativeLineCount += 1;
    }
  }

  const hasNumericSignal = /\$|\d|%|x\b|roi|cac|payback/i.test(trimmed);
  const hasCounterEvidenceSignal = /(counter|rebut|alternative|trade-?off|blast radius|rollback|revert)/i.test(trimmed);
  const coverageScore = Math.min(1, informativeLineCount / 4);
  // Lowering weights for simple regex signals in favor of structural/semantic depth
  const signalScore = (hasNumericSignal ? 0.12 : 0) + (hasCounterEvidenceSignal ? 0.1 : 0);

  return Math.min(1, coverageScore + signalScore);
}

function scoreMatrixSectionReadiness(sectionKey: MatrixSectionKey, rawValue: string): number {
  const baseline = defaultMatrixForSection(sectionKey);
  const parsed = parseSectionMatrix(rawValue, baseline);

  let authoredCells = 0;
  for (let rowIndex = 0; rowIndex < parsed.rows.length; rowIndex += 1) {
    const row = parsed.rows[rowIndex];
    for (let columnIndex = 0; columnIndex < row.length; columnIndex += 1) {
      const value = row[columnIndex]?.trim() ?? "";
      if (value.length === 0) {
        continue;
      }
      const baselineValue = baseline.rows[rowIndex]?.[columnIndex]?.trim() ?? "";
      if (value !== baselineValue) {
        authoredCells += 1;
      }
    }
  }

  if (sectionKey === "optionsEvaluated") {
    const optionNamesRow = parsed.rows.find((row) => (row[0] ?? "").trim().toLowerCase() === "option name");
    const namedOptions = optionNamesRow
      ? optionNamesRow.slice(1).filter((entry) => entry.trim().length > 0).length
      : 0;
    const optionCoverage = Math.min(1, namedOptions / 3);
    const contentCoverage = Math.min(1, authoredCells / 10);
    return Math.min(1, optionCoverage * 0.6 + contentCoverage * 0.4);
  }

  const mitigationCount = parsed.rows.filter((row) => (row[3] ?? "").trim().length > 0).length;
  const mitigationCoverage = Math.min(1, mitigationCount / 3);
  const contentCoverage = Math.min(1, authoredCells / 6);
  // Mitigations now require semantic validation, reducing direct weighting here
  return Math.min(1, mitigationCoverage * 0.45 + contentCoverage * 0.55);
}

function scoreSectionReadiness(sectionKey: string, value: string): number {
  if (isMatrixSectionKey(sectionKey)) {
    return scoreMatrixSectionReadiness(sectionKey, value);
  }
  return scoreTextSectionReadiness(sectionKey, value);
}

export function sectionTitleFromKey(sectionKey: string): string {
  return SECTION_TEMPLATE_BY_KEY[sectionKey]?.title ?? sectionKey;
}

export function socraticPillarForSection(sectionKey: string): SocraticPillar {
  return SECTION_PILLAR_MAP[sectionKey] ?? "Integrity";
}

export function socraticPersonaForSection(sectionKey: string): SocraticPersona {
  return SECTION_PERSONA_MAP[sectionKey] ?? {
    name: "Socratic Observer",
    stance: "Expose gaps in logic and evidence before board review.",
  };
}

function checklistStatusForSection(
  sectionKey: string,
  sectionReadinessByKey: Record<string, number>,
  researchLinksBySection: Record<string, SocraticResearchLink[]>,
): SocraticChecklistStatus {
  const readiness = sectionReadinessByKey[sectionKey] ?? 0;
  const hasResearch = (researchLinksBySection[sectionKey] ?? []).length > 0;

  if (readiness >= 0.7) {
    return "ready";
  }
  if (hasResearch) {
    return "research";
  }
  return "attention";
}

function buildMirrorSuggestions(
  draft: CreateStrategyDraft,
  thinSectionSet: Set<string>,
  researchLinksBySection: Record<string, SocraticResearchLink[]>,
): SocraticSuggestion[] {
  const strategicContext = draft.sections.strategicContext ?? "";
  const financialModel = draft.sections.financialModel ?? "";
  const growthClaimExists = /(growth|expand|expansion|market is expanding|20%)/i.test(strategicContext);
  const hasAcquisitionCostModel = /(cac|acquisition|fixed cost|variable|marketing spend|capital cost)/i.test(financialModel);

  const suggestions: Omit<SocraticSuggestion, "isThinSection" | "researchLinks">[] = [
    {
      id: "mirror-problem-burning-platform",
      sectionKey: "problemFraming",
      sectionTitle: sectionTitleFromKey("problemFraming"),
      question: "Is this a burning platform or a nice-to-have optimization?",
      rationale: "Board-level decisions require urgency and quantified constraint framing.",
      ghostText: "Mirror: quantify who is impacted, how much value is at risk, and why delay is expensive.",
      pillar: "Integrity",
    },
    {
      id: "mirror-economic-logic-driver",
      sectionKey: "financialModel",
      sectionTitle: sectionTitleFromKey("financialModel"),
      question: "What is the primary value driver: efficiency, revenue, or risk mitigation?",
      rationale: "Economic logic should show one dominant value engine and supporting assumptions.",
      ghostText: "Mirror: pin the primary value driver, unit economics, and sensitivity assumptions.",
      pillar: "Viability",
    },
    {
      id: "mirror-downside-blast-radius",
      sectionKey: "downsideModel",
      sectionTitle: sectionTitleFromKey("downsideModel"),
      question: "If this fails, what is the blast radius and can we revert in under 48 hours?",
      rationale: "Leaders need bounded downside and explicit reversibility planning.",
      ghostText: "Mirror: define trigger, blast radius, and rollback path with a 48-hour feasibility check.",
      pillar: "Feasibility",
    },
    {
      id: "mirror-counter-evidence-red-team",
      sectionKey: "finalDecision",
      sectionTitle: sectionTitleFromKey("finalDecision"),
      question: "I am red-teaming this: what is the strongest argument against this move and your rebuttal?",
      rationale: "Counter-evidence reveals hidden assumptions and improves option quality.",
      ghostText: "Mirror: state the strongest counter-case, then rebut it with evidence and trade-off logic.",
      pillar: "Red-Team",
    },
  ];

  if (growthClaimExists && !hasAcquisitionCostModel) {
    suggestions.push({
      id: "mirror-growth-cost-structure",
      sectionKey: "financialModel",
      sectionTitle: sectionTitleFromKey("financialModel"),
      question:
        "You mention growth, but not acquisition capital. Should user acquisition be modeled as fixed cost or variable marketing spend?",
      rationale: "Growth claims without cost structure create false ROI confidence.",
      ghostText: "Mirror: split acquisition economics into fixed and variable costs before projecting ROI.",
      pillar: "Viability",
    });
  }

  return suggestions
    .map((suggestion) => ({
      ...suggestion,
      isThinSection: thinSectionSet.has(suggestion.sectionKey),
      researchLinks: researchLinksBySection[suggestion.sectionKey] ?? [],
    }))
    .sort((a, b) => Number(b.isThinSection) - Number(a.isThinSection));
}

function buildSocraticChecklist(
  suggestions: SocraticSuggestion[],
  sectionReadinessByKey: Record<string, number>,
  researchLinksBySection: Record<string, SocraticResearchLink[]>,
): SocraticChecklistItem[] {
  const promptBySection = suggestions.reduce<Record<string, string>>((acc, suggestion) => {
    if (!acc[suggestion.sectionKey]) {
      acc[suggestion.sectionKey] = suggestion.question;
    }
    return acc;
  }, {});

  return Object.keys(sectionReadinessByKey)
    .sort((a, b) => (sectionReadinessByKey[a] ?? 0) - (sectionReadinessByKey[b] ?? 0))
    .map((sectionKey) => ({
      sectionKey,
      sectionTitle: sectionTitleFromKey(sectionKey),
      prompt:
        promptBySection[sectionKey] ??
        `What evidence proves this section is board-ready for ${sectionTitleFromKey(sectionKey)}?`,
      pillar: socraticPillarForSection(sectionKey),
      status: checklistStatusForSection(sectionKey, sectionReadinessByKey, researchLinksBySection),
    }));
}

export function buildSocraticSession(
  draft: CreateStrategyDraft,
  researchLinksBySection: Record<string, SocraticResearchLink[]> = {},
): SocraticSession {
  const monitoredSectionKeys = new Set<string>([...HYGIENE_SECTION_KEYS, ...SUBSTANCE_SECTION_KEYS]);
  const sectionReadiness: Record<string, number> = {};

  for (const sectionKey of monitoredSectionKeys) {
    sectionReadiness[sectionKey] = scoreSectionReadiness(sectionKey, draft.sections[sectionKey] ?? "");
  }

  const thinSections = Array.from(monitoredSectionKeys).filter((sectionKey) => sectionReadiness[sectionKey] < THIN_SECTION_THRESHOLD);
  const thinSectionSet = new Set<string>(thinSections);
  const hygieneScore =
    Math.round(
      (HYGIENE_SECTION_KEYS.reduce((acc, key) => acc + (sectionReadiness[key] ?? 0), 0) / HYGIENE_SECTION_KEYS.length) * 100,
    ) || 0;
  const substanceScore =
    Math.round(
      (SUBSTANCE_SECTION_KEYS.reduce((acc, key) => acc + (sectionReadiness[key] ?? 0), 0) / SUBSTANCE_SECTION_KEYS.length) * 100,
    ) || 0;
  const titleSignal = draft.name.trim().length >= 5 ? 10 : 0;
  const confidenceScore = Math.min(100, Math.round(hygieneScore * 0.45 + substanceScore * 0.45 + titleSignal));
  const suggestions = buildMirrorSuggestions(draft, thinSectionSet, researchLinksBySection);
  const checklist = buildSocraticChecklist(suggestions, sectionReadiness, researchLinksBySection);
  const ghostTextBySection = suggestions.reduce<Record<string, string>>((acc, suggestion) => {
    if (!acc[suggestion.sectionKey]) {
      acc[suggestion.sectionKey] = suggestion.ghostText;
    }
    return acc;
  }, {});
  const personaBySection = Object.keys(sectionReadiness).reduce<Record<string, SocraticPersona>>((acc, sectionKey) => {
    acc[sectionKey] = socraticPersonaForSection(sectionKey);
    return acc;
  }, {});

  return {
    documentSnapshot: draft,
    suggestions,
    checklist,
    confidenceScore,
    hygieneScore,
    substanceScore,
    thinSections,
    sectionReadinessByKey: sectionReadiness,
    personaBySection,
    ghostTextBySection,
    discoveryQuestions: SOCRATIC_DISCOVERY_QUESTIONS,
  };
}

export function isSocraticSessionBoardReady(session: SocraticSession): boolean {
  return session.confidenceScore >= BOARD_READY_SCORE && session.thinSections.length === 0;
}
