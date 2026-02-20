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
    decision.outputs.workflowRun.state,
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
