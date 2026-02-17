import type { AgentConfig, LLMProvider } from "../../config/agent_config";
import { normalizeAgentConfigs } from "../../config/agent_config";
import {
  CORE_AGENT_IDS,
  CURRENCY_FORMATTER,
  MATRIX_SECTIONS,
  OPTIONS_MATRIX_DEFAULT,
  REVIEW_ORDER,
  RISK_MATRIX_DEFAULT,
  STRATEGIC_ARTIFACT_SECTIONS,
} from "./constants";
import type {
  ChessPiece,
  CreateStrategyDraft,
  DecisionStrategy,
  DraftCapitalAllocation,
  DraftCoreProperties,
  DraftRiskProperties,
  MatrixSectionKey,
  NodePosition,
  ReportDecisionSnapshot,
  ReportInteractionDelta,
  ReportInteractionRound,
  ReportPrd,
  ReportReview,
  ReportReviewRisk,
  ReportSynthesis,
  ReportWorkflowState,
  SectionMatrix,
  SnapshotMetrics,
  StrategyStatus,
  WorkflowNode,
  WorkflowTask,
} from "./types";

export function cloneMatrix(matrix: SectionMatrix): SectionMatrix {
  return {
    headers: [...matrix.headers],
    rows: matrix.rows.map((row) => [...row]),
  };
}

export function serializeSectionMatrix(matrix: SectionMatrix): string {
  return JSON.stringify(matrix);
}

export function defaultMatrixForSection(sectionKey: MatrixSectionKey): SectionMatrix {
  return sectionKey === "optionsEvaluated" ? cloneMatrix(OPTIONS_MATRIX_DEFAULT) : cloneMatrix(RISK_MATRIX_DEFAULT);
}

export function parseSectionMatrix(value: string, fallback: SectionMatrix): SectionMatrix {
  try {
    const parsed = JSON.parse(value) as unknown;
    const record = asRecord(parsed);
    const headers = asStringArray(record?.headers).filter((entry) => entry.trim().length > 0);
    const rows = Array.isArray(record?.rows)
      ? record.rows
        .map((entry) => (Array.isArray(entry) ? entry.filter((cell): cell is string => typeof cell === "string") : []))
        .filter((row) => row.length > 0)
      : [];

    if (headers.length === 0 || rows.length === 0) {
      return cloneMatrix(fallback);
    }

    const normalizedRows = rows.map((row) => {
      const nextRow = [...row];
      while (nextRow.length < headers.length) {
        nextRow.push("");
      }
      return nextRow.slice(0, headers.length);
    });

    return {
      headers,
      rows: normalizedRows,
    };
  } catch {
    return cloneMatrix(fallback);
  }
}

export function isSerializedSectionMatrix(value: string): boolean {
  try {
    const parsed = JSON.parse(value) as unknown;
    const record = asRecord(parsed);
    if (!record) {
      return false;
    }

    const headers = record.headers;
    const rows = record.rows;
    return Array.isArray(headers) && Array.isArray(rows);
  } catch {
    return false;
  }
}

export function isMatrixSectionKey(sectionKey: string): sectionKey is MatrixSectionKey {
  return Boolean(MATRIX_SECTIONS[sectionKey as MatrixSectionKey]);
}

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
  };
}

export function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function asNumber(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function asBoolean(value: unknown, fallback = false): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];
}

function asBooleanMap(value: unknown): Record<string, boolean> {
  const record = asRecord(value);
  if (!record) {
    return {};
  }

  const normalized: Record<string, boolean> = {};
  for (const [key, entry] of Object.entries(record)) {
    normalized[key] = asBoolean(entry, false);
  }
  return normalized;
}

function asStringArrayMap(value: unknown): Record<string, string[]> {
  const record = asRecord(value);
  if (!record) {
    return {};
  }

  const normalized: Record<string, string[]> = {};
  for (const [key, entry] of Object.entries(record)) {
    normalized[key] = asStringArray(entry);
  }
  return normalized;
}

function firstPresentValue(values: Array<string | null | undefined>, fallback = ""): string {
  for (const value of values) {
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }
  return fallback;
}

function parseCurrencyAmount(raw: string): number {
  const parsed = Number(raw.replace(/[^0-9.-]+/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseSerializedValue(raw: string | undefined): unknown | null {
  if (typeof raw !== "string" || raw.trim().length === 0) {
    return null;
  }

  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
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
  };
}

export function firstLine(text: string): string {
  return text.split(/\n+/).map((line) => line.trim()).find((line) => line.length > 0) ?? "";
}

export function formatCurrency(amount: number | null): string {
  if (amount === null || Number.isNaN(amount)) {
    return "N/A";
  }
  return CURRENCY_FORMATTER.format(amount);
}

export function formatDqs(value: number): string {
  if (!Number.isFinite(value)) {
    return "0.00";
  }
  return value.toFixed(2);
}

export function formatRunTimestamp(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "";
  }

  return parsed.toLocaleString("en-US", {
    month: "short",
    day: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function parsePercentValue(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return null;
  }
  const numeric = Number(trimmed.replace("%", ""));
  if (!Number.isFinite(numeric)) {
    return null;
  }
  return numeric / 100;
}

function strategicLeverageNumericValue(value: string): number | null {
  const match = value.trim().match(/^([1-5])/);
  if (!match) {
    return null;
  }
  return Number(match[1]);
}

function reversibilityWeight(value: string): number | null {
  if (value === "Fully Reversible") {
    return 1;
  }
  if (value === "Partially Reversible") {
    return 0.75;
  }
  if (value === "Hard to Reverse") {
    return 0.5;
  }
  if (value === "Irreversible") {
    return 0.25;
  }
  return null;
}

export function deriveRiskAdjustedValue(draft: CreateStrategyDraft): number {
  const probability = parsePercentValue(draft.capitalAllocation.probabilityOfSuccess);
  if (probability === null) {
    return 0;
  }
  return Math.round(draft.capitalAllocation.grossBenefit12m * probability);
}

export function deriveRiskAdjustedRoi(draft: CreateStrategyDraft, riskAdjustedValue: number): number | null {
  if (draft.capitalAllocation.investmentRequired <= 0) {
    return null;
  }
  return (riskAdjustedValue - draft.capitalAllocation.investmentRequired) / draft.capitalAllocation.investmentRequired;
}

export function deriveWeightedCapitalScore(draft: CreateStrategyDraft, riskAdjustedRoi: number | null): number | null {
  const leverage = strategicLeverageNumericValue(draft.capitalAllocation.strategicLeverageScore);
  const reversibility = reversibilityWeight(draft.capitalAllocation.reversibilityFactor);
  if (leverage === null || reversibility === null || riskAdjustedRoi === null) {
    return null;
  }
  const normalizedRoi = Math.max(0, riskAdjustedRoi + 1);
  return Number((leverage * normalizedRoi * reversibility).toFixed(2));
}

export function deriveRiskScore(draft: CreateStrategyDraft): string {
  const ranking: Record<string, number> = {
    None: 0,
    Low: 1,
    Medium: 2,
    High: 3,
    Critical: 4,
  };

  const levels = [
    draft.riskProperties.regulatoryRisk,
    draft.riskProperties.technicalRisk,
    draft.riskProperties.operationalRisk,
    draft.riskProperties.reputationalRisk,
  ];
  let topLevel = "";
  let topValue = -1;
  for (const level of levels) {
    const value = ranking[level] ?? -1;
    if (value > topValue) {
      topValue = value;
      topLevel = level;
    }
  }
  return topLevel;
}

export function clampTokenInput(value: number): number {
  if (!Number.isFinite(value)) {
    return 1200;
  }
  return Math.max(256, Math.min(8000, Math.round(value)));
}

export function serializeAgentConfigs(configs: AgentConfig[]): string {
  return JSON.stringify(normalizeAgentConfigs(configs));
}

export function recommendationForState(state: ReportWorkflowState): "Approved" | "Challenged" | "Blocked" {
  if (state.synthesis?.final_recommendation) {
    return state.synthesis.final_recommendation;
  }

  const blocked = Object.values(state.reviews).some((review) => review.blocked);
  if (blocked) {
    return "Blocked";
  }

  if (state.status === "DECIDED" || state.status === "PERSISTED") {
    return "Approved";
  }

  return "Challenged";
}

export function recommendationTone(recommendation: "Approved" | "Challenged" | "Blocked"): "approved" | "challenged" | "blocked" {
  if (recommendation === "Blocked") {
    return "blocked";
  }
  if (recommendation === "Approved") {
    return "approved";
  }
  return "challenged";
}

function parseSnapshotTextSegments(value: unknown): string {
  if (typeof value === "string") {
    return value.trim();
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }

  if (!Array.isArray(value)) {
    return "";
  }

  return value
    .map((entry) => {
      const record = asRecord(entry);
      if (!record) {
        return "";
      }
      return asString(record.plain_text);
    })
    .join("")
    .trim();
}

function parseSnapshotTextProperty(value: unknown): string {
  if (typeof value === "string") {
    return value.trim();
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }

  const record = asRecord(value);
  if (!record) {
    return "";
  }

  return (
    parseSnapshotTextSegments(record.rich_text) ||
    parseSnapshotTextSegments(record.title) ||
    parseSnapshotTextSegments(record.multi_select) ||
    parseSnapshotTextSegments(record.people) ||
    asString(record.name)
  );
}

function parseSnapshotNumberProperty(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  const record = asRecord(value);
  if (!record) {
    return null;
  }

  if (typeof record.number === "number" && Number.isFinite(record.number)) {
    return record.number;
  }

  const formula = asRecord(record.formula);
  if (formula && typeof formula.number === "number" && Number.isFinite(formula.number)) {
    return formula.number;
  }

  return null;
}

function parseSnapshotSelectName(value: unknown): string {
  if (typeof value === "string") {
    return value.trim();
  }

  const record = asRecord(value);
  if (!record) {
    return "";
  }

  const select = asRecord(record.select);
  if (select) {
    return asString(select.name);
  }

  const status = asRecord(record.status);
  if (status) {
    return asString(status.name);
  }

  return "";
}

function parseReview(value: unknown): ReportReview | null {
  const record = asRecord(value);
  if (!record) {
    return null;
  }

  const risks = Array.isArray(record.risks)
    ? record.risks
      .map((risk) => {
        const riskRecord = asRecord(risk);
        if (!riskRecord) {
          return null;
        }
        return {
          type: asString(riskRecord.type, "Risk"),
          severity: asNumber(riskRecord.severity, 0),
          evidence: asString(riskRecord.evidence),
        } satisfies ReportReviewRisk;
      })
      .filter((risk): risk is ReportReviewRisk => risk !== null)
    : [];

  return {
    agent: asString(record.agent, "Agent"),
    thesis: asString(record.thesis),
    score: asNumber(record.score, 0),
    confidence: asNumber(record.confidence, 0),
    blocked: asBoolean(record.blocked, false),
    blockers: asStringArray(record.blockers),
    risks,
    required_changes: asStringArray(record.required_changes),
    approval_conditions: asStringArray(record.approval_conditions),
    governance_checks_met: asBooleanMap(record.governance_checks_met),
  };
}

function parseSynthesis(value: unknown): ReportSynthesis | null {
  const record = asRecord(value);
  if (!record) {
    return null;
  }

  const recommendation = asString(record.final_recommendation, "Challenged");
  const finalRecommendation: "Approved" | "Challenged" | "Blocked" =
    recommendation === "Approved" || recommendation === "Blocked" || recommendation === "Challenged"
      ? recommendation
      : "Challenged";

  return {
    executive_summary: asString(record.executive_summary),
    final_recommendation: finalRecommendation,
    conflicts: asStringArray(record.conflicts),
    blockers: asStringArray(record.blockers),
    required_revisions: asStringArray(record.required_revisions),
  };
}

function parsePrd(value: unknown): ReportPrd | null {
  const record = asRecord(value);
  if (!record) {
    return null;
  }

  return {
    title: asString(record.title, "PRD"),
    scope: asStringArray(record.scope),
    milestones: asStringArray(record.milestones),
    telemetry: asStringArray(record.telemetry),
    risks: asStringArray(record.risks),
    sections: asStringArrayMap(record.sections),
  };
}

function parseDecisionSnapshot(value: unknown): ReportDecisionSnapshot | null {
  const record = asRecord(value);
  if (!record) {
    return null;
  }

  const properties = asRecord(record.properties) ?? {};
  const sectionExcerpt = Array.isArray(record.section_excerpt) ? record.section_excerpt : [];
  const excerpt = sectionExcerpt
    .map((entry) => {
      const entryRecord = asRecord(entry);
      const textRecord = asRecord(entryRecord?.text);
      return asString(textRecord?.content);
    })
    .join("\n")
    .trim();

  const computed = asRecord(record.computed);
  return {
    properties,
    excerpt,
    governance_checks: asBooleanMap(computed?.inferred_governance_checks),
    autochecked_fields: asStringArray(computed?.autochecked_governance_fields),
  };
}

function parseInteractionDelta(value: unknown): ReportInteractionDelta | null {
  const record = asRecord(value);
  if (!record) {
    return null;
  }

  return {
    agent_id: asString(record.agent_id, ""),
    agent_name: asString(record.agent_name, ""),
    previous_score: Math.round(asNumber(record.previous_score, 0)),
    revised_score: Math.round(asNumber(record.revised_score, 0)),
    score_delta: Math.round(asNumber(record.score_delta, 0)),
    previous_blocked: asBoolean(record.previous_blocked, false),
    revised_blocked: asBoolean(record.revised_blocked, false),
  };
}

function parseInteractionRounds(value: unknown): ReportInteractionRound[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => {
      const record = asRecord(entry);
      if (!record) {
        return null;
      }

      const deltasRaw = Array.isArray(record.deltas) ? record.deltas : [];
      const deltas = deltasRaw
        .map((delta) => parseInteractionDelta(delta))
        .filter((delta): delta is ReportInteractionDelta => delta !== null);

      return {
        round: Math.max(1, Math.round(asNumber(record.round, 1))),
        summary: asString(record.summary, "Cross-agent rebuttal round executed."),
        deltas,
      };
    })
    .filter((entry): entry is ReportInteractionRound => entry !== null);
}

function parseWorkflowState(value: unknown): ReportWorkflowState | null {
  const record = asRecord(value);
  if (!record) {
    return null;
  }

  const runIdRaw = record.run_id;
  const runId =
    typeof runIdRaw === "number" && Number.isFinite(runIdRaw)
      ? Math.max(1, Math.round(runIdRaw))
      : typeof runIdRaw === "string" && runIdRaw.trim().length > 0 && Number.isFinite(Number(runIdRaw))
        ? Math.max(1, Math.round(Number(runIdRaw)))
        : undefined;
  const runCreatedAt = asString(record.run_created_at);

  const parsedReviews: Record<string, ReportReview> = {};
  const reviewsRecord = asRecord(record.reviews) ?? {};
  for (const [reviewKey, reviewValue] of Object.entries(reviewsRecord)) {
    const review = parseReview(reviewValue);
    if (review) {
      parsedReviews[reviewKey] = review;
    }
  }

  return {
    decision_id: asString(record.decision_id),
    decision_name: asString(record.decision_name, "Untitled Decision"),
    dqs: asNumber(record.dqs, 0),
    status: asString(record.status, "PROPOSED"),
    run_id: runId,
    run_created_at: runCreatedAt.length > 0 ? runCreatedAt : undefined,
    missing_sections: asStringArray(record.missing_sections),
    interaction_rounds: parseInteractionRounds(record.interaction_rounds),
    reviews: parsedReviews,
    synthesis: parseSynthesis(record.synthesis),
    prd: parsePrd(record.prd),
    decision_snapshot: parseDecisionSnapshot(record.decision_snapshot),
    raw: value,
  };
}

export function normalizeWorkflowStates(result: { mode: "single" | "all_proposed"; result?: unknown; results?: unknown[] } | null): ReportWorkflowState[] {
  if (!result) {
    return [];
  }

  if (result.mode === "single") {
    const state = parseWorkflowState(result.result);
    return state ? [state] : [];
  }

  if (Array.isArray(result.results)) {
    return result.results
      .map((entry) => parseWorkflowState(entry))
      .filter((entry): entry is ReportWorkflowState => entry !== null);
  }

  return [];
}

export function extractSnapshotMetrics(state: ReportWorkflowState): SnapshotMetrics {
  const properties = state.decision_snapshot?.properties ?? {};

  return {
    primaryKpi: parseSnapshotTextProperty(properties["Primary KPI"]) || "Not specified",
    investment: parseSnapshotNumberProperty(properties["Investment Required"]),
    benefit12m: parseSnapshotNumberProperty(properties["12-Month Gross Benefit"]),
    roi: parseSnapshotNumberProperty(properties["Risk-Adjusted ROI"]),
    probability: parseSnapshotSelectName(properties["Probability of Success"]) || "N/A",
    timeHorizon: parseSnapshotSelectName(properties["Time Horizon"]) || "N/A",
    strategicObjective: parseSnapshotSelectName(properties["Strategic Objective"]) || "N/A",
    leverageScore: parseSnapshotSelectName(properties["Strategic Leverage Score"]) || "N/A",
  };
}

export function extractGovernanceRows(state: ReportWorkflowState): Array<{ label: string; met: boolean }> {
  const checks = state.decision_snapshot?.governance_checks ?? {};

  if (Object.keys(checks).length > 0) {
    return Object.entries(checks).map(([label, met]) => ({ label, met }));
  }

  const fallbackReview = Object.values(state.reviews)[0];
  if (!fallbackReview) {
    return [];
  }

  return Object.entries(fallbackReview.governance_checks_met).map(([label, met]) => ({ label, met }));
}

export function sortReviews(state: ReportWorkflowState): ReportReview[] {
  return Object.values(state.reviews).sort((a, b) => {
    const indexA = REVIEW_ORDER.findIndex((name) => name.toLowerCase() === a.agent.toLowerCase());
    const indexB = REVIEW_ORDER.findIndex((name) => name.toLowerCase() === b.agent.toLowerCase());
    const normalizedA = indexA === -1 ? 999 : indexA;
    const normalizedB = indexB === -1 ? 999 : indexB;
    return normalizedA - normalizedB;
  });
}

export function buildReviewTasks(reviewRoles: string[]): WorkflowTask[] {
  const counts = new Map<string, number>();

  return reviewRoles.map((rawRole, index) => {
    const title = rawRole.trim().length > 0 ? rawRole.trim() : `Agent ${index + 1}`;
    const baseId =
      title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)/g, "") || `agent-${index + 1}`;
    const currentCount = (counts.get(baseId) ?? 0) + 1;
    counts.set(baseId, currentCount);
    const id = currentCount > 1 ? `${baseId}-${currentCount}` : baseId;

    return {
      id,
      title,
      status: "IDLE",
    };
  });
}

export function buildInteractionTasks(interactionRounds: number): WorkflowTask[] {
  const normalized = Math.max(0, Math.min(3, Math.round(interactionRounds)));
  const tasks: WorkflowTask[] = [];

  for (let round = 1; round <= normalized; round += 1) {
    tasks.push({
      id: `interaction-round-${round}`,
      title: `Round ${round}`,
      status: "IDLE",
    });
  }

  return tasks;
}

export function buildInitialNodes(
  strategyName?: string | null,
  reviewRoles: string[] = REVIEW_ORDER,
  interactionRounds = 1,
): WorkflowNode[] {
  const inputSubtitle = strategyName ? strategyName : "No Strategy Selected";
  const interactionTasks = buildInteractionTasks(interactionRounds);
  const interactionSubtitle =
    interactionTasks.length > 0
      ? `${interactionTasks.length} rebuttal round${interactionTasks.length === 1 ? "" : "s"}`
      : "Rebuttal disabled";

  return [
    {
      id: "1",
      type: "INPUT",
      title: "Strategy Context",
      subtitle: inputSubtitle,
      position: { x: 40, y: 96 },
      status: "IDLE",
    },
    {
      id: "2",
      type: "STRATEGY",
      title: "Drafting Doc",
      subtitle: "Strategic memo",
      position: { x: 300, y: 96 },
      status: "IDLE",
    },
    {
      id: "3",
      type: "REVIEW",
      title: "Executive Review",
      subtitle: "CEO, CFO, CTO, Compliance",
      position: { x: 560, y: 96 },
      status: "IDLE",
      tasks: buildReviewTasks(reviewRoles),
    },
    {
      id: "4",
      type: "INTERACTION",
      title: "Cross-Agent Rebuttal",
      subtitle: interactionSubtitle,
      position: { x: 820, y: 96 },
      status: "IDLE",
      tasks: interactionTasks,
    },
    {
      id: "5",
      type: "SYNTHESIS",
      title: "Feedback Synthesis",
      subtitle: "Quality scoring",
      position: { x: 1080, y: 96 },
      status: "IDLE",
    },
    {
      id: "6",
      type: "PRD",
      title: "Generate PRD",
      subtitle: "Execution document",
      position: { x: 1340, y: 96 },
      status: "IDLE",
    },
    {
      id: "7",
      type: "PERSIST",
      title: "DB Persist",
      subtitle: "Persist artifacts",
      position: { x: 1600, y: 96 },
      status: "IDLE",
    },
  ];
}

export function strategyStatusTone(status: StrategyStatus): "proposed" | "review" | "approved" | "blocked" {
  if (status === "Approved") {
    return "approved";
  }
  if (status === "Blocked") {
    return "blocked";
  }
  if (status === "In Review") {
    return "review";
  }
  return "proposed";
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function resolveAgentChessPiece(agentId: string, role: string): ChessPiece {
  const normalizedId = agentId.trim().toLowerCase();
  if (normalizedId === "ceo") {
    return "king";
  }
  if (normalizedId === "cfo") {
    return "bishop";
  }
  if (normalizedId === "cto") {
    return "knight";
  }
  if (normalizedId === "compliance") {
    return "rook";
  }
  if (normalizedId.length > 0 && !CORE_AGENT_IDS.has(normalizedId)) {
    return "pawn";
  }

  const normalizedRole = role.trim().toLowerCase();
  if (normalizedRole.includes("ceo") || normalizedRole.includes("chief executive")) {
    return "king";
  }
  if (normalizedRole.includes("cfo") || normalizedRole.includes("chief financial")) {
    return "bishop";
  }
  if (normalizedRole.includes("cto") || normalizedRole.includes("chief technology")) {
    return "knight";
  }
  if (normalizedRole.includes("compliance")) {
    return "rook";
  }

  return "pawn";
}

export function agentModelMeta(provider: LLMProvider, model: string): string {
  return `${String(provider).toUpperCase()} • ${model.toUpperCase()}`;
}

export function edgePathData(start: NodePosition, end: NodePosition): string {
  const x1 = start.x + 220;
  const y1 = start.y + 40;
  const x2 = end.x;
  const y2 = end.y + 40;
  return `M ${x1} ${y1} L ${x2} ${y2}`;
}
