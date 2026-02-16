import { AgentConfig, buildDefaultAgentConfigs, normalizeAgentConfigs } from "../config/agent_config";
import { resolveModelForProvider, resolveProvider } from "../config/llm_providers";
import {
  AgentContext,
  AgentRuntimeOptions,
  ConfiguredChairpersonAgent,
  ConfiguredComplianceAgent,
  ConfiguredReviewAgent,
} from "../agents/base";
import { ProviderClientRegistry } from "../llm/client";
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
import { RunWorkflowOptions, WorkflowState } from "./states";

const DQS_THRESHOLD = 7.0;

const CORE_DQS_WEIGHTS: Record<string, number> = {
  ceo: 0.3,
  cfo: 0.25,
  cto: 0.25,
  compliance: 0.2,
};
const EXTRA_AGENT_WEIGHT = 0.2;

const STATUS_APPROVED = "Approved";
const STATUS_BLOCKED = "Blocked";
const STATUS_CHALLENGED = "Challenged";
const STATUS_INCOMPLETE = "Incomplete";
const STATUS_UNDER_EVALUATION = "Under Evaluation";

type GateDecision = "approved" | "revision_required" | "blocked";

const DEFAULT_TEMPERATURE = 0.2;
const DEFAULT_MAX_TOKENS = 1200;
const MIN_TEMPERATURE = 0;
const MAX_TEMPERATURE = 1;
const MIN_MAX_TOKENS = 256;
const MAX_MAX_TOKENS = 8000;

interface WorkflowDependencies {
  providerClients: ProviderClientRegistry;
  defaultProvider: AgentConfig["provider"];
  modelName: string;
  temperature: number;
  maxTokens: number;
  includeExternalResearch: boolean;
  agentConfigs: AgentConfig[];
  hasCustomAgentConfigs: boolean;
}

function isSameAgentConfig(left: AgentConfig, right: AgentConfig): boolean {
  return (
    left.id === right.id &&
    left.role === right.role &&
    left.name === right.name &&
    left.systemMessage === right.systemMessage &&
    left.userMessage === right.userMessage &&
    left.provider === right.provider &&
    left.model === right.model &&
    left.temperature === right.temperature &&
    left.maxTokens === right.maxTokens
  );
}

function isSameAgentConfigSet(left: AgentConfig[], right: AgentConfig[]): boolean {
  if (left.length !== right.length) {
    return false;
  }

  const byId = new Map(right.map((config) => [config.id, config]));
  for (const candidate of left) {
    const baseline = byId.get(candidate.id);
    if (!baseline || !isSameAgentConfig(candidate, baseline)) {
      return false;
    }
  }

  return true;
}

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
): Promise<ReviewOutput> {
  const context: AgentContext = {
    snapshot: state.decision_snapshot ? (state.decision_snapshot as unknown as Record<string, unknown>) : {},
    memory_context: {
      missing_sections: missingSections,
      governance_checkbox_fields: GOVERNANCE_CHECKBOX_FIELDS,
    },
  };

  const agentName = (agent as unknown as { name?: string }).name ?? "UnknownAgent";

  try {
    const rawReview = (await agent.evaluate(context)) as unknown;
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

function executionModel(config: AgentConfig, candidate?: string): string {
  return resolveModelForProvider(config.provider, candidate ?? config.model);
}

async function runExecutiveReviews(state: WorkflowState, deps: WorkflowDependencies): Promise<WorkflowState> {
  const useGlobalRuntime = !deps.hasCustomAgentConfigs;
  const reviews: Record<string, ReviewOutput> = {};

  for (const config of deps.agentConfigs) {
    const runtime = useGlobalRuntime
      ? {
          ...config,
          model: executionModel(config, deps.modelName),
          temperature: deps.temperature,
          maxTokens: deps.maxTokens,
        }
      : {
          ...config,
          model: executionModel(config),
        };

    const client = deps.providerClients.getClient(runtime.provider);
    const options: AgentRuntimeOptions = {
      displayName: runtime.name,
      provider: runtime.provider,
      includeExternalResearch: deps.includeExternalResearch,
    };
    if (deps.hasCustomAgentConfigs) {
      options.promptOverride = {
        systemMessage: runtime.systemMessage,
        userTemplate: runtime.userMessage,
      };
    }

    const agent =
      runtime.id === "compliance"
        ? new ConfiguredComplianceAgent(client, runtime.model, runtime.temperature, runtime.maxTokens, options)
        : new ConfiguredReviewAgent(
            runtime.role.trim().length > 0 ? runtime.role : runtime.name,
            client,
            runtime.model,
            runtime.temperature,
            runtime.maxTokens,
            options,
          );

    reviews[runtime.id] = await getAgentReviewOutput(agent, state, state.missing_sections);
  }

  return {
    ...state,
    reviews,
    status: "REVIEWING",
  };
}

async function synthesizeReviews(state: WorkflowState, deps: WorkflowDependencies): Promise<WorkflowState> {
  const chairpersonModel = resolveModelForProvider(deps.defaultProvider, deps.modelName);
  const chairpersonAgent = new ConfiguredChairpersonAgent(
    deps.providerClients.getClient(deps.defaultProvider),
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

function initialState(options: RunWorkflowOptions): WorkflowState {
  return {
    decision_id: options.decisionId,
    user_context: options.userContext ?? {},
    business_constraints: options.businessConstraints ?? {},
    strategic_goals: options.strategicGoals ?? [],
    decision_snapshot: null,
    reviews: {},
    dqs: 0,
    status: "PROPOSED",
    synthesis: null,
    prd: null,
    missing_sections: [],
    decision_name: `Decision ${options.decisionId}`,
  };
}

function clampTemperature(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return DEFAULT_TEMPERATURE;
  }

  return Math.min(MAX_TEMPERATURE, Math.max(MIN_TEMPERATURE, Number(value.toFixed(2))));
}

function clampMaxTokens(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return DEFAULT_MAX_TOKENS;
  }

  return Math.min(MAX_MAX_TOKENS, Math.max(MIN_MAX_TOKENS, Math.round(value)));
}

function buildDependencies(options?: Partial<RunWorkflowOptions>): WorkflowDependencies {
  const modelName = options?.modelName ?? process.env.BOARDROOM_MODEL ?? "gpt-4o-mini";
  const temperature = clampTemperature(options?.temperature);
  const maxTokens = clampMaxTokens(options?.maxTokens);
  const includeExternalResearch = options?.includeExternalResearch ?? false;
  const agentConfigs = normalizeAgentConfigs(options?.agentConfigs);
  const defaultAgentConfigs = buildDefaultAgentConfigs();
  const hasCustomAgentConfigs =
    Array.isArray(options?.agentConfigs) && !isSameAgentConfigSet(agentConfigs, defaultAgentConfigs);
  const defaultProvider = resolveProvider(process.env.BOARDROOM_PROVIDER);
  const providerClients = new ProviderClientRegistry();

  return {
    providerClients,
    defaultProvider,
    modelName,
    temperature,
    maxTokens,
    includeExternalResearch,
    agentConfigs,
    hasCustomAgentConfigs,
  };
}

export async function runDecisionWorkflow(options: RunWorkflowOptions): Promise<WorkflowState> {
  const deps = buildDependencies(options);

  let state = initialState(options);
  state = await buildDecisionState(state);
  state = await runExecutiveReviews(state, deps);
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
    });

    state = await buildDecisionState(state);
    state = await runExecutiveReviews(state, deps);
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
