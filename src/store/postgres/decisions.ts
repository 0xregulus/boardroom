import type { QueryResultRow } from "pg";

import { query } from "./client";
import {
  asString,
  formatInvestment,
  formatReviewDate,
  normalizeStatus,
  toIsoTimestamp,
  toNumber,
} from "./serializers";
import type { DecisionForWorkflow, DecisionUpsertInput, StrategicDecisionLogEntry } from "./types";

interface DecisionListRow extends QueryResultRow {
  id: string;
  name: string;
  status: string;
  owner: string | null;
  review_date: Date | string | null;
  summary: string | null;
  primary_kpi: string | null;
  investment_required: string | number | null;
  strategic_objective: string | null;
  confidence: string | null;
  details_url: string | null;
  created_at: Date | string;
}

interface DecisionIdRow extends QueryResultRow {
  id: string;
}

interface DecisionWorkflowRow extends QueryResultRow {
  id: string;
  name: string;
  status: string;
  owner: string | null;
  review_date: Date | string | null;
  summary: string | null;
  primary_kpi: string | null;
  investment_required: string | number | null;
  strategic_objective: string | null;
  confidence: string | null;
  baseline: string | number | null;
  target: string | number | null;
  time_horizon: string | null;
  probability_of_success: string | null;
  leverage_score: string | null;
  risk_adjusted_roi: string | number | null;
  benefit_12m_gross: string | number | null;
  decision_type: string | null;
  mitigations: unknown;
  created_at: Date | string;
  body_text: string | null;
}

interface DecisionGovernanceRow extends QueryResultRow {
  gate_name: string;
  is_checked: boolean;
}

export async function listStrategicDecisionLogEntries(): Promise<StrategicDecisionLogEntry[]> {
  const result = await query<DecisionListRow>(
    `
      SELECT
        id,
        name,
        status,
        owner,
        review_date,
        summary,
        primary_kpi,
        investment_required,
        strategic_objective,
        confidence,
        details_url,
        created_at
      FROM decisions
      ORDER BY COALESCE(review_date, created_at) DESC
    `,
  );

  return result.rows.map((row) => {
    const reviewDate = formatReviewDate(row.review_date ?? row.created_at);
    const name = asString(row.name, "").trim() || `Decision ${row.id.slice(0, 8)}`;
    const summary = asString(row.summary, "").trim() || `Decision brief for ${name}.`;

    return {
      id: row.id,
      name,
      status: normalizeStatus(asString(row.status, "Proposed")),
      owner: asString(row.owner, "Unassigned").trim() || "Unassigned",
      reviewDate: reviewDate.label,
      summary,
      primaryKpi: asString(row.primary_kpi, "Not specified").trim() || "Not specified",
      investment: formatInvestment(row.investment_required),
      strategicObjective: asString(row.strategic_objective, "Not specified").trim() || "Not specified",
      confidence: asString(row.confidence, "N/A").trim() || "N/A",
      detailsUrl: asString(row.details_url, "").trim() || undefined,
    } satisfies StrategicDecisionLogEntry;
  });
}

export async function listProposedDecisionIds(): Promise<string[]> {
  const result = await query<DecisionIdRow>(
    `
      SELECT id
      FROM decisions
      WHERE LOWER(status) = LOWER($1)
      ORDER BY COALESCE(review_date, created_at) DESC
    `,
    ["Proposed"],
  );

  return result.rows.map((row) => row.id);
}

export async function getDecisionForWorkflow(decisionId: string): Promise<DecisionForWorkflow | null> {
  const decisionResult = await query<DecisionWorkflowRow>(
    `
      SELECT
        d.id,
        d.name,
        d.status,
        d.owner,
        d.review_date,
        d.summary,
        d.primary_kpi,
        d.investment_required,
        d.strategic_objective,
        d.confidence,
        d.baseline,
        d.target,
        d.time_horizon,
        d.probability_of_success,
        d.leverage_score,
        d.risk_adjusted_roi,
        d.benefit_12m_gross,
        d.decision_type,
        d.mitigations,
        d.created_at,
        doc.body_text
      FROM decisions d
      LEFT JOIN decision_documents doc ON doc.decision_id = d.id
      WHERE d.id = $1
      LIMIT 1
    `,
    [decisionId],
  );

  const row = decisionResult.rows[0];
  if (!row) {
    return null;
  }

  const governanceResult = await query<DecisionGovernanceRow>(
    `
      SELECT gate_name, is_checked
      FROM decision_governance_checks
      WHERE decision_id = $1
    `,
    [decisionId],
  );

  const governanceChecks: Record<string, boolean> = {};
  for (const gateRow of governanceResult.rows) {
    governanceChecks[gateRow.gate_name] = Boolean(gateRow.is_checked);
  }

  const properties: Record<string, unknown> = {
    "Decision Name": row.name,
    Status: row.status,
    Owner: row.owner ?? "Unassigned",
    "Review Date": toIsoTimestamp(row.review_date),
    "Executive Summary": row.summary ?? "",
    "Primary KPI": row.primary_kpi ?? "",
    "Investment Required": toNumber(row.investment_required),
    "Strategic Objective": row.strategic_objective ?? "",
    "Confidence Level": row.confidence ?? "",
    Baseline: toNumber(row.baseline),
    Target: toNumber(row.target),
    "Time Horizon": row.time_horizon ?? "",
    "Probability of Success": row.probability_of_success ?? "",
    "Strategic Leverage Score": row.leverage_score ?? "",
    "Risk-Adjusted ROI": toNumber(row.risk_adjusted_roi),
    "12-Month Gross Benefit": toNumber(row.benefit_12m_gross),
    "Decision Type": row.decision_type ?? "",
    Mitigations: row.mitigations ?? [],
  };

  for (const [gateName, isChecked] of Object.entries(governanceChecks)) {
    properties[gateName] = isChecked;
  }

  return {
    id: row.id,
    name: row.name,
    createdAt: toIsoTimestamp(row.created_at),
    bodyText: row.body_text ?? "",
    properties,
    governanceChecks,
  };
}

export async function upsertDecisionRecord(input: DecisionUpsertInput): Promise<void> {
  await query(
    `
      INSERT INTO decisions (
        id,
        name,
        status,
        owner,
        review_date,
        summary,
        primary_kpi,
        investment_required,
        strategic_objective,
        confidence,
        baseline,
        target,
        time_horizon,
        probability_of_success,
        leverage_score,
        risk_adjusted_roi,
        benefit_12m_gross,
        decision_type,
        mitigations,
        details_url,
        created_at,
        updated_at
      )
      VALUES (
        $1,
        $2,
        COALESCE($3, 'Proposed'),
        $4,
        $5::timestamptz,
        $6,
        $7,
        $8,
        $9,
        $10,
        $11,
        $12,
        $13,
        $14,
        $15,
        $16,
        $17,
        $18,
        COALESCE($19::jsonb, '[]'::jsonb),
        $20,
        COALESCE($21::timestamptz, NOW()),
        NOW()
      )
      ON CONFLICT (id)
      DO UPDATE SET
        name = EXCLUDED.name,
        status = EXCLUDED.status,
        owner = EXCLUDED.owner,
        review_date = EXCLUDED.review_date,
        summary = EXCLUDED.summary,
        primary_kpi = EXCLUDED.primary_kpi,
        investment_required = EXCLUDED.investment_required,
        strategic_objective = EXCLUDED.strategic_objective,
        confidence = EXCLUDED.confidence,
        baseline = EXCLUDED.baseline,
        target = EXCLUDED.target,
        time_horizon = EXCLUDED.time_horizon,
        probability_of_success = EXCLUDED.probability_of_success,
        leverage_score = EXCLUDED.leverage_score,
        risk_adjusted_roi = EXCLUDED.risk_adjusted_roi,
        benefit_12m_gross = EXCLUDED.benefit_12m_gross,
        decision_type = EXCLUDED.decision_type,
        mitigations = EXCLUDED.mitigations,
        details_url = EXCLUDED.details_url,
        updated_at = NOW()
    `,
    [
      input.id,
      input.name,
      input.status ?? "Proposed",
      input.owner ?? null,
      input.reviewDate ?? null,
      input.summary ?? null,
      input.primaryKpi ?? null,
      input.investmentRequired ?? null,
      input.strategicObjective ?? null,
      input.confidence ?? null,
      input.baseline ?? null,
      input.target ?? null,
      input.timeHorizon ?? null,
      input.probabilityOfSuccess ?? null,
      input.leverageScore ?? null,
      input.riskAdjustedRoi ?? null,
      input.benefit12mGross ?? null,
      input.decisionType ?? null,
      input.mitigations ? JSON.stringify(input.mitigations) : null,
      input.detailsUrl ?? null,
      input.createdAt ?? null,
    ],
  );
}

export async function upsertDecisionDocument(decisionId: string, bodyText: string): Promise<void> {
  await query(
    `
      INSERT INTO decision_documents (
        decision_id,
        body_text,
        created_at,
        updated_at
      )
      VALUES ($1, $2, NOW(), NOW())
      ON CONFLICT (decision_id)
      DO UPDATE SET
        body_text = EXCLUDED.body_text,
        updated_at = NOW()
    `,
    [decisionId, bodyText],
  );
}

export async function setDecisionGovernanceChecks(decisionId: string, checks: Record<string, boolean>): Promise<void> {
  await query(
    `
      DELETE FROM decision_governance_checks
      WHERE decision_id = $1
    `,
    [decisionId],
  );

  const entries = Object.entries(checks);
  if (entries.length === 0) {
    return;
  }

  const gateNames = entries.map(([gateName]) => gateName);
  const gateValues = entries.map(([, isChecked]) => isChecked);

  await query(
    `
      INSERT INTO decision_governance_checks (
        decision_id,
        gate_name,
        is_checked,
        updated_at
      )
      SELECT
        $1,
        gate_name,
        is_checked,
        NOW()
      FROM unnest($2::text[], $3::boolean[]) AS t(gate_name, is_checked)
      ON CONFLICT (decision_id, gate_name)
      DO UPDATE SET
        is_checked = EXCLUDED.is_checked,
        updated_at = NOW()
    `,
    [decisionId, gateNames, gateValues],
  );
}

export async function updateDecisionStatus(decisionId: string, status: string): Promise<void> {
  const result = await query<DecisionIdRow>(
    `
      UPDATE decisions
      SET status = $2, updated_at = NOW()
      WHERE id = $1
      RETURNING id
    `,
    [decisionId, status],
  );

  if (result.rowCount === 0) {
    throw new Error(`Decision ${decisionId} was not found`);
  }
}

export async function upsertGovernanceChecks(decisionId: string, gatesToMarkTrue: string[]): Promise<void> {
  const uniqueGates = [...new Set(gatesToMarkTrue.map((gate) => gate.trim()).filter((gate) => gate.length > 0))];
  if (uniqueGates.length === 0) {
    return;
  }

  await query(
    `
      INSERT INTO decision_governance_checks (decision_id, gate_name, is_checked, updated_at)
      SELECT $1, gate_name, TRUE, NOW()
      FROM unnest($2::text[]) AS gate_name
      ON CONFLICT (decision_id, gate_name)
      DO UPDATE
      SET is_checked = TRUE, updated_at = NOW()
    `,
    [decisionId, uniqueGates],
  );
}
