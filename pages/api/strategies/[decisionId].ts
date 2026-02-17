import type { NextApiRequest, NextApiResponse } from "next";

import { enforceRateLimit, enforceSensitiveRouteAccess } from "../../../src/security/request_guards";
import {
  getDecisionForWorkflow,
  listStrategicDecisionLogEntries as listPostgresStrategicDecisionLogEntries,
} from "../../../src/store/postgres";
import {
  buildArtifactSections,
  buildFallbackStrategyFromWorkflow,
  normalizeId,
  type StrategyResponseEntry,
} from "../../../src/features/boardroom/strategyDetails";

interface StrategyDetailsResponse {
  strategy?: StrategyResponseEntry;
  source?: "postgres";
  error?: string;
  details?: string;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse<StrategyDetailsResponse>): Promise<void> {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  if (
    !(await enforceRateLimit(req, res, {
      routeKey: "api/strategies/details",
      limit: 120,
      windowMs: 60_000,
    }))
  ) {
    return;
  }

  if (!enforceSensitiveRouteAccess(req, res)) {
    return;
  }

  const rawDecisionId = req.query.decisionId;
  const decisionId = Array.isArray(rawDecisionId) ? rawDecisionId[0] : rawDecisionId;

  if (typeof decisionId !== "string" || decisionId.trim().length === 0) {
    res.status(400).json({ error: "decisionId is required" });
    return;
  }

  const trimmedDecisionId = decisionId.trim();
  const normalizedDecisionId = normalizeId(trimmedDecisionId);

  try {
    const [entries, workflowDecision] = await Promise.all([
      listPostgresStrategicDecisionLogEntries(),
      getDecisionForWorkflow(trimmedDecisionId),
    ]);

    const entry = entries.find((candidate) => normalizeId(candidate.id) === normalizedDecisionId);
    const resolvedEntry = entry ?? (workflowDecision ? buildFallbackStrategyFromWorkflow(trimmedDecisionId, workflowDecision) : null);

    if (resolvedEntry) {
      const properties = workflowDecision?.properties ?? {};
      const bodyText = workflowDecision?.bodyText ?? "";

      const artifactSections = buildArtifactSections(properties, bodyText, {
        summary: resolvedEntry.summary,
        primaryKpi: resolvedEntry.primaryKpi,
        strategicObjective: resolvedEntry.strategicObjective,
        confidence: resolvedEntry.confidence,
        investment: resolvedEntry.investment,
      });

      res.status(200).json({
        source: "postgres",
        strategy: {
          ...resolvedEntry,
          artifactSections,
        },
      });
      return;
    }
  } catch (error) {
    console.error("[api/strategies/:decisionId] failed to fetch strategy", error);
    res.status(500).json({
      error: "Failed to fetch strategic decision",
    });
    return;
  }

  res.status(404).json({
    error: "Strategic decision not found",
    details: `No entry found for ${trimmedDecisionId}.`,
  });
}
