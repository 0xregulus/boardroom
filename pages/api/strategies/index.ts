import type { NextApiRequest, NextApiResponse } from "next";
import { z } from "zod";

import { enforceRateLimit, enforceSensitiveRouteAccess } from "../../../src/security/request_guards";
import {
  listStrategicDecisionLogEntries as listPostgresStrategicDecisionLogEntries,
  upsertDecisionDocument,
  upsertDecisionRecord,
} from "../../../src/store/postgres";
import type { DecisionStrategy } from "../../../src/features/boardroom/types";

const strategySaveSchema = z
  .object({
    strategy: z
      .object({
        id: z.string().trim().min(1).max(120),
        name: z.string().trim().min(1).max(220),
        status: z.string().trim().max(80).optional(),
        owner: z.string().trim().max(120).optional(),
        reviewDate: z.string().trim().max(120).optional(),
        summary: z.string().trim().max(2500).optional(),
        primaryKpi: z.string().trim().max(220).optional(),
        investment: z.string().trim().max(220).optional(),
        strategicObjective: z.string().trim().max(320).optional(),
        confidence: z.string().trim().max(120).optional(),
        detailsUrl: z.string().trim().max(500).optional(),
        artifactSections: z.record(z.string(), z.string()).optional(),
      })
      .strict(),
  })
  .strict();

const SECTION_BODY_ORDER = [
  ["executiveSummary", "Executive Summary"],
  ["strategicContext", "1. Strategic Context"],
  ["problemFraming", "2. Problem Framing"],
  ["optionsEvaluated", "3. Options Evaluated"],
  ["financialModel", "4. Financial Model"],
  ["riskMatrix", "5. Risk Matrix"],
  ["downsideModel", "6. Downside Model"],
  ["finalDecision", "7. Final Decision"],
  ["killCriteria", "8. Kill Criteria"],
  ["complianceMonitoring", "10. Compliance & Monitoring"],
] as const;

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
}

function parseSerializedRecord(raw: string | undefined): Record<string, unknown> {
  if (typeof raw !== "string" || raw.trim().length === 0) {
    return {};
  }
  try {
    return asRecord(JSON.parse(raw));
  } catch {
    return {};
  }
}

function parseCurrencyAmount(raw: string): number {
  const parsed = Number(raw.replace(/[^0-9.-]+/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return null;
}

function parseReviewDate(raw: string | undefined): string | null {
  if (typeof raw !== "string" || raw.trim().length === 0 || raw === "No review date") {
    return null;
  }
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function parseMitigations(raw: string | undefined): unknown[] {
  if (typeof raw !== "string" || raw.trim().length === 0) {
    return [];
  }
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function buildBodyTextFromSections(artifactSections: Record<string, string>): string {
  const segments: string[] = [];

  for (const [sectionKey, heading] of SECTION_BODY_ORDER) {
    const value = artifactSections[sectionKey];
    if (typeof value !== "string" || value.trim().length === 0) {
      continue;
    }
    segments.push(`${heading}\n${value.trim()}`);
  }

  if (segments.length === 0) {
    return "";
  }
  return `${segments.join("\n\n")}\n`;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse): Promise<void> {
  if (req.method !== "GET" && req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  if (
    !(await enforceRateLimit(req, res, {
      routeKey: req.method === "GET" ? "api/strategies/index" : "api/strategies/create",
      limit: 120,
      windowMs: 60_000,
    }))
  ) {
    return;
  }

  if (!enforceSensitiveRouteAccess(req, res)) {
    return;
  }

  if (req.method === "GET") {
    try {
      const strategies = await listPostgresStrategicDecisionLogEntries();
      res.status(200).json({ strategies, source: "postgres" });
      return;
    } catch (error) {
      console.error("[api/strategies] failed to fetch strategies", error);
      res.status(500).json({
        error: "Failed to fetch strategic decisions from Strategic Decision Log",
      });
    }
    return;
  }

  const parsed = strategySaveSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid strategy payload." });
    return;
  }

  const strategy = parsed.data.strategy as DecisionStrategy;
  const artifactSections = strategy.artifactSections ?? {};
  const coreProperties = parseSerializedRecord(artifactSections.coreProperties);
  const capitalAllocation = parseSerializedRecord(artifactSections.capitalAllocationModel);
  const mitigations = parseMitigations(artifactSections.mitigations);

  const investmentRequired =
    asNumber(capitalAllocation.investmentRequired) ??
    (typeof strategy.investment === "string" ? parseCurrencyAmount(strategy.investment) : 0);

  try {
    await upsertDecisionRecord({
      id: strategy.id,
      name: strategy.name,
      status: strategy.status,
      owner: strategy.owner,
      reviewDate: parseReviewDate(strategy.reviewDate),
      summary: strategy.summary,
      primaryKpi: strategy.primaryKpi,
      investmentRequired,
      strategicObjective: strategy.strategicObjective,
      confidence: strategy.confidence,
      baseline: asNumber(coreProperties.baseline),
      target: asNumber(coreProperties.target),
      timeHorizon: typeof coreProperties.timeHorizon === "string" ? coreProperties.timeHorizon : null,
      probabilityOfSuccess: typeof capitalAllocation.probabilityOfSuccess === "string" ? capitalAllocation.probabilityOfSuccess : null,
      leverageScore: typeof capitalAllocation.strategicLeverageScore === "string" ? capitalAllocation.strategicLeverageScore : null,
      benefit12mGross: asNumber(capitalAllocation.grossBenefit12m),
      decisionType: typeof coreProperties.decisionType === "string" ? coreProperties.decisionType : null,
      mitigations,
      detailsUrl: strategy.detailsUrl ?? null,
    });
    await upsertDecisionDocument(strategy.id, buildBodyTextFromSections(artifactSections));

    const strategies = await listPostgresStrategicDecisionLogEntries();
    const persistedStrategy = strategies.find((entry) => entry.id === strategy.id) ?? strategy;

    res.status(200).json({
      strategy: {
        ...persistedStrategy,
        artifactSections,
      },
      source: "postgres",
    });
    return;
  } catch (error) {
    console.error("[api/strategies] failed to persist strategy", error);
    res.status(500).json({
      error: "Failed to save strategic decision",
    });
  }
}
