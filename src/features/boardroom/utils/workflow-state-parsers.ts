import type {
  ReportDecisionAncestryMatch,
  ReportDecisionAncestryOutcome,
  ReportDecisionSnapshot,
  ReportHygieneFinding,
  ReportInteractionDelta,
  ReportInteractionRound,
  ReportPrd,
  ReportReview,
  ReportReviewCitation,
  ReportReviewRisk,
  ReportSynthesis,
  ReportWorkflowState,
} from "../types";
import { asBoolean, asBooleanMap, asNumber, asRecord, asString, asStringArray, asStringArrayMap } from "./parsing";

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

export function parseSnapshotTextProperty(value: unknown): string {
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

export function parseSnapshotNumberProperty(value: unknown): number | null {
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

export function parseSnapshotSelectName(value: unknown): string {
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

  const citations = Array.isArray(record.citations)
    ? record.citations
      .map((entry) => {
        const citationRecord = asRecord(entry);
        if (!citationRecord) {
          return null;
        }

        const url = asString(citationRecord.url);
        if (url.trim().length === 0) {
          return null;
        }

        return {
          url,
          title: asString(citationRecord.title),
          claim: asString(citationRecord.claim),
        } satisfies ReportReviewCitation;
      })
      .filter((citation): citation is ReportReviewCitation => citation !== null)
    : [];

  return {
    agent: asString(record.agent, "Agent"),
    thesis: asString(record.thesis),
    score: asNumber(record.score, 0),
    confidence: asNumber(record.confidence, 0),
    blocked: asBoolean(record.blocked, false),
    blockers: asStringArray(record.blockers),
    risks,
    citations,
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
    consensus_points: asStringArray(record.consensus_points),
    point_of_contention: asString(record.point_of_contention),
    residual_risks: asStringArray(record.residual_risks),
    evidence_citations: asStringArray(record.evidence_citations),
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

function parseAncestryOutcome(value: unknown): ReportDecisionAncestryOutcome {
  const record = asRecord(value);
  const recommendation = asString(record?.final_recommendation);
  const finalRecommendation: "Approved" | "Challenged" | "Blocked" | null =
    recommendation === "Approved" || recommendation === "Challenged" || recommendation === "Blocked"
      ? recommendation
      : null;

  return {
    gate_decision: record ? asString(record.gate_decision) || null : null,
    final_recommendation: finalRecommendation,
    dqs: record ? (Number.isFinite(asNumber(record.dqs, Number.NaN)) ? asNumber(record.dqs, 0) : null) : null,
    run_at: record ? asString(record.run_at) : "",
  };
}

function parseDecisionAncestry(value: unknown): ReportDecisionAncestryMatch[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => {
      const record = asRecord(entry);
      if (!record) {
        return null;
      }

      const decisionId = asString(record.decision_id);
      if (decisionId.trim().length === 0) {
        return null;
      }

      return {
        decision_id: decisionId,
        decision_name: asString(record.decision_name, decisionId),
        similarity: asNumber(record.similarity, 0),
        outcome: parseAncestryOutcome(record.outcome),
        lessons: asStringArray(record.lessons),
        summary: asString(record.summary),
      } satisfies ReportDecisionAncestryMatch;
    })
    .filter((entry): entry is ReportDecisionAncestryMatch => entry !== null);
}

function normalizeHygieneStatus(value: unknown): "pass" | "warning" | "fail" {
  const status = asString(value).trim().toLowerCase();
  if (status === "pass" || status === "warning" || status === "fail") {
    return status;
  }
  return "warning";
}

function parseHygieneFindings(value: unknown): ReportHygieneFinding[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => {
      const record = asRecord(entry);
      if (!record) {
        return null;
      }

      const check = asString(record.check);
      if (check.trim().length === 0) {
        return null;
      }

      return {
        check,
        status: normalizeHygieneStatus(record.status),
        detail: asString(record.detail),
        score_impact: asNumber(record.score_impact, 0),
      } satisfies ReportHygieneFinding;
    })
    .filter((entry): entry is ReportHygieneFinding => entry !== null);
}

export function parseWorkflowState(value: unknown): ReportWorkflowState | null {
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
    hygiene_score: asNumber(record.hygiene_score, 0),
    substance_score: asNumber(record.substance_score, 0),
    confidence_score: asNumber(record.confidence_score, 0),
    dissent_penalty: asNumber(record.dissent_penalty, 0),
    confidence_penalty: asNumber(record.confidence_penalty, 0),
    status: asString(record.status, "PROPOSED"),
    run_id: runId,
    run_created_at: runCreatedAt.length > 0 ? runCreatedAt : undefined,
    missing_sections: asStringArray(record.missing_sections),
    decision_ancestry_retrieval_method:
      asString(record.decision_ancestry_retrieval_method).trim() === "vector-db"
        ? "vector-db"
        : asString(record.decision_ancestry_retrieval_method).trim() === "lexical-fallback"
          ? "lexical-fallback"
          : undefined,
    interaction_rounds: parseInteractionRounds(record.interaction_rounds),
    decision_ancestry: parseDecisionAncestry(record.decision_ancestry),
    hygiene_findings: parseHygieneFindings(record.hygiene_findings),
    artifact_assistant_questions: asStringArray(record.artifact_assistant_questions),
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
