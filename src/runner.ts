import "dotenv/config";

import { runAllProposedDecisions, runDecisionWorkflow } from "./workflow/decision_workflow";

interface CliArgs {
  decisionId?: string;
  modelName?: string;
  temperature?: number;
  maxTokens?: number;
  fullOutput?: boolean;
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {};

  for (let i = 0; i < argv.length; i += 1) {
    const current = argv[i];

    if (current === "--full-output") {
      args.fullOutput = true;
      continue;
    }

    const next = argv[i + 1];
    if (!next) {
      continue;
    }

    if (current === "--decision-id") {
      args.decisionId = next;
      i += 1;
      continue;
    }

    if (current === "--model") {
      args.modelName = next;
      i += 1;
      continue;
    }

    if (current === "--temperature") {
      const parsed = Number(next);
      if (!Number.isNaN(parsed)) {
        args.temperature = parsed;
      }
      i += 1;
      continue;
    }

    if (current === "--max-tokens") {
      const parsed = Number(next);
      if (!Number.isNaN(parsed)) {
        args.maxTokens = parsed;
      }
      i += 1;
    }
  }

  return args;
}

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

function buildRedactedWorkflowState(state: unknown): Record<string, unknown> {
  const record = asRecord(state) ?? {};
  const decisionId = asString(record.decision_id) ?? "unknown";
  const decisionName = asString(record.decision_name) ?? `Decision ${decisionId}`;

  return {
    decision_id: decisionId,
    decision_name: decisionName,
    dqs: asNumber(record.dqs) ?? 0,
    status: asString(record.status) ?? "UNKNOWN",
    missing_sections: asStringArray(record.missing_sections),
    reviews: {},
    synthesis: null,
    prd: null,
    decision_snapshot: null,
    run_id: asNumber(record.run_id) ?? undefined,
    run_created_at: asString(record.run_created_at) ?? undefined,
  };
}

async function main(): Promise<void> {
  const parsed = parseArgs(process.argv.slice(2));

  if (parsed.decisionId) {
    const state = await runDecisionWorkflow({
      decisionId: parsed.decisionId,
      modelName: parsed.modelName,
      temperature: parsed.temperature,
      maxTokens: parsed.maxTokens,
    });

    const resultPayload = parsed.fullOutput ? state : buildRedactedWorkflowState(state);
    console.log(JSON.stringify({ mode: "single", result: resultPayload }, null, 2));
    return;
  }

  const states = await runAllProposedDecisions({
    modelName: parsed.modelName,
    temperature: parsed.temperature,
    maxTokens: parsed.maxTokens,
  });

  const resultsPayload = parsed.fullOutput ? states : states.map((state) => buildRedactedWorkflowState(state));
  console.log(JSON.stringify({ mode: "all_proposed", count: states.length, results: resultsPayload }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
