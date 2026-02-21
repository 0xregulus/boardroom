import { CURRENCY_FORMATTER, STRATEGIC_ARTIFACT_SECTIONS } from "../constants";
import type {
  CreateStrategyDraft,
  DecisionStrategy,
  DraftCapitalAllocation,
  DraftCoreProperties,
  DraftRiskProperties,
  SocraticArtifactQuestion,
  StrategicMitigationEntry,
} from "../types";
import {
  asNumber,
  asRecord,
  asString,
  firstPresentValue,
  parseCurrencyAmount,
  parseSerializedValue,
} from "./parsing";

export function initialCreateStrategyDraft(): CreateStrategyDraft {
  const sectionDefaults: Record<string, string> = {};
  for (const section of STRATEGIC_ARTIFACT_SECTIONS) {
    sectionDefaults[section.key] = section.defaultValue;
  }

  return {
    name: "",
    owner: "Unassigned",
    reviewDate: "",
    primaryKpi: "Not specified",
    investment: "N/A",
    strategicObjective: "Not specified",
    confidence: "N/A",
    coreProperties: {
      strategicObjective: "",
      primaryKpi: "",
      baseline: "",
      target: "",
      timeHorizon: "",
      decisionType: "",
    },
    capitalAllocation: {
      investmentRequired: 0,
      grossBenefit12m: 0,
      probabilityOfSuccess: "",
      strategicLeverageScore: "",
      reversibilityFactor: "",
    },
    riskProperties: {
      regulatoryRisk: "",
      technicalRisk: "",
      operationalRisk: "",
      reputationalRisk: "",
    },
    sections: sectionDefaults,
    mitigations: [],
  };
}

function parseMitigations(value: unknown): StrategicMitigationEntry[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => asRecord(entry))
    .filter((entry): entry is Record<string, unknown> => entry !== null)
    .map((entry) => ({
      id: asString(entry.id),
      sectionKey: asString(entry.sectionKey),
      riskTitle: asString(entry.riskTitle),
      description: asString(entry.description),
      mitigationText: asString(entry.mitigationText),
      resolvedAt: asString(entry.resolvedAt),
    }))
    .filter((entry) => entry.id.trim().length > 0 && entry.mitigationText.trim().length > 0);
}

export function buildSocraticArtifactQuestions(draft: CreateStrategyDraft): SocraticArtifactQuestion[] {
  const decisionLabel = draft.name.trim().length > 0 ? draft.name.trim() : "this strategy";
  const investmentLabel =
    draft.capitalAllocation.investmentRequired > 0
      ? CURRENCY_FORMATTER.format(draft.capitalAllocation.investmentRequired)
      : "the proposed investment";
  const primaryKpi =
    draft.coreProperties.primaryKpi.trim().length > 0
      ? draft.coreProperties.primaryKpi.trim()
      : draft.primaryKpi.trim().length > 0
        ? draft.primaryKpi.trim()
        : "the primary KPI";

  return [
    {
      id: "privacy-hygiene-guardrail",
      prompt: `You mentioned ${decisionLabel}. What is the specific hygiene guardrail for user data privacy here?`,
      sectionKey: "complianceMonitoring",
      answerLabel: "Hygiene guardrail (privacy)",
      placeholder: "Example: PII minimization + 30-day retention + DSR response SLA <= 7 days.",
      helperText: "Appends your answer to the Compliance & Monitoring section.",
    },
    {
      id: "blocked-threshold",
      prompt: `If we invest ${investmentLabel}, what is the blocked threshold for failure?`,
      sectionKey: "killCriteria",
      answerLabel: "Blocked threshold",
      placeholder: "Example: Block if CAC exceeds $120 for 2 consecutive weeks.",
      helperText: "Appends your answer to the Kill Criteria section.",
    },
    {
      id: "early-warning-signal",
      prompt: `What leading indicator should trigger intervention before ${primaryKpi} misses target?`,
      sectionKey: "downsideModel",
      answerLabel: "Early warning signal",
      placeholder: "Example: Week-2 activation drops below 35% in two cohorts.",
      helperText: "Appends your answer to the Downside Model section.",
    },
    {
      id: "premortem-failure-path",
      prompt: "Assume this initiative failed 12 months from now. What is the most likely failure chain?",
      sectionKey: "downsideModel",
      answerLabel: "Pre-mortem failure chain",
      placeholder: "Example: Rising CAC + delayed onboarding automation + churn spike in SMB segment.",
      helperText: "Appends your answer to the Downside Model section.",
    },
    {
      id: "resource-competition",
      prompt: "If capital is constrained, why should this decision win against the next best alternative?",
      sectionKey: "finalDecision",
      answerLabel: "Capital allocation defense",
      placeholder: "Example: This initiative returns 2.1x risk-adjusted value vs 1.3x alternative.",
      helperText: "Appends your answer to the Final Decision section.",
    },
    {
      id: "resource-competitor-counter",
      prompt: "What is the strongest argument for funding the competing initiative instead, and how do you rebut it?",
      sectionKey: "finalDecision",
      answerLabel: "Resource competitor rebuttal",
      placeholder: "Example: Competing project has faster payback, but this one compounds retention leverage in core segment.",
      helperText: "Appends your answer to the Final Decision section.",
    },
  ];
}

export function appendSocraticAnswerToSection(sectionValue: string, answerLabel: string, answer: string): string {
  const normalizedAnswer = answer.trim().replace(/\s+/g, " ");
  if (normalizedAnswer.length === 0) {
    return sectionValue;
  }

  const nextLine = `- ${answerLabel}: ${normalizedAnswer}`;
  const existingLines = sectionValue
    .split("\n")
    .map((line) => line.trim().toLowerCase());
  if (existingLines.includes(nextLine.toLowerCase())) {
    return sectionValue;
  }

  const trimmed = sectionValue.trimEnd();
  if (trimmed.length === 0) {
    return nextLine;
  }

  return `${trimmed}\n${nextLine}`;
}

export function sectionHasSocraticAnswer(sectionValue: string, answerLabel: string): boolean {
  const normalizedLabel = answerLabel.trim().toLowerCase();
  if (normalizedLabel.length === 0) {
    return false;
  }

  return sectionValue
    .split("\n")
    .map((line) => line.trim().toLowerCase())
    .some((line) => line.startsWith(`- ${normalizedLabel}:`) && line.length > `- ${normalizedLabel}:`.length);
}

export function buildCreateDraftFromStrategy(strategy: DecisionStrategy): CreateStrategyDraft {
  const baseDraft = initialCreateStrategyDraft();
  const artifactSections = strategy.artifactSections ?? {};
  const mergedSections = { ...baseDraft.sections };

  for (const section of STRATEGIC_ARTIFACT_SECTIONS) {
    const persistedValue = artifactSections[section.key];
    if (typeof persistedValue === "string" && persistedValue.trim().length > 0) {
      mergedSections[section.key] = persistedValue;
    }
  }

  const hasExecutiveSummary = typeof artifactSections.executiveSummary === "string" && artifactSections.executiveSummary.trim().length > 0;
  if (!hasExecutiveSummary && strategy.summary.trim().length > 0) {
    mergedSections.executiveSummary = strategy.summary.trim();
  }

  const corePropertiesRecord = asRecord(parseSerializedValue(artifactSections.coreProperties)) ?? {};
  const capitalAllocationRecord = asRecord(parseSerializedValue(artifactSections.capitalAllocationModel)) ?? {};
  const riskPropertiesRecord = asRecord(parseSerializedValue(artifactSections.riskProperties)) ?? {};
  const mitigationEntries = parseMitigations(parseSerializedValue(artifactSections.mitigations));

  const coreProperties: DraftCoreProperties = {
    strategicObjective: firstPresentValue([asString(corePropertiesRecord.strategicObjective), strategy.strategicObjective], ""),
    primaryKpi: firstPresentValue([asString(corePropertiesRecord.primaryKpi), strategy.primaryKpi], ""),
    baseline: asString(corePropertiesRecord.baseline),
    target: asString(corePropertiesRecord.target),
    timeHorizon: asString(corePropertiesRecord.timeHorizon),
    decisionType: asString(corePropertiesRecord.decisionType),
  };

  const capitalAllocation: DraftCapitalAllocation = {
    investmentRequired: asNumber(capitalAllocationRecord.investmentRequired, parseCurrencyAmount(strategy.investment)),
    grossBenefit12m: asNumber(capitalAllocationRecord.grossBenefit12m, 0),
    probabilityOfSuccess: firstPresentValue([asString(capitalAllocationRecord.probabilityOfSuccess), strategy.confidence], ""),
    strategicLeverageScore: asString(capitalAllocationRecord.strategicLeverageScore),
    reversibilityFactor: asString(capitalAllocationRecord.reversibilityFactor),
  };

  const riskProperties: DraftRiskProperties = {
    regulatoryRisk: asString(riskPropertiesRecord.regulatoryRisk),
    technicalRisk: asString(riskPropertiesRecord.technicalRisk),
    operationalRisk: asString(riskPropertiesRecord.operationalRisk),
    reputationalRisk: asString(riskPropertiesRecord.reputationalRisk),
  };

  return {
    ...baseDraft,
    name: strategy.name,
    owner: strategy.owner,
    reviewDate: strategy.reviewDate,
    primaryKpi: strategy.primaryKpi,
    investment: strategy.investment,
    strategicObjective: strategy.strategicObjective,
    confidence: strategy.confidence,
    coreProperties,
    capitalAllocation,
    riskProperties,
    sections: mergedSections,
    mitigations: mitigationEntries,
  };
}
