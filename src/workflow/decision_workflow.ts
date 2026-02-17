import type { AgentConfig } from "../config/agent_config";
import { resolveModelForProvider } from "../config/llm_providers";
import {
  AgentContext,
  ConfiguredChairpersonAgent,
  ConfiguredComplianceAgent,
  ConfiguredReviewAgent,
} from "../agents/base";
import { reviewOutputSchema, ReviewOutput } from "../schemas/review_output";
import {
  getDecisionForWorkflow,
  listProposedDecisionIds,
  recordWorkflowRun,
  updateDecisionStatus,
  upsertDecisionPrd,
  upsertDecisionReview,
  upsertDecisionSynthesis,
  upsertGovernanceChecks,
} from "../store/postgres";
import { evaluateRequiredGates, GOVERNANCE_CHECKBOX_FIELDS, inferGovernanceChecksFromText } from "./gates";
import { buildPrdOutput } from "./prd";
import {
  AgentInteractionRound,
  RunWorkflowOptions,
  WorkflowState,
} from "./states";
import {
  buildDependencies,
  CORE_DQS_WEIGHTS,
  createReviewAgent,
  DQS_THRESHOLD,
  EXTRA_AGENT_WEIGHT,
  type GateDecision,
  initialState,
  maxBulkRunDecisions,
  resolveRuntimeConfig,
  STATUS_APPROVED,
  STATUS_BLOCKED,
  STATUS_CHALLENGED,
  STATUS_INCOMPLETE,
  STATUS_UNDER_EVALUATION,
  type WorkflowDependencies,
} from "./decision_workflow_runtime";
import {
  buildInteractionDeltas,
  buildPeerReviewContext,
  summarizeInteractionRound,
} from "./decision_workflow_interactions";

function invalidReviewFallback(agentName: string, reason: string): ReviewOutput {
  return {
    agent: agentName,
    thesis: `${agentName} review output was invalid and requires manual follow-up.`,
    score: 1,
    confidence: 0,
    blocked: true,
    blockers: [`Invalid review output schema: ${reason}`],
    risks: [
      {
        type: "schema_validation",
        severity: 9,
        evidence: "LLM response did not match required ReviewOutput schema.",
      },
    ],
    required_changes: ["Regenerate review with strict JSON schema compliance."],
    approval_conditions: [],
    apga_impact_view: "Unknown due to invalid review output.",
    governance_checks_met: {},
  };
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

async function buildDecisionState(state: WorkflowState): Promise<WorkflowState> {
  const decision = await getDecisionForWorkflow(state.decision_id);
  if (!decision) {
    throw new Error(`Decision ${state.decision_id} was not found in PostgreSQL`);
  }

  const bodyText = decision.bodyText;
  const inferredChecks = inferGovernanceChecksFromText(bodyText);
  const autocheckedFields = Object.entries(inferredChecks)
    .filter(([gate, isMet]) => isMet && !decision.governanceChecks[gate])
    .map(([gate]) => gate);

  if (autocheckedFields.length > 0) {
    await upsertGovernanceChecks(state.decision_id, autocheckedFields);
  }

  const mergedChecks: Record<string, boolean> = { ...decision.governanceChecks };
  for (const gate of Object.keys(inferredChecks)) {
    mergedChecks[gate] = Boolean(mergedChecks[gate] || inferredChecks[gate]);
  }

  const properties: Record<string, unknown> = { ...decision.properties };
  for (const [gate, isChecked] of Object.entries(mergedChecks)) {
    properties[gate] = isChecked;
  }

  const missingSections = evaluateRequiredGates(properties, inferredChecks);
  const statusValue = missingSections.length === 0 ? STATUS_UNDER_EVALUATION : STATUS_INCOMPLETE;
  await updateDecisionStatus(state.decision_id, statusValue);

  const decisionName = decision.name.trim().length > 0 ? decision.name : `Untitled Decision ${state.decision_id}`;

  return {
    ...state,
    decision_snapshot: {
      page_id: decision.id,
      captured_at: decision.createdAt,
      properties,
      section_excerpt: [{ type: "text", text: { content: bodyText.slice(0, 12000) } }],
      computed: {
        inferred_governance_checks: inferredChecks,
        autochecked_governance_fields: autocheckedFields.sort(),
      },
    },
    status: "PROPOSED",
    missing_sections: missingSections,
    decision_name: decisionName,
  };
}

async function runExecutiveReviews(state: WorkflowState, deps: WorkflowDependencies): Promise<WorkflowState> {
  const reviews: Record<string, ReviewOutput> = {};

  const promises = deps.agentConfigs.map(async (config) => {
    const runtime = resolveRuntimeConfig(config, deps);
    const agent = createReviewAgent(runtime, deps);
    return { id: runtime.id, output: await getAgentReviewOutput(agent, state, state.missing_sections) };
  });

  const results = await Promise.all(promises);
  for (const result of results) {
    reviews[result.id] = result.output;
  }

  return {
    ...state,
    reviews,
    status: "REVIEWING",
  };
}

async function runInteractionRounds(state: WorkflowState, deps: WorkflowDependencies): Promise<WorkflowState> {
  const initialReviewCount = Object.keys(state.reviews).length;
  if (deps.interactionRounds <= 0 || initialReviewCount < 2) {
    return state;
  }

  let updatedReviews = { ...state.reviews };
  const rounds: AgentInteractionRound[] = [];

  for (let round = 1; round <= deps.interactionRounds; round += 1) {
    const previousReviews = updatedReviews;
    const promises = deps.agentConfigs.map(async (config) => {
      const baseline = previousReviews[config.id];
      if (!baseline) {
        return { id: config.id, output: null as ReviewOutput | null };
      }

      const runtime = resolveRuntimeConfig(config, deps);
      const agent = createReviewAgent(runtime, deps);
      const peerReviews = buildPeerReviewContext(previousReviews, config.id);

      const output = await getAgentReviewOutput(agent, state, state.missing_sections, {
        interaction_round: round,
        prior_self_review: baseline,
        peer_reviews: peerReviews,
      });

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

  return {
    ...state,
    reviews: updatedReviews,
    interaction_rounds: rounds,
    status: "REVIEWING",
  };
}

async function synthesizeReviews(state: WorkflowState, deps: WorkflowDependencies): Promise<WorkflowState> {
  const chairpersonModel = resolveModelForProvider(deps.defaultProvider, deps.modelName);
  const chairpersonAgent = new ConfiguredChairpersonAgent(
    deps.providerClients.getResilientClient(deps.defaultProvider),
    chairpersonModel,
    deps.temperature,
    500,
    {
      provider: deps.defaultProvider,
    },
  );
  const chairpersonSnapshot = {
    ...(state.decision_snapshot ?? {}),
    reviews: Object.values(state.reviews),
  };

  const synthesis = await chairpersonAgent.evaluate({
    snapshot: chairpersonSnapshot,
    memory_context: {},
  });

  return {
    ...state,
    synthesis,
    status: "SYNTHESIZED",
  };
}

function calculateDqs(state: WorkflowState): WorkflowState {
  const reviewEntries = Object.entries(state.reviews);
  if (reviewEntries.length === 0) {
    return {
      ...state,
      dqs: 0,
    };
  }

  let weightedScore = 0;
  let totalWeight = 0;

  for (const [agentId, review] of reviewEntries) {
    const weight = CORE_DQS_WEIGHTS[agentId] ?? EXTRA_AGENT_WEIGHT;
    weightedScore += review.score * weight;
    totalWeight += weight;
  }

  const dqs = totalWeight > 0 ? weightedScore / totalWeight : 0;

  return {
    ...state,
    dqs,
  };
}

async function decideGate(state: WorkflowState): Promise<GateDecision> {
  const anyBlocked = Object.values(state.reviews).some((review) => review.blocked);

  if (anyBlocked) {
    await updateDecisionStatus(state.decision_id, STATUS_BLOCKED);
    return "blocked";
  }

  if (state.dqs < DQS_THRESHOLD) {
    await updateDecisionStatus(state.decision_id, STATUS_CHALLENGED);
    return "revision_required";
  }

  await updateDecisionStatus(state.decision_id, STATUS_APPROVED);
  return "approved";
}

function generatePrd(state: WorkflowState): WorkflowState {
  return {
    ...state,
    prd: buildPrdOutput(state),
    status: "DECIDED",
  };
}

async function persistArtifacts(state: WorkflowState, gateDecision: GateDecision): Promise<WorkflowState> {
  for (const [agentName, reviewOutput] of Object.entries(state.reviews)) {
    await upsertDecisionReview(state.decision_id, agentName, reviewOutput);
  }

  if (state.synthesis) {
    await upsertDecisionSynthesis(state.decision_id, state.synthesis);

    const chairpersonReview: ReviewOutput = {
      agent: "Chairperson",
      thesis: state.synthesis.executive_summary,
      score: Math.max(1, Math.min(10, Math.round(state.dqs))),
      confidence: 1,
      blocked: state.synthesis.final_recommendation === STATUS_BLOCKED,
      blockers: state.synthesis.blockers,
      risks: [],
      required_changes: state.synthesis.required_revisions,
      approval_conditions: [],
      apga_impact_view: "N/A",
      governance_checks_met: {},
    };

    await upsertDecisionReview(state.decision_id, "Chairperson", chairpersonReview);
  }

  if (state.status === "DECIDED" && state.prd) {
    await upsertDecisionPrd(state.decision_id, state.prd);
  }

  await recordWorkflowRun(
    state.decision_id,
    state.dqs,
    gateDecision,
    state.status,
    state as unknown as Record<string, unknown>,
  );

  return {
    ...state,
    status: "PERSISTED",
  };
}

export async function runDecisionWorkflow(options: RunWorkflowOptions): Promise<WorkflowState> {
  const deps = buildDependencies(options);

  let state = initialState(options);
  state = await buildDecisionState(state);
  state = await runExecutiveReviews(state, deps);
  state = await runInteractionRounds(state, deps);
  state = await synthesizeReviews(state, deps);
  state = calculateDqs(state);

  const gateDecision = await decideGate(state);

  if (gateDecision === "approved") {
    state = generatePrd(state);
  }

  state = await persistArtifacts(state, gateDecision);
  return state;
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
    let state = initialState({
      decisionId,
      userContext: options?.userContext,
      businessConstraints: options?.businessConstraints,
      strategicGoals: options?.strategicGoals,
      modelName: options?.modelName,
      temperature: options?.temperature,
      maxTokens: options?.maxTokens,
      interactionRounds: options?.interactionRounds,
    });

    state = await buildDecisionState(state);
    state = await runExecutiveReviews(state, deps);
    state = await runInteractionRounds(state, deps);
    state = await synthesizeReviews(state, deps);
    state = calculateDqs(state);

    const gateDecision = await decideGate(state);
    if (gateDecision === "approved") {
      state = generatePrd(state);
    }

    state = await persistArtifacts(state, gateDecision);
    states.push(state);
  }

  return states;
}
