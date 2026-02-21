import type { NextApiRequest, NextApiResponse } from "next";

import { enforceRateLimit, enforceSensitiveRouteAccess } from "../../../src/security/request_guards";
import { getPortfolioInsightsStats } from "../../../src/store/postgres";
import type { PortfolioInsightsStatsResponse } from "../../../src/features/boardroom/types";

interface PortfolioInsightsStatsApiResponse {
  summary?: PortfolioInsightsStatsResponse["summary"];
  radar?: PortfolioInsightsStatsResponse["radar"];
  blindspots?: PortfolioInsightsStatsResponse["blindspots"];
  mitigation_velocity?: PortfolioInsightsStatsResponse["mitigation_velocity"];
  window_days?: number;
  error?: string;
}

function parseWindowDays(raw: unknown): number {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.max(7, Math.min(365, Math.round(value)));
  }
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return Math.max(7, Math.min(365, Math.round(parsed)));
    }
  }
  return 90;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<PortfolioInsightsStatsApiResponse>,
): Promise<void> {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  if (
    !(await enforceRateLimit(req, res, {
      routeKey: "api/insights/stats",
      limit: 80,
      windowMs: 60_000,
    }))
  ) {
    return;
  }

  if (!enforceSensitiveRouteAccess(req, res)) {
    return;
  }

  res.setHeader("Cache-Control", "no-store, max-age=0");

  try {
    const windowDays = parseWindowDays(req.query.windowDays);
    const insights = await getPortfolioInsightsStats(windowDays);

    res.status(200).json({
      summary: {
        avg_portfolio_dqs: insights.summary.avgPortfolioDqs,
        total_decisions_made: insights.summary.totalDecisionsMade,
        total_runs_considered: insights.summary.totalRunsConsidered,
        risk_mitigation_rate: insights.summary.riskMitigationRate,
      },
      radar: insights.radar.map((entry) => ({
        agent_name: entry.agentName,
        avg_sentiment: entry.avgSentiment,
        total_vetos: entry.totalVetos,
        avg_influence: entry.avgInfluence,
        total_reviews: entry.totalReviews,
      })),
      blindspots: insights.blindspots.map((entry) => ({
        gap_category: entry.gapCategory,
        frequency: entry.frequency,
      })),
      mitigation_velocity: {
        average_minutes: insights.mitigationVelocity.averageMinutes,
        median_minutes: insights.mitigationVelocity.medianMinutes,
        unresolved_count: insights.mitigationVelocity.unresolvedCount,
        trend_percent_30d: insights.mitigationVelocity.trendPercent30d,
        resolved: insights.mitigationVelocity.resolved.map((entry) => ({
          strategy_id: entry.strategyId,
          identified_at: entry.identifiedAt,
          resolved_at: entry.resolvedAt,
          minutes_to_mitigate: entry.minutesToMitigate,
        })),
      },
      window_days: windowDays,
    });
  } catch (error) {
    console.error("[api/insights/stats] failed to load portfolio insights", error);
    res.status(500).json({ error: "Failed to load portfolio insights" });
  }
}
