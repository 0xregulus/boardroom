import {
  type AgentContext,
  type ConfiguredComplianceAgent,
  type ConfiguredReviewAgent,
} from "../agents/base";
import { invalidReviewFallback } from "../agents/base_utils";
import { reviewOutputSchema, type ReviewOutput } from "../schemas/review_output";
import { GOVERNANCE_CHECKBOX_FIELDS } from "./gates";
import {
  buildInteractionDeltas,
  buildPeerReviewContext,
  summarizeInteractionRound,
} from "./decision_workflow_interactions";
import {
  createReviewAgent,
  resolveRuntimeConfig,
  type WorkflowDependencies,
} from "./decision_workflow_runtime";
import { deriveArtifactAssistantQuestions } from "./decision_workflow_assistant";
import { emitProviderFailureTrace } from "./decision_workflow_evidence";
import type { AgentInteractionRound, WorkflowState } from "./states";

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function getAgentReviewOutput(
  agent: ConfiguredReviewAgent | ConfiguredComplianceAgent,
  state: WorkflowState,
  missingSections: string[],
  memoryContext: Record<string, unknown> = {},
): Promise<ReviewOutput> {
  const context: AgentContext = {
    snapshot: state.decision_snapshot ? (state.decision_snapshot as unknown as Record<string, unknown>) : {},
    memory_context: {
      missing_sections: missingSections,
      governance_checkbox_fields: GOVERNANCE_CHECKBOX_FIELDS,
      ...memoryContext,
    },
  };

  const agentName = agent.name ?? "UnknownAgent";

  try {
    const rawReview = await agent.evaluate(context);
    const validated = reviewOutputSchema.safeParse(rawReview);

    if (!validated.success) {
      return invalidReviewFallback(agentName, "zod validation failed");
    }

    return validated.data;
  } catch {
    return invalidReviewFallback(agentName, "agent evaluate call failed");
  }
}

export async function runExecutiveReviews(state: WorkflowState, deps: WorkflowDependencies): Promise<WorkflowState> {
  const reviews: Record<string, ReviewOutput> = {};
  const sharedMemoryContext = {
    decision_ancestry: state.decision_ancestry ?? [],
    hygiene_score: state.hygiene_score ?? 0,
    hygiene_findings: state.hygiene_findings ?? [],
    market_intelligence: state.market_intelligence ?? null,
    risk_simulation: state.risk_simulation ?? null,
  };

  const promises = deps.agentConfigs.map(async (config, index) => {
    if (index > 0) {
      await sleep(Math.min(420, 90 * index));
    }
    const runtime = resolveRuntimeConfig(config, deps);
    deps.onAgentStart?.(runtime.id);
    const agent = createReviewAgent(runtime, deps);
    const output = await getAgentReviewOutput(agent, state, state.missing_sections, sharedMemoryContext);
    deps.onAgentFinish?.(runtime.id, output.score);
    emitProviderFailureTrace(deps, runtime.id, runtime.name, output);
    return {
      id: runtime.id,
      output,
    };
  });

  const results = await Promise.all(promises);
  for (const result of results) {
    reviews[result.id] = result.output;
  }

  const nextState: WorkflowState = {
    ...state,
    reviews,
    status: "REVIEWING",
  };

  return {
    ...nextState,
    artifact_assistant_questions: deriveArtifactAssistantQuestions(nextState),
  };
}

export async function runInteractionRounds(state: WorkflowState, deps: WorkflowDependencies): Promise<WorkflowState> {
  const initialReviewCount = Object.keys(state.reviews).length;
  if (deps.interactionRounds <= 0 || initialReviewCount < 2) {
    return state;
  }

  let updatedReviews = { ...state.reviews };
  const rounds: AgentInteractionRound[] = [];

  for (let round = 1; round <= deps.interactionRounds; round += 1) {
    const previousReviews = updatedReviews;
    const promises = deps.agentConfigs.map(async (config, index) => {
      const baseline = previousReviews[config.id];
      if (!baseline) {
        return { id: config.id, output: null as ReviewOutput | null };
      }

      if (index > 0) {
        await sleep(Math.min(320, 70 * index));
      }
      const runtime = resolveRuntimeConfig(config, deps);
      deps.onAgentStart?.(runtime.id);
      const agent = createReviewAgent(runtime, deps);
      const peerReviews = buildPeerReviewContext(previousReviews, config.id);

      const output = await getAgentReviewOutput(agent, state, state.missing_sections, {
        interaction_round: round,
        prior_self_review: baseline,
        peer_reviews: peerReviews,
        decision_ancestry: state.decision_ancestry ?? [],
        hygiene_score: state.hygiene_score ?? 0,
        hygiene_findings: state.hygiene_findings ?? [],
        market_intelligence: state.market_intelligence ?? null,
        risk_simulation: state.risk_simulation ?? null,
      });

      deps.onAgentFinish?.(runtime.id, output.score);
      emitProviderFailureTrace(deps, runtime.id, runtime.name, output);
      return { id: config.id, output };
    });

    const results = await Promise.all(promises);
    const revisedReviews: Record<string, ReviewOutput> = { ...previousReviews };
    for (const result of results) {
      if (result.output) {
        revisedReviews[result.id] = result.output;
      }
    }

    const deltas = buildInteractionDeltas(previousReviews, revisedReviews, deps.agentConfigs);
    rounds.push({
      round,
      summary: summarizeInteractionRound(round, deltas),
      deltas,
    });

    updatedReviews = revisedReviews;
  }

  const nextState: WorkflowState = {
    ...state,
    reviews: updatedReviews,
    interaction_rounds: rounds,
    status: "REVIEWING",
  };

  return {
    ...nextState,
    artifact_assistant_questions: deriveArtifactAssistantQuestions(nextState),
  };
}
