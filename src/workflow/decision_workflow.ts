import { listProposedDecisionIds } from "../store/postgres";
import { deriveArtifactAssistantQuestions } from "./decision_workflow_assistant";
import { runEvidenceVerification } from "./decision_workflow_evidence";
import {
  buildDependencies,
  initialState,
  maxBulkRunDecisions,
  type WorkflowDependencies,
} from "./decision_workflow_runtime";
import { runMarketIntelligence } from "./decision_workflow_market";
import {
  buildDecisionState,
  decideGate,
  generatePrd,
  persistArtifacts,
  synthesizeReviews,
} from "./decision_workflow_lifecycle";
import { runExecutiveReviews, runInteractionRounds } from "./decision_workflow_review_execution";
import { calculateDqs } from "./decision_workflow_scoring";
import type { RunWorkflowOptions, WorkflowState } from "./states";

async function runSingleWorkflowPipeline(state: WorkflowState, deps: WorkflowDependencies): Promise<WorkflowState> {
  let current = state;
  current = await buildDecisionState(current);
  current = await runMarketIntelligence(current, deps);
  current = await runExecutiveReviews(current, deps);
  current = await runInteractionRounds(current, deps);
  current = runEvidenceVerification(current, deps);
  current = calculateDqs(current);
  current = await synthesizeReviews(current, deps);
  current = {
    ...current,
    artifact_assistant_questions: deriveArtifactAssistantQuestions(current),
  };

  const gateDecision = await decideGate(current);

  if (gateDecision === "approved") {
    current = generatePrd(current);
  }

  return persistArtifacts(current, gateDecision);
}

export async function runDecisionWorkflow(options: RunWorkflowOptions): Promise<WorkflowState> {
  const deps = buildDependencies(options);
  const state = initialState(options);
  return runSingleWorkflowPipeline(state, deps);
}

export async function runAllProposedDecisions(options?: Partial<RunWorkflowOptions>): Promise<WorkflowState[]> {
  const deps = buildDependencies(options);
  const proposedDecisionIds = await listProposedDecisionIds();
  const maxBulkRuns = maxBulkRunDecisions();

  if (proposedDecisionIds.length > maxBulkRuns) {
    throw new Error(`Bulk run limit exceeded: ${proposedDecisionIds.length} decisions exceed limit ${maxBulkRuns}`);
  }

  const states: WorkflowState[] = [];

  for (const decisionId of proposedDecisionIds) {
    const state = initialState({
      decisionId,
      userContext: options?.userContext,
      businessConstraints: options?.businessConstraints,
      strategicGoals: options?.strategicGoals,
      modelName: options?.modelName,
      temperature: options?.temperature,
      maxTokens: options?.maxTokens,
      interactionRounds: options?.interactionRounds,
    });

    states.push(await runSingleWorkflowPipeline(state, deps));
  }

  return states;
}
