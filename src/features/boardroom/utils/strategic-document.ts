import { CURRENCY_FORMATTER } from "../constants";
import type {
  CreateStrategyDraft,
  DraftBoardAction,
  SocraticLiveFeedItem,
  SocraticResearchLink,
  SocraticSession,
  StrategicBlastRadius,
  StrategicDecisionDocument,
  StrategicSocraticLogicGap,
  StrategicSocraticRiskPill,
} from "../types";
import { sectionTitleFromKey } from "./socratic-session";

function extractAssumptions(financialModel: string, draft: CreateStrategyDraft): string[] {
  const lines = financialModel
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  const assumptions = lines
    .filter((line) => /assumption|baseline|target|probability|cac|payback|margin|revenue/i.test(line))
    .map((line) => line.replace(/^-+\s*/, ""))
    .slice(0, 5);

  if (assumptions.length > 0) {
    return assumptions;
  }

  const fallback: string[] = [];
  if (draft.capitalAllocation.probabilityOfSuccess.trim().length > 0) {
    fallback.push(`Probability of success: ${draft.capitalAllocation.probabilityOfSuccess.trim()}`);
  }
  if (draft.capitalAllocation.investmentRequired > 0) {
    fallback.push(`Investment required: ${CURRENCY_FORMATTER.format(draft.capitalAllocation.investmentRequired)}`);
  }
  if (draft.capitalAllocation.grossBenefit12m > 0) {
    fallback.push(`12-month gross benefit: ${CURRENCY_FORMATTER.format(draft.capitalAllocation.grossBenefit12m)}`);
  }
  return fallback;
}

function deriveValueDriver(draft: CreateStrategyDraft): "Efficiency" | "Revenue" | "Risk" {
  const objectiveText = [
    draft.coreProperties.strategicObjective,
    draft.strategicObjective,
    draft.sections.strategicContext ?? "",
    draft.sections.financialModel ?? "",
  ]
    .join(" ")
    .toLowerCase();

  if (/risk|compliance|privacy|security|regulator|legal/.test(objectiveText)) {
    return "Risk";
  }
  if (/margin|efficiency|cost|automation|productivity|opex/.test(objectiveText)) {
    return "Efficiency";
  }
  return "Revenue";
}

function deriveBlastRadius(draft: CreateStrategyDraft): StrategicBlastRadius {
  const combinedRiskSignals = [
    draft.riskProperties.regulatoryRisk,
    draft.riskProperties.technicalRisk,
    draft.riskProperties.operationalRisk,
    draft.riskProperties.reputationalRisk,
    draft.sections.downsideModel ?? "",
  ]
    .join(" ")
    .toLowerCase();

  if (/critical|high|systemic|irreversible|platform-wide|multi-region|data loss/.test(combinedRiskSignals)) {
    return "High";
  }
  if (/medium|moderate|segment|localized|partial/.test(combinedRiskSignals)) {
    return "Medium";
  }
  return "Low";
}

function deriveLogicGaps(draft: CreateStrategyDraft, session: SocraticSession): string[] {
  const problemStatement = (draft.sections.problemFraming ?? "").trim();
  const logicGaps: string[] = [];

  if (problemStatement.length === 0) {
    logicGaps.push("Problem statement is empty.");
  }
  if (problemStatement.length > 0 && !/\d|%|\$/.test(problemStatement)) {
    logicGaps.push("Problem statement lacks quantified impact.");
  }
  if (problemStatement.length > 0 && !/root cause|constraint|because|driver/i.test(problemStatement)) {
    logicGaps.push("Root cause is not explicit.");
  }

  const problemChecklist = session.checklist.find((entry) => entry.sectionKey === "problemFraming");
  if (problemChecklist && problemChecklist.status !== "ready") {
    logicGaps.push(problemChecklist.prompt);
  }

  return logicGaps.slice(0, 4);
}

function inferGapType(gap: string): "Hygiene" | "Substance" {
  if (/\b(capital|cost|consisten|assumption|guardrail|compliance|risk threshold|artifact|metric|cac|churn)\b/i.test(gap)) {
    return "Hygiene";
  }
  return "Substance";
}

function inferRiskLevel(gap: StrategicSocraticLogicGap): "Critical" | "Warning" {
  const text = `${gap.section_title} ${gap.gap}`.toLowerCase();
  if (
    /\b(single point of failure|spof|invalidates|core roi|runway|burn rate|cash flow|regulatory|compliance breach|reversion|rollback|blast radius)\b/.test(text)
  ) {
    return "Critical";
  }
  if (gap.section_key === "financialModel" || gap.section_key === "riskMatrix" || gap.section_key === "killCriteria") {
    return "Critical";
  }
  return "Warning";
}

function buildRiskPills(logicGaps: StrategicSocraticLogicGap[], action: DraftBoardAction | null): StrategicSocraticRiskPill[] {
  const deduped = new Set<string>();
  const pills: StrategicSocraticRiskPill[] = [];

  for (const gap of logicGaps) {
    const description = gap.gap.trim();
    if (description.length === 0) {
      continue;
    }
    const key = `${gap.section_key}:${description.toLowerCase()}`;
    if (deduped.has(key)) {
      continue;
    }
    deduped.add(key);
    pills.push({
      section_key: gap.section_key,
      section_title: gap.section_title,
      risk_title: gap.section_title,
      description,
      risk_level: inferRiskLevel(gap),
    });
  }

  if (action === "simulate_red_team" && pills.length > 0) {
    pills[0] = {
      ...pills[0],
      risk_level: "Critical",
    };
  }

  return pills.slice(0, 10);
}

function deriveRegulations(complianceText: string): string[] {
  const regulations = ["GDPR", "CCPA", "HIPAA", "SOC 2", "ISO 27001", "PCI DSS"];
  const detected = regulations.filter((regulation) =>
    complianceText.toLowerCase().includes(regulation.toLowerCase().replace(/\s+/g, "")) ||
    complianceText.toLowerCase().includes(regulation.toLowerCase()),
  );
  return detected.slice(0, 5);
}

function buildEvidenceSlots(links: SocraticResearchLink[]): Array<{ id: string; source: string; link: string }> {
  return links.slice(0, 8).map((link, index) => ({
    id: `ref_${index + 1}`,
    source: link.title,
    link: link.url,
  }));
}

function deriveActiveInquiry(session: SocraticSession, action: DraftBoardAction | null): string {
  if (action === "simulate_red_team") {
    return "If a competitor launched this within 24 hours, what part of our moat would break first?";
  }
  if (action === "verify_assumptions") {
    return "Which assumption has the highest sensitivity on ROI, and what external evidence validates it?";
  }

  const firstAttention = session.checklist.find((item) => item.status === "attention");
  if (firstAttention) {
    return firstAttention.prompt;
  }

  return session.suggestions[0]?.question ?? "What critical assumption is still unproven?";
}

function deriveSuggestedResearch(session: SocraticSession, action: DraftBoardAction | null): string[] {
  const sectionQueries = session.checklist
    .filter((item) => item.status !== "ready")
    .slice(0, 4)
    .map((item) => `Industry benchmark for ${item.sectionTitle.toLowerCase()} with quantified ranges`);

  if (action === "simulate_red_team") {
    return [
      "Recent competitor launches in this category with time-to-market and pricing",
      "Failure cases for similar initiatives in the last 24 months",
      ...sectionQueries,
    ].slice(0, 6);
  }

  if (action === "verify_assumptions") {
    return [
      "Customer acquisition cost benchmark by segment and channel",
      "Churn baseline by cohort and contract type",
      ...sectionQueries,
    ].slice(0, 6);
  }

  return sectionQueries;
}

function deriveRedTeamCritique(draft: CreateStrategyDraft, session: SocraticSession, action: DraftBoardAction | null): string {
  const finalDecision = (draft.sections.finalDecision ?? "").trim();
  const downside = (draft.sections.downsideModel ?? "").trim();
  const thinCount = session.thinSections.length;

  if (action === "simulate_red_team") {
    return "Counter-case: execution risk and capital lock-in could outweigh upside if adoption lags and rollback is slow.";
  }

  if (finalDecision.length === 0) {
    return "Counter-case: the decision is under-specified, so board approval would be premature.";
  }

  if (downside.length === 0 || thinCount > 1) {
    return "Counter-case: downside controls are thin; this could create asymmetrical downside versus projected upside.";
  }

  return "Counter-case: a faster, lower-capital option may capture near-term value with less governance exposure.";
}

export function buildStrategicDecisionDocument(
  draft: CreateStrategyDraft,
  session: SocraticSession,
  options?: {
    owner?: string;
    clippedEvidenceBySection?: Record<string, SocraticResearchLink[]>;
    action?: DraftBoardAction | null;
  },
): StrategicDecisionDocument {
  const owner = (options?.owner ?? draft.owner ?? "").trim() || "User_ID";
  const clipped = options?.clippedEvidenceBySection ?? {};
  const action = options?.action ?? null;
  const financialModel = draft.sections.financialModel ?? "";
  const complianceMonitoring = draft.sections.complianceMonitoring ?? "";
  const downsideModel = draft.sections.downsideModel ?? "";
  const killCriteria = draft.sections.killCriteria ?? "";
  const derivedLogicGaps = deriveLogicGaps(draft, session).map((gap) => ({
    section_key: "problemFraming",
    section_title: sectionTitleFromKey("problemFraming"),
    gap,
    gap_type: inferGapType(gap),
  }));

  return {
    metadata: {
      title: draft.name.trim().length > 0 ? draft.name.trim() : "Untitled Strategic Decision",
      version: "1.0",
      lastModified: new Date().toISOString(),
      owner,
      readinessScore: Math.max(0, Math.min(100, Math.round(session.confidenceScore))),
    },
    sections: {
      problem_statement: {
        content: (draft.sections.problemFraming ?? "").trim(),
        logic_gaps: deriveLogicGaps(draft, session),
        evidence_slots: buildEvidenceSlots(clipped.problemFraming ?? []),
      },
      economic_logic: {
        value_driver: deriveValueDriver(draft),
        base_assumptions: extractAssumptions(financialModel, draft),
        capital_allocation: [
          draft.capitalAllocation.investmentRequired > 0
            ? `Investment: ${CURRENCY_FORMATTER.format(draft.capitalAllocation.investmentRequired)}`
            : "",
          draft.capitalAllocation.grossBenefit12m > 0
            ? `12m benefit: ${CURRENCY_FORMATTER.format(draft.capitalAllocation.grossBenefit12m)}`
            : "",
          draft.capitalAllocation.probabilityOfSuccess.trim().length > 0
            ? `Probability: ${draft.capitalAllocation.probabilityOfSuccess.trim()}`
            : "",
        ]
          .filter((entry) => entry.length > 0)
          .join(" | "),
      },
      downside_modeling: {
        fail_state: downsideModel.trim(),
        blast_radius: deriveBlastRadius(draft),
        reversion_plan: killCriteria.trim(),
      },
      governance_compliance: {
        regulations: deriveRegulations(complianceMonitoring),
        data_privacy: /privacy|pii|gdpr|ccpa|data subject|retention|consent/i.test(complianceMonitoring),
      },
    },
    socratic_layer: {
      active_inquiry: deriveActiveInquiry(session, action),
      suggested_research: deriveSuggestedResearch(session, action),
      red_team_critique: deriveRedTeamCritique(draft, session, action),
      logic_gaps: derivedLogicGaps,
      risk_pills: buildRiskPills(derivedLogicGaps, action),
    },
  };
}

export function buildSocraticLiveFeed(
  strategicDocument: StrategicDecisionDocument,
  session: SocraticSession,
): SocraticLiveFeedItem[] {
  const feed: SocraticLiveFeedItem[] = [];

  if (strategicDocument.socratic_layer.logic_gaps.length > 0) {
    strategicDocument.socratic_layer.logic_gaps.slice(0, 10).forEach((gap, index) => {
      feed.push({
        id: `gap-${index + 1}`,
        sectionKey: gap.section_key,
        section: gap.section_title || sectionTitleFromKey(gap.section_key),
        message: gap.gap,
      });
    });
  } else {
    strategicDocument.sections.problem_statement.logic_gaps.forEach((gap, index) => {
      feed.push({
        id: `gap-${index + 1}`,
        sectionKey: "problemFraming",
        section: "Problem Statement",
        message: gap,
      });
    });
  }

  session.checklist
    .filter((item) => item.status !== "ready")
    .slice(0, 8)
    .forEach((item, index) => {
      feed.push({
        id: `check-${index + 1}-${item.sectionKey}`,
        sectionKey: item.sectionKey,
        section: item.sectionTitle,
        message: item.prompt,
      });
    });

  return feed;
}
