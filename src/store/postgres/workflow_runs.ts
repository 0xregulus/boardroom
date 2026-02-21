import type { QueryResultRow } from "pg";

import type { PRDOutput } from "../../schemas/prd_output";
import type { ReviewOutput } from "../../schemas/review_output";
import type { ChairpersonSynthesis } from "../../workflow/states";
import { query } from "./client";
import {
  toBooleanMap,
  toCitationsArray,
  toIsoTimestamp,
  toNumber,
  toStringArray,
} from "./serializers";
import type { WorkflowRunRecord } from "./types";
import type { WorkflowRunReviewStanceSummary } from "./types";

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function asArray(value: unknown): unknown[] {
  if (Array.isArray(value)) {
    return value;
  }
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value) as unknown;
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

function asFiniteNumber(value: unknown, fallback = 0): number {
  const parsed = toNumber(value);
  if (parsed === null || !Number.isFinite(parsed)) {
    return fallback;
  }
  return parsed;
}

function normalizeReviewStance(review: Record<string, unknown>): WorkflowRunReviewStanceSummary["stance"] {
  const blocked = Boolean(review.blocked);
  if (blocked) {
    return "blocked";
  }

  const confidence = asFiniteNumber(review.confidence, 0);
  const score = asFiniteNumber(review.score, 0);
  if (confidence < 0.65 || score < 6) {
    return "caution";
  }
  return "approved";
}

function toReviewStances(reviewsValue: unknown): WorkflowRunReviewStanceSummary[] {
  const reviews = asRecord(reviewsValue) ?? {};
  const rows: WorkflowRunReviewStanceSummary[] = [];

  for (const [reviewKey, reviewValue] of Object.entries(reviews)) {
    const review = asRecord(reviewValue);
    if (!review) {
      continue;
    }

    const agentLabel =
      (typeof review.agent === "string" && review.agent.trim().length > 0
        ? review.agent.trim()
        : reviewKey.trim().length > 0
          ? reviewKey
          : "Agent");
    const score = Math.max(0, Math.min(10, asFiniteNumber(review.score, 0)));
    const confidence = Math.max(0, Math.min(1, asFiniteNumber(review.confidence, 0)));

    rows.push({
      agent: agentLabel,
      stance: normalizeReviewStance(review),
      score,
      confidence,
    });
  }

  return rows.slice(0, 12);
}

function toRiskFindingsCount(reviewsValue: unknown): number {
  const reviews = asRecord(reviewsValue) ?? {};
  let total = 0;
  for (const reviewValue of Object.values(reviews)) {
    const review = asRecord(reviewValue);
    if (!review) {
      continue;
    }
    total += asArray(review.risks).length;
  }
  return Math.max(0, total);
}

function toMitigationCount(stateValue: unknown): number {
  const state = asRecord(stateValue);
  const decisionSnapshot = asRecord(state?.decision_snapshot);
  const properties = asRecord(decisionSnapshot?.properties);
  const mitigationsRaw = properties?.Mitigations ?? properties?.mitigations;
  return asArray(mitigationsRaw).length;
}

function toResidualRiskCount(stateValue: unknown): number {
  const state = asRecord(stateValue);
  const synthesis = asRecord(state?.synthesis);
  const residualRisks = synthesis?.residual_risks;
  return asArray(residualRisks).length;
}

export async function upsertDecisionReview(decisionId: string, agentName: string, review: ReviewOutput): Promise<void> {
  await query(
    `
      INSERT INTO decision_reviews (
        decision_id,
        agent_name,
        thesis,
        score,
        confidence,
        blocked,
        blockers,
        risks,
        citations,
        required_changes,
        approval_conditions,
        apga_impact_view,
        governance_checks_met,
        created_at,
        updated_at
      )
      VALUES (
        $1,
        $2,
        $3,
        $4,
        $5,
        $6,
        $7::jsonb,
        $8::jsonb,
        $9::jsonb,
        $10::jsonb,
        $11::jsonb,
        $12,
        $13::jsonb,
        NOW(),
        NOW()
      )
      ON CONFLICT (decision_id, agent_name)
      DO UPDATE SET
        thesis = EXCLUDED.thesis,
        score = EXCLUDED.score,
        confidence = EXCLUDED.confidence,
        blocked = EXCLUDED.blocked,
        blockers = EXCLUDED.blockers,
        risks = EXCLUDED.risks,
        citations = EXCLUDED.citations,
        required_changes = EXCLUDED.required_changes,
        approval_conditions = EXCLUDED.approval_conditions,
        apga_impact_view = EXCLUDED.apga_impact_view,
        governance_checks_met = EXCLUDED.governance_checks_met,
        updated_at = NOW()
    `,
    [
      decisionId,
      agentName,
      review.thesis,
      review.score,
      review.confidence,
      review.blocked,
      JSON.stringify(review.blockers),
      JSON.stringify(review.risks),
      JSON.stringify(review.citations),
      JSON.stringify(review.required_changes),
      JSON.stringify(review.approval_conditions),
      review.apga_impact_view,
      JSON.stringify(review.governance_checks_met),
    ],
  );
}

export async function upsertDecisionSynthesis(decisionId: string, synthesis: ChairpersonSynthesis): Promise<void> {
  await query(
    `
      INSERT INTO decision_synthesis (
        decision_id,
        executive_summary,
        final_recommendation,
        conflicts,
        blockers,
        required_revisions,
        created_at,
        updated_at
      )
      VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6::jsonb, NOW(), NOW())
      ON CONFLICT (decision_id)
      DO UPDATE SET
        executive_summary = EXCLUDED.executive_summary,
        final_recommendation = EXCLUDED.final_recommendation,
        conflicts = EXCLUDED.conflicts,
        blockers = EXCLUDED.blockers,
        required_revisions = EXCLUDED.required_revisions,
        updated_at = NOW()
    `,
    [
      decisionId,
      synthesis.executive_summary,
      synthesis.final_recommendation,
      JSON.stringify(synthesis.conflicts),
      JSON.stringify(synthesis.blockers),
      JSON.stringify(synthesis.required_revisions),
    ],
  );
}

export async function upsertDecisionPrd(decisionId: string, prd: PRDOutput): Promise<void> {
  await query(
    `
      INSERT INTO decision_prds (
        decision_id,
        title,
        status,
        scope,
        milestones,
        telemetry,
        risks,
        sections,
        created_at,
        updated_at
      )
      VALUES ($1, $2, 'Draft', $3::jsonb, $4::jsonb, $5::jsonb, $6::jsonb, $7::jsonb, NOW(), NOW())
      ON CONFLICT (decision_id)
      DO UPDATE SET
        title = EXCLUDED.title,
        scope = EXCLUDED.scope,
        milestones = EXCLUDED.milestones,
        telemetry = EXCLUDED.telemetry,
        risks = EXCLUDED.risks,
        sections = EXCLUDED.sections,
        status = 'Draft',
        updated_at = NOW()
    `,
    [
      decisionId,
      prd.title,
      JSON.stringify(prd.scope),
      JSON.stringify(prd.milestones),
      JSON.stringify(prd.telemetry),
      JSON.stringify(prd.risks),
      JSON.stringify(prd.sections),
    ],
  );
}

export async function recordWorkflowRun(
  decisionId: string,
  dqs: number,
  gateDecision: string,
  workflowStatus: string,
  state: Record<string, unknown>,
): Promise<void> {
  await query(
    `
      INSERT INTO workflow_runs (
        decision_id,
        dqs,
        gate_decision,
        workflow_status,
        state_json,
        created_at
      )
      VALUES ($1, $2, $3, $4, $5::jsonb, NOW())
    `,
    [decisionId, dqs, gateDecision, workflowStatus, JSON.stringify(state)],
  );
}

interface WorkflowRunRow extends QueryResultRow {
  id: string | number;
  decision_id: string;
  dqs: string | number;
  gate_decision: string;
  workflow_status: string;
  decision_name: string | null;
  state_status: string | null;
  summary_line: string | null;
  missing_sections: unknown;
  state_json: unknown;
  created_at: Date | string;
}

export async function listWorkflowRuns(decisionId: string, limit = 20): Promise<WorkflowRunRecord[]> {
  const normalizedDecisionId = typeof decisionId === "string" ? decisionId.trim() : "";
  if (normalizedDecisionId.length === 0) {
    throw new Error("decisionId is required");
  }

  const normalizedLimit = Math.max(1, Math.min(100, Number.isFinite(limit) ? Math.round(limit) : 20));

  const result = await query<WorkflowRunRow>(
    `
      SELECT
        id,
        decision_id,
        dqs,
        gate_decision,
        workflow_status,
        state_json->>'decision_name' AS decision_name,
        state_json->>'status' AS state_status,
        COALESCE(
          NULLIF(state_json->'synthesis'->>'executive_summary', ''),
          NULLIF(state_json->>'summary', ''),
          NULLIF(state_json->>'executive_summary', '')
        ) AS summary_line,
        state_json->'missing_sections' AS missing_sections,
        state_json,
        created_at
      FROM workflow_runs
      WHERE decision_id = $1
      ORDER BY created_at DESC
      LIMIT $2
    `,
    [normalizedDecisionId, normalizedLimit],
  );

  return result.rows.map((row) => ({
    ...(() => {
      const reviewStances = toReviewStances(asRecord(row.state_json)?.reviews);
      const riskFindingsCount = toRiskFindingsCount(asRecord(row.state_json)?.reviews);
      const mitigationCount = toMitigationCount(row.state_json);
      const residualRiskCount = toResidualRiskCount(row.state_json);
      const pendingMitigationsCount = Math.max(0, Math.max(residualRiskCount, riskFindingsCount - mitigationCount));
      const blockedCount = reviewStances.filter((entry) => entry.stance === "blocked").length;
      const cautionCount = reviewStances.filter((entry) => entry.stance === "caution").length;
      const frictionScore = blockedCount * 1.4 + cautionCount * 0.6 + pendingMitigationsCount * 0.4;

      return {
        reviewStances,
        riskFindingsCount,
        mitigationCount,
        pendingMitigationsCount,
        frictionScore,
      };
    })(),
    id: Math.max(1, Math.round(toNumber(row.id) ?? 0)),
    decisionId: row.decision_id,
    dqs: toNumber(row.dqs) ?? 0,
    gateDecision: row.gate_decision,
    workflowStatus: row.workflow_status,
    decisionName: typeof row.decision_name === "string" ? row.decision_name : null,
    stateStatus: typeof row.state_status === "string" ? row.state_status : null,
    summaryLine: typeof row.summary_line === "string" ? row.summary_line : null,
    missingSections: toStringArray(row.missing_sections),
    createdAt: toIsoTimestamp(row.created_at),
  }));
}

interface DecisionReviewRow extends QueryResultRow {
  agent_name: string;
  agent_role: string;
  thesis: string;
  score: string | number;
  confidence: string | number;
  blocked: boolean;
  blockers: unknown;
  risks: unknown;
  citations: unknown;
  required_changes: unknown;
  approval_conditions: unknown;
  apga_impact_view: string;
  governance_checks_met: unknown;
}

interface DecisionSynthesisRow extends QueryResultRow {
  executive_summary: string;
  final_recommendation: "Approved" | "Challenged" | "Blocked";
  conflicts: unknown;
  blockers: unknown;
  required_revisions: unknown;
}

interface DecisionPrdRow extends QueryResultRow {
  title: string;
  scope: unknown;
  milestones: unknown;
  telemetry: unknown;
  risks: unknown;
  sections: unknown;
}

export async function loadPersistedDecisionOutputs(decisionId: string): Promise<{
  reviews: Record<string, ReviewOutput>;
  synthesis: ChairpersonSynthesis | null;
  prd: PRDOutput | null;
}> {
  const [reviewResult, synthesisResult, prdResult] = await Promise.all([
    query<DecisionReviewRow>(
      `
        SELECT
          dr.agent_name,
          COALESCE(ac.role, dr.agent_name) AS agent_role,
          dr.thesis,
          dr.score,
          dr.confidence,
          dr.blocked,
          dr.blockers,
          dr.risks,
          dr.citations,
          dr.required_changes,
          dr.approval_conditions,
          dr.apga_impact_view,
          dr.governance_checks_met
        FROM decision_reviews dr
        LEFT JOIN agent_configs ac ON ac.agent_id = dr.agent_name
        WHERE dr.decision_id = $1
      `,
      [decisionId],
    ),
    query<DecisionSynthesisRow>(
      `
        SELECT
          executive_summary,
          final_recommendation,
          conflicts,
          blockers,
          required_revisions
        FROM decision_synthesis
        WHERE decision_id = $1
        LIMIT 1
      `,
      [decisionId],
    ),
    query<DecisionPrdRow>(
      `
        SELECT
          title,
          scope,
          milestones,
          telemetry,
          risks,
          sections
        FROM decision_prds
        WHERE decision_id = $1
        LIMIT 1
      `,
      [decisionId],
    ),
  ]);

  const reviews: Record<string, ReviewOutput> = {};
  for (const row of reviewResult.rows) {
    reviews[row.agent_name.toLowerCase()] = {
      agent: row.agent_role,
      thesis: row.thesis,
      score: Math.max(1, Math.min(10, Math.round(toNumber(row.score) ?? 1))),
      confidence: Math.max(0, Math.min(1, toNumber(row.confidence) ?? 0)),
      blocked: Boolean(row.blocked),
      blockers: toStringArray(row.blockers),
      risks: Array.isArray(row.risks) ? (row.risks as ReviewOutput["risks"]) : [],
      citations: toCitationsArray(row.citations),
      required_changes: toStringArray(row.required_changes),
      approval_conditions: toStringArray(row.approval_conditions),
      apga_impact_view: row.apga_impact_view ?? "",
      governance_checks_met: toBooleanMap(row.governance_checks_met),
    };
  }

  const synthesisRow = synthesisResult.rows[0];
  const synthesis = synthesisRow
    ? {
      executive_summary: synthesisRow.executive_summary,
      final_recommendation: synthesisRow.final_recommendation,
      consensus_points: [],
      point_of_contention: "",
      residual_risks: [],
      evidence_citations: [],
      conflicts: toStringArray(synthesisRow.conflicts),
      blockers: toStringArray(synthesisRow.blockers),
      required_revisions: toStringArray(synthesisRow.required_revisions),
    }
    : null;

  const prdRow = prdResult.rows[0];
  const prd = prdRow
    ? {
      title: prdRow.title,
      scope: toStringArray(prdRow.scope),
      milestones: toStringArray(prdRow.milestones),
      telemetry: toStringArray(prdRow.telemetry),
      risks: toStringArray(prdRow.risks),
      sections:
        prdRow.sections && typeof prdRow.sections === "object" && !Array.isArray(prdRow.sections)
          ? (prdRow.sections as Record<string, string[]>)
          : {},
    }
    : null;

  return { reviews, synthesis, prd };
}
