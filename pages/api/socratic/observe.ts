import type { NextApiRequest, NextApiResponse } from "next";
import { z } from "zod";

import { resolveModelForProvider, resolveProvider } from "../../../src/config/llm_providers";
import { enforceRateLimit, enforceSensitiveRouteAccess } from "../../../src/security/request_guards";
import { ProviderClientRegistry } from "../../../src/llm/client";
import type {
  CreateStrategyDraft,
  DraftBoardAction,
  SocraticResearchLink,
  StrategicMitigationEntry,
  StrategicDecisionDocument,
} from "../../../src/features/boardroom/types";
import { buildSocraticSession, buildStrategicDecisionDocument, initialCreateStrategyDraft } from "../../../src/features/boardroom/utils";
import {
  applySocraticAgentOutput,
  buildSocraticAgentUserMessage,
  buildSocraticSystemPrompt,
  parseSocraticAgentOutput,
} from "../../../src/features/boardroom/socratic_observer";

const socraticObserveSchema = z
  .object({
    draft: z.record(z.string(), z.unknown()).optional(),
    action: z.enum(["simulate_red_team", "verify_assumptions"]).nullable().optional(),
    researchLinksBySection: z.record(
      z.string(),
      z
        .array(
          z.object({
            title: z.string(),
            url: z.string(),
            snippet: z.string(),
            publishedDate: z.string().nullable(),
          }),
        )
        .max(12),
    )
      .optional(),
    clippedEvidenceBySection: z.record(
      z.string(),
      z
        .array(
          z.object({
            title: z.string(),
            url: z.string(),
            snippet: z.string(),
            publishedDate: z.string().nullable(),
          }),
        )
        .max(12),
    )
      .optional(),
  })
  .strict();

const SOCRATIC_OBSERVER_MAX_TOKENS = 1000;
const SOCRATIC_OBSERVER_TEMPERATURE = 0.15;

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function asNumber(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return 0;
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
}

function parseMitigations(value: unknown): StrategicMitigationEntry[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => asRecord(entry))
    .map((entry) => ({
      id: asString(entry.id).trim(),
      sectionKey: asString(entry.sectionKey).trim(),
      riskTitle: asString(entry.riskTitle).trim(),
      description: asString(entry.description).trim(),
      mitigationText: asString(entry.mitigationText).trim(),
      resolvedAt: asString(entry.resolvedAt).trim(),
    }))
    .filter((entry) => entry.id.length > 0 && entry.mitigationText.length > 0);
}

function normalizeDraft(rawDraft: Record<string, unknown> | undefined): CreateStrategyDraft {
  const base = initialCreateStrategyDraft();
  if (!rawDraft) {
    return base;
  }

  const core = asRecord(rawDraft.coreProperties);
  const capital = asRecord(rawDraft.capitalAllocation);
  const risk = asRecord(rawDraft.riskProperties);
  const sections = asRecord(rawDraft.sections);
  const mitigations = parseMitigations(rawDraft.mitigations);

  return {
    ...base,
    name: asString(rawDraft.name),
    owner: asString(rawDraft.owner) || base.owner,
    reviewDate: asString(rawDraft.reviewDate),
    primaryKpi: asString(rawDraft.primaryKpi),
    investment: asString(rawDraft.investment),
    strategicObjective: asString(rawDraft.strategicObjective),
    confidence: asString(rawDraft.confidence),
    coreProperties: {
      ...base.coreProperties,
      strategicObjective: asString(core.strategicObjective),
      primaryKpi: asString(core.primaryKpi),
      baseline: asString(core.baseline),
      target: asString(core.target),
      timeHorizon: asString(core.timeHorizon),
      decisionType: asString(core.decisionType),
    },
    capitalAllocation: {
      ...base.capitalAllocation,
      investmentRequired: asNumber(capital.investmentRequired),
      grossBenefit12m: asNumber(capital.grossBenefit12m),
      probabilityOfSuccess: asString(capital.probabilityOfSuccess),
      strategicLeverageScore: asString(capital.strategicLeverageScore),
      reversibilityFactor: asString(capital.reversibilityFactor),
    },
    riskProperties: {
      ...base.riskProperties,
      regulatoryRisk: asString(risk.regulatoryRisk),
      technicalRisk: asString(risk.technicalRisk),
      operationalRisk: asString(risk.operationalRisk),
      reputationalRisk: asString(risk.reputationalRisk),
    },
    sections: {
      ...base.sections,
      ...Object.fromEntries(Object.entries(sections).map(([key, value]) => [key, asString(value)])),
    },
    mitigations,
  };
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<{
    session?: ReturnType<typeof buildSocraticSession>;
    strategicDocument?: StrategicDecisionDocument;
    error?: string;
    mode?: string;
  }>,
): Promise<void> {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    res.status(405).json({ error: "Method not allowed." });
    return;
  }

  if (
    !(await enforceRateLimit(req, res, {
      routeKey: "api/socratic/observe",
      limit: 80,
      windowMs: 60_000,
    }))
  ) {
    return;
  }

  if (!enforceSensitiveRouteAccess(req, res)) {
    return;
  }

  const parsed = socraticObserveSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request payload." });
    return;
  }

  try {
    const normalizedDraft = normalizeDraft(parsed.data.draft);
    const action = (parsed.data.action ?? null) as DraftBoardAction | null;
    const researchLinksBySection = (parsed.data.researchLinksBySection ?? {}) as Record<string, SocraticResearchLink[]>;
    const clippedEvidenceBySection = (parsed.data.clippedEvidenceBySection ?? {}) as Record<string, SocraticResearchLink[]>;
    const session = buildSocraticSession(normalizedDraft, researchLinksBySection);
    let strategicDocument = buildStrategicDecisionDocument(normalizedDraft, session, {
      clippedEvidenceBySection,
      action,
    });
    let mode = "observer-heuristic";

    try {
      const preferredProvider = resolveProvider(process.env.BOARDROOM_PROVIDER);
      const modelName = resolveModelForProvider(preferredProvider, process.env.BOARDROOM_MODEL ?? "gpt-4o-mini");
      const providerClients = new ProviderClientRegistry();
      const client = providerClients.getResilientClient(preferredProvider);
      const completion = await client.complete({
        model: modelName,
        systemMessage: buildSocraticSystemPrompt(action),
        userMessage: buildSocraticAgentUserMessage(normalizedDraft, strategicDocument, action),
        temperature: SOCRATIC_OBSERVER_TEMPERATURE,
        maxTokens: SOCRATIC_OBSERVER_MAX_TOKENS,
        requireJsonObject: true,
      });
      const parsedObserverOutput = parseSocraticAgentOutput(completion);
      if (parsedObserverOutput) {
        strategicDocument = applySocraticAgentOutput(strategicDocument, normalizedDraft, parsedObserverOutput);
        mode = "observer-llm";
      }
    } catch (error) {
      console.warn("[api/socratic/observe] llm observer fallback to heuristic", error);
    }

    res.status(200).json({
      session,
      strategicDocument,
      mode,
    });
  } catch (error) {
    console.error("[api/socratic/observe] failed to observe draft", error);
    res.status(500).json({ error: "Unable to analyze this draft right now." });
  }
}
