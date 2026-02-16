import type { NextApiRequest, NextApiResponse } from "next";
import { z } from "zod";

import { AgentConfig, normalizeAgentConfigs } from "../../../src/config/agent_config";
import { enforceRateLimit, enforceSensitiveRouteAccess } from "../../../src/security/request_guards";
import { getPersistedAgentConfigs } from "../../../src/store/postgres";
import { runAllProposedDecisions, runDecisionWorkflow } from "../../../src/workflow/decision_workflow";

interface RunBody {
  decisionId?: string;
  modelName?: string;
  temperature?: number;
  maxTokens?: number;
  agentConfigs?: AgentConfig[];
  includeExternalResearch?: boolean;
  includeSensitive?: boolean;
}

const runBodySchema = z
  .object({
    decisionId: z
      .string()
      .trim()
      .min(1)
      .max(128)
      .regex(/^[a-zA-Z0-9_-]+$/, "decisionId format is invalid")
      .optional(),
    modelName: z
      .string()
      .trim()
      .min(1)
      .max(128)
      .regex(/^[a-zA-Z0-9._:/-]+$/, "modelName format is invalid")
      .optional(),
    temperature: z.number().finite().min(0).max(1).optional(),
    maxTokens: z.number().int().min(256).max(8000).optional(),
    agentConfigs: z.array(z.unknown()).max(32).optional(),
    includeExternalResearch: z.boolean().optional(),
    includeSensitive: z.boolean().optional(),
  })
  .strict();

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

function asString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((entry): entry is string => typeof entry === "string")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0)
    .slice(0, 25);
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

function toWorkflowStatePreview(state: unknown): Record<string, unknown> {
  const record = asRecord(state) ?? {};
  const decisionId = asString(record.decision_id) ?? "unknown";
  const decisionName = asString(record.decision_name) ?? `Decision ${decisionId}`;
  const dqs = asNumber(record.dqs) ?? 0;
  const status = asString(record.status) ?? "UNKNOWN";

  return {
    decision_id: decisionId,
    decision_name: decisionName,
    dqs,
    status,
    missing_sections: asStringArray(record.missing_sections),
    reviews: {},
    synthesis: null,
    prd: null,
    decision_snapshot: null,
    run_id: asNumber(record.run_id) ?? undefined,
    run_created_at: asString(record.run_created_at) ?? undefined,
  };
}

export default async function handler(req: NextApiRequest, res: NextApiResponse): Promise<void> {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  if (
    !enforceRateLimit(req, res, {
      routeKey: "api/workflow/run",
      limit: 20,
      windowMs: 60_000,
    })
  ) {
    return;
  }

  if (!enforceSensitiveRouteAccess(req, res)) {
    return;
  }

  try {
    if (req.body !== undefined && (!req.body || typeof req.body !== "object" || Array.isArray(req.body))) {
      res.status(400).json({ error: "Invalid request payload" });
      return;
    }

    const rawBody = (req.body ?? {}) as Record<string, unknown>;
    const parsedBody = runBodySchema.safeParse(rawBody);
    if (!parsedBody.success) {
      res.status(400).json({ error: "Invalid request payload" });
      return;
    }

    const body = parsedBody.data as RunBody;
    const includeExternalResearch = body.includeExternalResearch === true;
    const includeSensitive = body.includeSensitive === true;
    const persistedAgentConfigs = Array.isArray(body.agentConfigs) ? null : await getPersistedAgentConfigs();
    const agentConfigs = normalizeAgentConfigs(body.agentConfigs ?? persistedAgentConfigs ?? undefined);

    if (body.decisionId && body.decisionId.trim().length > 0) {
      const state = await runDecisionWorkflow({
        decisionId: body.decisionId.trim(),
        modelName: body.modelName,
        temperature: body.temperature,
        maxTokens: body.maxTokens,
        agentConfigs,
        includeExternalResearch,
      });

      res.status(200).json({
        mode: "single",
        result: includeSensitive ? state : toWorkflowStatePreview(state),
      });
      return;
    }

    const results = await runAllProposedDecisions({
      modelName: body.modelName,
      temperature: body.temperature,
      maxTokens: body.maxTokens,
      agentConfigs,
      includeExternalResearch,
    });

    res.status(200).json({
      mode: "all_proposed",
      count: results.length,
      results: includeSensitive ? results : results.map((entry) => toWorkflowStatePreview(entry)),
    });
  } catch (error) {
    console.error("[api/workflow/run] workflow execution failed", error);
    res.status(500).json({
      error: "Workflow execution failed",
    });
  }
}
