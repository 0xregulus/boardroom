import type { NextApiRequest, NextApiResponse } from "next";

import { enforceRateLimit, enforceSensitiveRouteAccess } from "../../../src/security/request_guards";
import { listWorkflowRuns, WorkflowRunRecord } from "../../../src/store/postgres";

interface WorkflowRunResponseEntry {
  id: number;
  decision_id: string;
  dqs: number;
  gate_decision: string;
  workflow_status: string;
  state_preview: unknown;
  created_at: string;
}

interface WorkflowRunsResponse {
  runs?: WorkflowRunResponseEntry[];
  error?: string;
}

function parseLimit(raw: unknown): number {
  if (typeof raw === "number" && Number.isFinite(raw)) {
    return Math.max(1, Math.min(100, Math.round(raw)));
  }

  if (typeof raw === "string") {
    const parsed = Number(raw);
    if (Number.isFinite(parsed)) {
      return Math.max(1, Math.min(100, Math.round(parsed)));
    }
  }

  return 20;
}

function parseDecisionId(raw: unknown): string | null {
  const decisionId = Array.isArray(raw) ? raw[0] : raw;
  if (typeof decisionId !== "string") {
    return null;
  }

  const trimmed = decisionId.trim();
  if (trimmed.length === 0 || trimmed.length > 128) {
    return null;
  }

  if (!/^[a-zA-Z0-9_-]+$/.test(trimmed)) {
    return null;
  }

  return trimmed;
}

function asString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function buildStatePreview(run: WorkflowRunRecord): Record<string, unknown> {
  const decisionName = asString(run.decisionName) ?? `Decision ${run.decisionId}`;
  const status = asString(run.stateStatus) ?? run.workflowStatus;
  const missingSections = run.missingSections.filter((entry) => entry.trim().length > 0).slice(0, 25);
  const summaryLine = asString(run.summaryLine);

  return {
    decision_id: run.decisionId,
    decision_name: decisionName,
    dqs: run.dqs,
    status,
    summary_line: summaryLine,
    missing_sections: missingSections,
    review_stances: run.reviewStances.map((entry) => ({
      agent: entry.agent,
      stance: entry.stance,
      score: entry.score,
      confidence: entry.confidence,
    })),
    risk_findings_count: run.riskFindingsCount,
    mitigation_count: run.mitigationCount,
    pending_mitigations_count: run.pendingMitigationsCount,
    friction_score: run.frictionScore,
    reviews: {},
    synthesis: null,
    prd: null,
    decision_snapshot: null,
    run_id: run.id,
    run_created_at: run.createdAt,
  };
}

export default async function handler(req: NextApiRequest, res: NextApiResponse<WorkflowRunsResponse>): Promise<void> {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  if (
    !(await enforceRateLimit(req, res, {
      routeKey: "api/workflow/runs",
      limit: 120,
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
    const decisionId = parseDecisionId(req.query.decisionId);
    if (!decisionId) {
      res.status(400).json({ error: "decisionId query parameter is required" });
      return;
    }

    const rawLimit = Array.isArray(req.query.limit) ? req.query.limit[0] : req.query.limit;
    const limit = parseLimit(rawLimit);

    const runs = await listWorkflowRuns(decisionId, limit);

    res.status(200).json({
      runs: runs.map((run) => ({
        id: run.id,
        decision_id: run.decisionId,
        dqs: run.dqs,
        gate_decision: run.gateDecision,
        workflow_status: run.workflowStatus,
        state_preview: buildStatePreview(run),
        created_at: run.createdAt,
      })),
    });
  } catch (error) {
    console.error("[api/workflow/runs] failed to load workflow runs", error);
    res.status(500).json({
      error: "Failed to load workflow runs",
    });
  }
}
