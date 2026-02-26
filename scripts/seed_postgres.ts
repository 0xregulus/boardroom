import "dotenv/config";

import { Pool } from "pg";

import {
  checkDatabaseHealth,
  recordWorkflowRun,
  setDecisionGovernanceChecks,
  upsertDecisionDocument,
  upsertDecisionPrd,
  upsertDecisionRecord,
  upsertDecisionReview,
  upsertDecisionSynthesis,
} from "../src/store/postgres";
import { SEED_DECISIONS, type SeedDecision } from "./seed_postgres_data";

interface CliArgs {
  reset: boolean;
  truncateOnly: boolean;
}

let scriptPool: Pool | null = null;

function getScriptPool(): Pool {
  if (scriptPool) {
    return scriptPool;
  }

  const connectionString = process.env.POSTGRES_URL;
  if (!connectionString) {
    throw new Error("POSTGRES_URL is required");
  }

  scriptPool = new Pool({ connectionString });
  return scriptPool;
}

async function closeScriptPool(): Promise<void> {
  if (!scriptPool) {
    return;
  }

  await scriptPool.end();
  scriptPool = null;
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {
    reset: false,
    truncateOnly: false,
  };

  for (const arg of argv) {
    if (arg === "--reset") {
      args.reset = true;
      continue;
    }

    if (arg === "--truncate-only") {
      args.truncateOnly = true;
      args.reset = true;
      continue;
    }

    if (arg === "--help" || arg === "-h") {
      printUsage();
      process.exit(0);
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return args;
}

function printUsage(): void {
  console.log("Usage: npm run db:seed -- [--reset] [--truncate-only]");
  console.log("  --reset   Truncate seeded decision tables before inserting fixtures.");
  console.log("  --truncate-only   Truncate seeded decision tables and exit without inserting fixtures.");
}

async function resetDecisionTables(): Promise<void> {
  await getScriptPool().query("TRUNCATE TABLE decisions RESTART IDENTITY CASCADE");
}

async function deleteWorkflowRunsForDecision(decisionId: string): Promise<void> {
  await getScriptPool().query("DELETE FROM workflow_runs WHERE decision_id = $1", [decisionId]);
}

function asObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return value as Record<string, unknown>;
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0);
}

function buildDecisionSnapshotProperties(decision: SeedDecision): Record<string, unknown> {
  const properties: Record<string, unknown> = {
    "Decision Name": decision.name,
    Status: decision.status,
    Owner: decision.owner,
    "Review Date": decision.reviewDate,
    "Executive Summary": decision.summary,
    "Primary KPI": decision.primaryKpi,
    "Investment Required": decision.investmentRequired,
    "Strategic Objective": decision.strategicObjective,
    "Confidence Level": decision.confidence,
    Baseline: decision.baseline,
    Target: decision.target,
    "Time Horizon": decision.timeHorizon,
    "Probability of Success": decision.probabilityOfSuccess,
    "Strategic Leverage Score": decision.leverageScore,
    "Risk-Adjusted ROI": decision.riskAdjustedRoi,
    "12-Month Gross Benefit": decision.benefit12mGross,
    "Decision Type": decision.decisionType,
    Mitigations: decision.mitigations ?? [],
  };

  for (const [gateName, checked] of Object.entries(decision.governanceChecks)) {
    properties[gateName] = checked;
  }

  return properties;
}

function buildSeedWorkflowState(decision: SeedDecision): Record<string, unknown> {
  const outputs = decision.outputs;
  if (!outputs) {
    return {};
  }

  const workflowState = asObject(outputs.workflowRun.state);

  return {
    ...workflowState,
    decision_id: decision.id,
    decision_name: decision.name,
    status: outputs.workflowRun.workflowStatus,
    dqs: outputs.workflowRun.dqs,
    missing_sections: toStringArray(workflowState.missing_sections),
    decision_snapshot: {
      page_id: decision.id,
      captured_at: decision.reviewDate,
      properties: buildDecisionSnapshotProperties(decision),
      section_excerpt: [],
      computed: {
        inferred_governance_checks: decision.governanceChecks,
        autochecked_governance_fields: [],
      },
    },
    reviews: outputs.reviews,
    synthesis: outputs.synthesis,
    prd: outputs.prd,
  };
}

async function seedOneDecision(decision: SeedDecision): Promise<void> {
  await upsertDecisionRecord({
    id: decision.id,
    name: decision.name,
    status: decision.status,
    owner: decision.owner,
    reviewDate: decision.reviewDate,
    summary: decision.summary,
    primaryKpi: decision.primaryKpi,
    investmentRequired: decision.investmentRequired,
    strategicObjective: decision.strategicObjective,
    confidence: decision.confidence,
    baseline: decision.baseline,
    target: decision.target,
    timeHorizon: decision.timeHorizon,
    probabilityOfSuccess: decision.probabilityOfSuccess,
    leverageScore: decision.leverageScore,
    riskAdjustedRoi: decision.riskAdjustedRoi,
    benefit12mGross: decision.benefit12mGross,
    decisionType: decision.decisionType,
    mitigations: decision.mitigations ?? [],
    detailsUrl: decision.detailsUrl,
    createdAt: decision.reviewDate,
  });

  await upsertDecisionDocument(decision.id, decision.bodyText);
  await setDecisionGovernanceChecks(decision.id, decision.governanceChecks);

  if (!decision.outputs) {
    return;
  }

  for (const [agentName, reviewOutput] of Object.entries(decision.outputs.reviews)) {
    await upsertDecisionReview(decision.id, agentName, reviewOutput);
  }

  await upsertDecisionSynthesis(decision.id, decision.outputs.synthesis);
  await upsertDecisionPrd(decision.id, decision.outputs.prd);
  await deleteWorkflowRunsForDecision(decision.id);
  await recordWorkflowRun(
    decision.id,
    decision.outputs.workflowRun.dqs,
    decision.outputs.workflowRun.gateDecision,
    decision.outputs.workflowRun.workflowStatus,
    buildSeedWorkflowState(decision),
  );
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  if (!process.env.POSTGRES_URL) {
    throw new Error("POSTGRES_URL is required");
  }

  await checkDatabaseHealth();

  if (args.reset) {
    await resetDecisionTables();
    console.log("[seed] Truncated existing decision tables.");
  }

  if (args.truncateOnly) {
    console.log("[seed] Done (no fixtures inserted).");
    return;
  }

  for (const decision of SEED_DECISIONS) {
    await seedOneDecision(decision);
  }

  console.log(`[seed] Seeded ${SEED_DECISIONS.length} decisions.`);
  console.log("[seed] Done.");
}

main().catch((error) => {
  console.error("[seed] Failed:", error);
  process.exitCode = 1;
}).finally(async () => {
  await closeScriptPool();
});
