import type { QueryResultRow } from "pg";

import { query } from "./client";
import { toIsoTimestamp, toNumber } from "./serializers";
import type {
  PortfolioInsightsBlindspotEntry,
  PortfolioInsightsMitigationVelocity,
  PortfolioInsightsMitigationVelocityEntry,
  PortfolioInsightsRadarEntry,
  PortfolioInsightsStats,
  PortfolioInsightsSummary,
} from "./types";

interface PortfolioGlobalSummaryRow extends QueryResultRow {
  avg_portfolio_dqs: string | number | null;
  total_decisions_made: string | number;
  total_runs_considered: string | number;
  risk_mitigation_rate: string | number | null;
}

interface PortfolioRadarRow extends QueryResultRow {
  agent_name: string;
  avg_sentiment: string | number;
  total_vetos: string | number;
  avg_influence: string | number;
  total_reviews: string | number;
}

interface PortfolioBlindspotRow extends QueryResultRow {
  gap_category: string;
  frequency: string | number;
}

interface PortfolioVelocityRow extends QueryResultRow {
  strategy_id: string;
  identified_at: Date | string;
  resolved_at: Date | string;
  minutes_to_mitigate: string | number;
}

interface PortfolioVelocityUnresolvedRow extends QueryResultRow {
  unresolved_count: string | number;
}

function asFiniteNumber(value: unknown, fallback = 0): number {
  const parsed = toNumber(value);
  if (parsed === null || !Number.isFinite(parsed)) {
    return fallback;
  }
  return parsed;
}

function normalizeWindowDays(value: number): number {
  if (!Number.isFinite(value)) {
    return 90;
  }
  return Math.max(7, Math.min(365, Math.round(value)));
}

function buildMitigationVelocity(
  rows: PortfolioVelocityRow[],
  unresolvedCount: number,
): PortfolioInsightsMitigationVelocity {
  const resolved: PortfolioInsightsMitigationVelocityEntry[] = rows
    .map((row) => ({
      strategyId: row.strategy_id,
      identifiedAt: toIsoTimestamp(row.identified_at),
      resolvedAt: toIsoTimestamp(row.resolved_at),
      minutesToMitigate: Math.max(0, asFiniteNumber(row.minutes_to_mitigate)),
    }))
    .filter((entry) => entry.identifiedAt.length > 0 && entry.resolvedAt.length > 0);

  const values = resolved.map((entry) => entry.minutesToMitigate).sort((left, right) => left - right);
  const averageMinutes = values.length > 0 ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
  const medianMinutes =
    values.length === 0
      ? 0
      : values.length % 2 === 1
        ? values[(values.length - 1) / 2]
        : (values[values.length / 2 - 1] + values[values.length / 2]) / 2;

  const now = Date.now();
  const msPerDay = 86_400_000;
  const recent = resolved.filter((entry) => now - Date.parse(entry.resolvedAt) <= 30 * msPerDay);
  const prior = resolved.filter((entry) => {
    const age = now - Date.parse(entry.resolvedAt);
    return age > 30 * msPerDay && age <= 60 * msPerDay;
  });

  const recentAvg =
    recent.length > 0 ? recent.reduce((sum, entry) => sum + entry.minutesToMitigate, 0) / recent.length : null;
  const priorAvg =
    prior.length > 0 ? prior.reduce((sum, entry) => sum + entry.minutesToMitigate, 0) / prior.length : null;
  const trendPercent30d =
    recentAvg !== null && priorAvg !== null && priorAvg > 0 ? ((priorAvg - recentAvg) / priorAvg) * 100 : null;

  return {
    averageMinutes,
    medianMinutes,
    unresolvedCount: Math.max(0, unresolvedCount),
    trendPercent30d,
    resolved: resolved.slice(0, 200),
  };
}

export async function getPortfolioInsightsStats(windowDays = 90): Promise<PortfolioInsightsStats> {
  const normalizedWindowDays = normalizeWindowDays(windowDays);

  const [globalSummaryResult, radarResult, blindspotResult, velocityResult, unresolvedResult] = await Promise.all([
    query<PortfolioGlobalSummaryRow>(
      `
        WITH latest_runs AS (
          SELECT DISTINCT ON (wr.decision_id)
            wr.decision_id,
            wr.dqs,
            wr.state_json
          FROM workflow_runs wr
          ORDER BY wr.decision_id, wr.created_at DESC
        ),
        per_decision AS (
          SELECT
            lr.decision_id,
            lr.dqs,
            COALESCE(
              (
                SELECT SUM(jsonb_array_length(COALESCE(review.value->'risks', '[]'::jsonb)))::int
                FROM jsonb_each(COALESCE(lr.state_json->'reviews', '{}'::jsonb)) AS review
              ),
              0
            ) AS risk_findings,
            COALESCE(jsonb_array_length(COALESCE(lr.state_json->'synthesis'->'residual_risks', '[]'::jsonb)), 0) AS residual_risks,
            COALESCE(
              jsonb_array_length(
                COALESCE(
                  lr.state_json->'decision_snapshot'->'properties'->'Mitigations',
                  lr.state_json->'decision_snapshot'->'properties'->'mitigations',
                  '[]'::jsonb
                )
              ),
              0
            ) AS mitigations_logged
          FROM latest_runs lr
        ),
        risk_totals AS (
          SELECT
            COALESCE(SUM(risk_findings), 0) AS risk_findings_total,
            COALESCE(SUM(GREATEST(residual_risks, risk_findings - mitigations_logged)), 0) AS pending_risks_total
          FROM per_decision
        )
        SELECT
          ROUND(COALESCE((SELECT AVG(dqs) FROM latest_runs), 0)::numeric, 1) AS avg_portfolio_dqs,
          (SELECT COUNT(*)::int FROM decisions) AS total_decisions_made,
          (SELECT COUNT(*)::int FROM latest_runs) AS total_runs_considered,
          ROUND(
            CASE
              WHEN (SELECT risk_findings_total FROM risk_totals) = 0 THEN 100
              ELSE (
                GREATEST(
                  (SELECT risk_findings_total FROM risk_totals) - (SELECT pending_risks_total FROM risk_totals),
                  0
                )::numeric / NULLIF((SELECT risk_findings_total FROM risk_totals), 0)
              ) * 100
            END,
            1
          ) AS risk_mitigation_rate
      `,
    ),
    query<PortfolioRadarRow>(
      `
        SELECT
          dr.agent_name,
          ROUND(AVG(dr.score)::numeric, 2) AS avg_sentiment,
          COUNT(*) FILTER (WHERE dr.blocked) AS total_vetos,
          ROUND(
            AVG(
              CASE
                WHEN dr.blocked THEN 1.0
                WHEN dr.confidence < 0.65 OR dr.score < 6 THEN 0.72
                ELSE 0.45
              END
            )::numeric,
            2
          ) AS avg_influence,
          COUNT(*) AS total_reviews
        FROM decision_reviews dr
        GROUP BY dr.agent_name
        ORDER BY AVG(dr.score) ASC, COUNT(*) FILTER (WHERE dr.blocked) DESC, dr.agent_name ASC
      `,
    ),
    query<PortfolioBlindspotRow>(
      `
        WITH latest_runs AS (
          SELECT DISTINCT ON (wr.decision_id)
            wr.decision_id,
            wr.state_json
          FROM workflow_runs wr
          ORDER BY wr.decision_id, wr.created_at DESC
        )
        SELECT
          expanded.gap_category,
          COUNT(*)::int AS frequency
        FROM (
          SELECT LOWER(TRIM(gap)) AS gap_category
          FROM latest_runs lr
          CROSS JOIN LATERAL jsonb_array_elements_text(COALESCE(lr.state_json->'missing_sections', '[]'::jsonb)) AS gap
        ) AS expanded
        WHERE expanded.gap_category <> ''
        GROUP BY expanded.gap_category
        ORDER BY frequency DESC, expanded.gap_category ASC
        LIMIT 12
      `,
    ),
    query<PortfolioVelocityRow>(
      `
        WITH run_metrics AS (
          SELECT
            wr.decision_id,
            wr.created_at,
            COALESCE(
              (
                SELECT SUM(jsonb_array_length(COALESCE(review.value->'risks', '[]'::jsonb)))::int
                FROM jsonb_each(COALESCE(wr.state_json->'reviews', '{}'::jsonb)) AS review
              ),
              0
            ) AS risk_findings,
            COALESCE(jsonb_array_length(COALESCE(wr.state_json->'synthesis'->'residual_risks', '[]'::jsonb)), 0) AS residual_risks,
            COALESCE(
              jsonb_array_length(
                COALESCE(
                  wr.state_json->'decision_snapshot'->'properties'->'Mitigations',
                  wr.state_json->'decision_snapshot'->'properties'->'mitigations',
                  '[]'::jsonb
                )
              ),
              0
            ) AS mitigations_logged
          FROM workflow_runs wr
        ),
        risk_lifecycle AS (
          SELECT
            decision_id,
            created_at,
            GREATEST(residual_risks, risk_findings - mitigations_logged) AS pending_risks
          FROM run_metrics
        ),
        first_identified AS (
          SELECT
            decision_id,
            MIN(created_at) AS identified_at
          FROM risk_lifecycle
          WHERE pending_risks > 0
          GROUP BY decision_id
        ),
        first_resolved AS (
          SELECT
            fi.decision_id,
            fi.identified_at,
            MIN(rl.created_at) AS resolved_at
          FROM first_identified fi
          LEFT JOIN risk_lifecycle rl
            ON rl.decision_id = fi.decision_id
           AND rl.created_at > fi.identified_at
           AND rl.pending_risks = 0
          GROUP BY fi.decision_id, fi.identified_at
        )
        SELECT
          fr.decision_id AS strategy_id,
          fr.identified_at,
          fr.resolved_at,
          ROUND(EXTRACT(EPOCH FROM (fr.resolved_at - fr.identified_at)) / 60.0, 1) AS minutes_to_mitigate
        FROM first_resolved fr
        WHERE fr.resolved_at IS NOT NULL
          AND fr.resolved_at >= NOW() - ($1::int || ' days')::interval
        ORDER BY fr.resolved_at DESC
        LIMIT 200
      `,
      [normalizedWindowDays],
    ),
    query<PortfolioVelocityUnresolvedRow>(
      `
        WITH run_metrics AS (
          SELECT
            wr.decision_id,
            wr.created_at,
            COALESCE(
              (
                SELECT SUM(jsonb_array_length(COALESCE(review.value->'risks', '[]'::jsonb)))::int
                FROM jsonb_each(COALESCE(wr.state_json->'reviews', '{}'::jsonb)) AS review
              ),
              0
            ) AS risk_findings,
            COALESCE(jsonb_array_length(COALESCE(wr.state_json->'synthesis'->'residual_risks', '[]'::jsonb)), 0) AS residual_risks,
            COALESCE(
              jsonb_array_length(
                COALESCE(
                  wr.state_json->'decision_snapshot'->'properties'->'Mitigations',
                  wr.state_json->'decision_snapshot'->'properties'->'mitigations',
                  '[]'::jsonb
                )
              ),
              0
            ) AS mitigations_logged
          FROM workflow_runs wr
        ),
        risk_lifecycle AS (
          SELECT
            decision_id,
            created_at,
            GREATEST(residual_risks, risk_findings - mitigations_logged) AS pending_risks
          FROM run_metrics
        ),
        first_identified AS (
          SELECT
            decision_id,
            MIN(created_at) AS identified_at
          FROM risk_lifecycle
          WHERE pending_risks > 0
          GROUP BY decision_id
        ),
        first_resolved AS (
          SELECT
            fi.decision_id,
            fi.identified_at,
            MIN(rl.created_at) AS resolved_at
          FROM first_identified fi
          LEFT JOIN risk_lifecycle rl
            ON rl.decision_id = fi.decision_id
           AND rl.created_at > fi.identified_at
           AND rl.pending_risks = 0
          GROUP BY fi.decision_id, fi.identified_at
        )
        SELECT COUNT(*)::int AS unresolved_count
        FROM first_resolved
        WHERE resolved_at IS NULL
          AND identified_at >= NOW() - ($1::int || ' days')::interval
      `,
      [normalizedWindowDays],
    ),
  ]);

  const globalSummaryRow = globalSummaryResult.rows[0];
  const summary: PortfolioInsightsSummary = {
    avgPortfolioDqs: asFiniteNumber(globalSummaryRow?.avg_portfolio_dqs),
    totalDecisionsMade: Math.max(0, Math.round(asFiniteNumber(globalSummaryRow?.total_decisions_made))),
    totalRunsConsidered: Math.max(0, Math.round(asFiniteNumber(globalSummaryRow?.total_runs_considered))),
    riskMitigationRate: Math.max(0, Math.min(100, asFiniteNumber(globalSummaryRow?.risk_mitigation_rate, 100))),
  };

  const radar: PortfolioInsightsRadarEntry[] = radarResult.rows.map((row) => ({
    agentName: row.agent_name,
    avgSentiment: Math.max(0, Math.min(10, asFiniteNumber(row.avg_sentiment))),
    totalVetos: Math.max(0, Math.round(asFiniteNumber(row.total_vetos))),
    avgInfluence: Math.max(0, Math.min(1.5, asFiniteNumber(row.avg_influence))),
    totalReviews: Math.max(0, Math.round(asFiniteNumber(row.total_reviews))),
  }));

  const blindspots: PortfolioInsightsBlindspotEntry[] = blindspotResult.rows.map((row) => ({
    gapCategory: row.gap_category,
    frequency: Math.max(0, Math.round(asFiniteNumber(row.frequency))),
  }));

  const unresolvedCount = Math.max(0, Math.round(asFiniteNumber(unresolvedResult.rows[0]?.unresolved_count)));
  const mitigationVelocity = buildMitigationVelocity(velocityResult.rows, unresolvedCount);

  return {
    summary,
    radar,
    blindspots,
    mitigationVelocity,
  };
}
