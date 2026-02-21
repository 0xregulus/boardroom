import { z } from "zod";

import { safeJsonParse } from "../../agents/base";
import { STRATEGIC_ARTIFACT_SECTIONS } from "./constants";
import type {
  CreateStrategyDraft,
  DraftBoardAction,
  StrategicDecisionDocument,
  StrategicSocraticLayer,
  StrategicSocraticLogicGap,
  StrategicSocraticRiskPill,
} from "./types";

const SECTION_TITLE_BY_KEY = Object.fromEntries(
  STRATEGIC_ARTIFACT_SECTIONS.map((section) => [section.key, section.title]),
) as Record<string, string>;
const VALID_SECTION_KEYS = new Set(Object.keys(SECTION_TITLE_BY_KEY));

const llmLogicGapSchema = z.object({
  section_key: z.string().trim().min(1).max(96),
  section_title: z.string().trim().min(1).max(140).optional(),
  gap: z.string().trim().min(1).max(320),
  gap_type: z.enum(["Hygiene", "Substance"]).optional(),
});

const llmRiskPillSchema = z.object({
  section_key: z.string().trim().min(1).max(96),
  section_title: z.string().trim().min(1).max(140).optional(),
  risk_title: z.string().trim().min(1).max(180),
  description: z.string().trim().min(1).max(360),
  risk_level: z.enum(["Critical", "Warning"]),
});

const llmSocraticSchema = z
  .object({
    socratic_layer: z.object({
      active_inquiry: z.string().trim().min(1).max(420),
      suggested_research: z.array(z.string().trim().min(3).max(240)).max(12).default([]),
      red_team_critique: z.string().trim().min(1).max(560),
      risk_pills: z.array(llmRiskPillSchema).max(18).default([]),
    }),
    logic_gaps: z.array(llmLogicGapSchema).max(18).default([]),
  })
  .strict();

export interface SocraticAgentOutput {
  socratic_layer: StrategicSocraticLayer;
}

export const SOCRATIC_AGENT_SYSTEM_PROMPT = `ROLE: You are the Socratic Agent for Boardroom. Your mission is to assist the user in drafting a "Board-Ready" Strategic Decision Document. You do not write the document for them; you stress-test their logic to ensure they pass the upcoming Board Review.

CORE FRAMEWORK:
Every decision must be evaluated against two axes:
1. Hygiene: Quantitative consistency, risk guardrails, and artifact completeness.
2. Substance: Economic logic, strategic moat, and downside modeling.

INSTRUCTIONS:
1. Analyze the Input: Monitor the user's current draft in the sections of the JSON schema.
2. Identify Logic Gaps: Look for thin reasoning.
   - Example: If they claim Market Dominance but provide no competitor analysis, flag a Substance gap.
   - Example: If they project revenue but do not mention the capital required to achieve it, flag a Hygiene gap.
3. Generate Active Inquiries: Formulate ONE primary question that forces deeper thinking.
   - Constraint: Use Socratic Irony. Ask "How might X impact Y?" instead of prescribing.
4. Trigger Research: If a user makes a bold market claim, suggest suggested_research queries for Tavily verification.

RESPONSE FORMAT:
- Return JSON only.
- Include socratic_layer.active_inquiry, socratic_layer.suggested_research, socratic_layer.red_team_critique.
- Include socratic_layer.risk_pills as an array of objects:
  { section_key, section_title, risk_title, description, risk_level }.
- Include logic_gaps as an array of objects: { section_key, section_title, gap, gap_type }.

TONE: Professional, inquisitive, and slightly adversarial (high-end management consultant).`;

const SOCRATIC_RED_TEAM_EXTENSION = `CONTEXTUAL STATE: RED_TEAM_MODE = TRUE

ADVERSARIAL OBJECTIVE:
- Perform a pre-mortem.
- Assume the strategy failed one year from now.
- Find the single point of failure (SPOF).

ADVERSARIAL LOGIC GATES:
1. Fragility test:
   - Detect best-case assumptions.
   - Example challenge: "If market share is 0.5% instead of 10%, does burn rate break viability?"
2. "Who cares?" test:
   - Challenge whether this is durable moat vs temporary feature advantage.
3. Resource war:
   - Surface hidden assumptions of unlimited management attention or engineering bandwidth.
4. External shocks:
   - Add suggested_research queries for:
     - "Recent regulatory changes in [Sector]"
     - "Competitor pivots in [Sector]"
     - "Macro-economic headwinds for [Business Model]"

OUTPUT REQUIREMENTS:
- Emit one RiskPill object for every major logic gap.
- Assign risk_level:
  - "Critical" if the gap invalidates core ROI.
  - "Warning" if it is material but manageable.
- Assume readiness cannot clear while a specific failure state lacks mitigation.
- Keep JSON strict. Do not return prose outside JSON.

TONE:
- Clinical, skeptical, uncompromising devil's-advocate reviewer.`;

export function buildSocraticSystemPrompt(action: DraftBoardAction | null): string {
  if (action !== "simulate_red_team") {
    return SOCRATIC_AGENT_SYSTEM_PROMPT;
  }
  return `${SOCRATIC_AGENT_SYSTEM_PROMPT}\n\n${SOCRATIC_RED_TEAM_EXTENSION}`;
}

function clampSectionContent(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.length <= 1400) {
    return trimmed;
  }
  return `${trimmed.slice(0, 1400)}...`;
}

function inferGapType(gap: string): "Hygiene" | "Substance" {
  if (/\b(capital|cost|consisten|assumption|guardrail|compliance|risk threshold|artifact|metric|cac|churn)\b/i.test(gap)) {
    return "Hygiene";
  }
  return "Substance";
}

function inferRiskLevelFromText(text: string, sectionKey: string): "Critical" | "Warning" {
  const normalized = `${sectionKey} ${text}`.toLowerCase();
  if (
    /\b(single point of failure|spof|core roi|invalidates|burn rate|runway|cash flow|regulatory|compliance|blast radius|rollback|reversion|downside)\b/.test(
      normalized,
    )
  ) {
    return "Critical";
  }
  if (sectionKey === "financialModel" || sectionKey === "riskMatrix" || sectionKey === "killCriteria") {
    return "Critical";
  }
  return "Warning";
}

function normalizeLogicGaps(gaps: Array<z.infer<typeof llmLogicGapSchema>>): StrategicSocraticLogicGap[] {
  const deduped = new Set<string>();
  const normalized: StrategicSocraticLogicGap[] = [];

  for (const entry of gaps) {
    if (!VALID_SECTION_KEYS.has(entry.section_key)) {
      continue;
    }
    const sectionTitle = entry.section_title ?? SECTION_TITLE_BY_KEY[entry.section_key] ?? entry.section_key;
    const key = `${entry.section_key}:${entry.gap.toLowerCase()}`;
    if (deduped.has(key)) {
      continue;
    }
    deduped.add(key);
    normalized.push({
      section_key: entry.section_key,
      section_title: sectionTitle,
      gap: entry.gap,
      gap_type: entry.gap_type ?? inferGapType(entry.gap),
    });
  }

  return normalized.slice(0, 12);
}

function normalizeRiskPills(
  pills: Array<z.infer<typeof llmRiskPillSchema>>,
  logicGaps: StrategicSocraticLogicGap[],
): StrategicSocraticRiskPill[] {
  const deduped = new Set<string>();
  const normalized: StrategicSocraticRiskPill[] = [];

  for (const entry of pills) {
    if (!VALID_SECTION_KEYS.has(entry.section_key)) {
      continue;
    }
    const sectionTitle = entry.section_title ?? SECTION_TITLE_BY_KEY[entry.section_key] ?? entry.section_key;
    const description = entry.description.trim();
    if (description.length === 0) {
      continue;
    }
    const key = `${entry.section_key}:${description.toLowerCase()}`;
    if (deduped.has(key)) {
      continue;
    }
    deduped.add(key);
    normalized.push({
      section_key: entry.section_key,
      section_title: sectionTitle,
      risk_title: entry.risk_title.trim(),
      description,
      risk_level: entry.risk_level,
    });
  }

  // Guarantee coverage: every logic gap should map to at least one risk pill.
  for (const gap of logicGaps) {
    const description = gap.gap.trim();
    const key = `${gap.section_key}:${description.toLowerCase()}`;
    if (deduped.has(key)) {
      continue;
    }
    deduped.add(key);
    normalized.push({
      section_key: gap.section_key,
      section_title: gap.section_title,
      risk_title: gap.section_title,
      description,
      risk_level: inferRiskLevelFromText(description, gap.section_key),
    });
  }

  return normalized.slice(0, 12);
}

function uniqueStrings(values: string[]): string[] {
  const deduped = new Set<string>();
  const normalized: string[] = [];

  for (const value of values) {
    const next = value.trim();
    if (next.length === 0) {
      continue;
    }
    const key = next.toLowerCase();
    if (deduped.has(key)) {
      continue;
    }
    deduped.add(key);
    normalized.push(next);
  }

  return normalized;
}

export function buildSocraticAgentUserMessage(
  draft: CreateStrategyDraft,
  strategicDocument: StrategicDecisionDocument,
  action: DraftBoardAction | null,
): string {
  const sectionPayload = Object.fromEntries(
    Object.entries(draft.sections).map(([sectionKey, sectionValue]) => [sectionKey, clampSectionContent(sectionValue ?? "")]),
  );

  return [
    "Strategic Decision Document input:",
    JSON.stringify(
      {
        metadata: strategicDocument.metadata,
        sections: sectionPayload,
        current_socratic_layer: strategicDocument.socratic_layer,
        mode: action ?? "observe",
      },
      null,
      2,
    ),
    "",
    "Analyze this draft and respond with strict JSON only using the required format.",
  ].join("\n");
}

export function deriveQuantifiableClaimResearchQueries(draft: CreateStrategyDraft): string[] {
  const queries: string[] = [];

  for (const section of STRATEGIC_ARTIFACT_SECTIONS) {
    const content = (draft.sections[section.key] ?? "").trim();
    if (content.length === 0) {
      continue;
    }
    const hasNumericClaim = /\b\d[\d.,]*(%|x|k|m|b)?\b|\$\s*\d/i.test(content);
    const hasMarketSignal = /\b(market|demand|growth|users?|customers?|revenue|churn|adoption|penetration|share|retention)\b/i.test(content);
    if (!hasNumericClaim || !hasMarketSignal) {
      continue;
    }

    const snippet = content.replace(/\s+/g, " ").slice(0, 120);
    queries.push(`Industry benchmark for ${section.title.toLowerCase()} claim: ${snippet}`);
  }

  return uniqueStrings(queries).slice(0, 4);
}

export function parseSocraticAgentOutput(content: string): SocraticAgentOutput | null {
  const parsed = safeJsonParse(content);
  if (!parsed) {
    return null;
  }

  const normalized = llmSocraticSchema.safeParse(parsed);
  if (!normalized.success) {
    return null;
  }

  const logicGaps = normalizeLogicGaps(normalized.data.logic_gaps);
  const riskPills = normalizeRiskPills(normalized.data.socratic_layer.risk_pills, logicGaps);
  return {
    socratic_layer: {
      active_inquiry: normalized.data.socratic_layer.active_inquiry,
      suggested_research: uniqueStrings(normalized.data.socratic_layer.suggested_research).slice(0, 8),
      red_team_critique: normalized.data.socratic_layer.red_team_critique,
      logic_gaps: logicGaps,
      risk_pills: riskPills,
    },
  };
}

export function applySocraticAgentOutput(
  strategicDocument: StrategicDecisionDocument,
  draft: CreateStrategyDraft,
  output: SocraticAgentOutput,
): StrategicDecisionDocument {
  const quantifiableQueries = deriveQuantifiableClaimResearchQueries(draft);
  const mergedResearch = uniqueStrings([...output.socratic_layer.suggested_research, ...quantifiableQueries]).slice(0, 8);
  const logicGaps = output.socratic_layer.logic_gaps ?? [];
  const sectionGapTexts = logicGaps.map((entry) =>
    entry.section_key === "problemFraming" ? entry.gap : `${entry.section_title}: ${entry.gap}`,
  );
  const mergedProblemLogicGaps = uniqueStrings([
    ...strategicDocument.sections.problem_statement.logic_gaps,
    ...sectionGapTexts,
  ]).slice(0, 10);

  return {
    ...strategicDocument,
    sections: {
      ...strategicDocument.sections,
      problem_statement: {
        ...strategicDocument.sections.problem_statement,
        logic_gaps: mergedProblemLogicGaps,
      },
    },
    socratic_layer: {
      ...strategicDocument.socratic_layer,
      active_inquiry: output.socratic_layer.active_inquiry,
      suggested_research: mergedResearch,
      red_team_critique: output.socratic_layer.red_team_critique,
      logic_gaps: logicGaps,
      risk_pills: output.socratic_layer.risk_pills,
    },
  };
}
