import type { AgentRuntimeOptions } from "../agents/base";
import {
  ConfiguredComplianceAgent,
  ConfiguredReviewAgent,
} from "../agents/base";
import type { AgentConfig } from "../config/agent_config";
import { buildDefaultAgentConfigs, normalizeAgentConfigs } from "../config/agent_config";
import { resolveModelForProvider, resolveProvider } from "../config/llm_providers";
import { ProviderClientRegistry } from "../llm/client";
import type { WorkflowState, RunWorkflowOptions } from "./states";
import {
  DEFAULT_TEMPERATURE,
  DEFAULT_MAX_TOKENS,
  MIN_TEMPERATURE,
  MAX_TEMPERATURE,
  MIN_MAX_TOKENS,
  MAX_MAX_TOKENS,
  DEFAULT_MAX_BULK_RUN_DECISIONS,
  MAX_BULK_RUN_DECISIONS,
  DEFAULT_INTERACTION_ROUNDS,
  MIN_INTERACTION_ROUNDS,
  MAX_INTERACTION_ROUNDS,
} from "./constants";

export type GateDecision = "approved" | "revision_required" | "blocked";


export interface WorkflowDependencies {
  providerClients: ProviderClientRegistry;
  defaultProvider: AgentConfig["provider"];
  modelName: string;
  temperature: number;
  maxTokens: number;
  interactionRounds: number;
  includeExternalResearch: boolean;
  includeRedTeamPersonas: boolean;
  agentConfigs: AgentConfig[];
  hasCustomAgentConfigs: boolean;
}

export interface ResolvedAgentRuntimeConfig extends AgentConfig {
  model: string;
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

function executionModel(config: AgentConfig, candidate?: string): string {
  return resolveModelForProvider(config.provider, candidate ?? config.model);
}

function parseBooleanFlag(value: unknown): boolean {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
  }

  return false;
}

function buildRedTeamPersonas(
  provider: AgentConfig["provider"],
  fallbackModel: string,
  temperature: number,
  maxTokens: number,
): AgentConfig[] {
  const resolvedModel = resolveModelForProvider(provider, fallbackModel);

  return [
    {
      id: "pre-mortem",
      role: "Pre-Mortem",
      name: "Pre-Mortem Failure Agent",
      provider,
      model: resolvedModel,
      temperature,
      maxTokens,
      systemMessage:
        "You are a red-team pre-mortem analyst. Assume this project failed one year from now and explain why with concrete failure paths, triggers, and overlooked assumptions.",
      userMessage:
        "Run a pre-mortem review of the strategic decision. Work backward from failure in 12 months. Identify specific failure chains, leading indicators that would have predicted failure, and hard stop criteria. Return strict JSON schema.",
    },
    {
      id: "resource-competitor",
      role: "Resource Competitor",
      name: "Resource Competition Agent",
      provider,
      model: resolvedModel,
      temperature,
      maxTokens,
      systemMessage:
        "You are a capital allocation challenger. Your job is to argue that this initiative should lose funding to alternative priorities unless the proposal demonstrates superior risk-adjusted return.",
      userMessage:
        "Challenge this strategy from a resource competition perspective. Explain why capital should be reallocated elsewhere unless this proposal clearly dominates alternatives on ROI, strategic leverage, and execution risk. Return strict JSON schema.",
    },
  ];
}

export function resolveRuntimeConfig(config: AgentConfig, deps: WorkflowDependencies): ResolvedAgentRuntimeConfig {
  const useGlobalRuntime = !deps.hasCustomAgentConfigs;

  if (useGlobalRuntime) {
    return {
      ...config,
      model: executionModel(config, deps.modelName),
      temperature: deps.temperature,
      maxTokens: deps.maxTokens,
    };
  }

  return {
    ...config,
    model: executionModel(config),
  };
}

function buildAgentRuntimeOptions(runtime: ResolvedAgentRuntimeConfig, deps: WorkflowDependencies): AgentRuntimeOptions {
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

  return options;
}

export function createReviewAgent(
  runtime: ResolvedAgentRuntimeConfig,
  deps: WorkflowDependencies,
): ConfiguredReviewAgent | ConfiguredComplianceAgent {
  const client = deps.providerClients.getResilientClient(runtime.provider);
  const options = buildAgentRuntimeOptions(runtime, deps);

  return runtime.id === "compliance"
    ? new ConfiguredComplianceAgent(client, runtime.model, runtime.temperature, runtime.maxTokens, options)
    : new ConfiguredReviewAgent(
      runtime.role.trim().length > 0 ? runtime.role : runtime.name,
      client,
      runtime.model,
      runtime.temperature,
      runtime.maxTokens,
      options,
    );
}

export function initialState(options: RunWorkflowOptions): WorkflowState {
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
    interaction_rounds: [],
    decision_ancestry: [],
    decision_ancestry_retrieval_method: "lexical-fallback",
    hygiene_score: 0,
    substance_score: 0,
    confidence_score: 0,
    dissent_penalty: 0,
    confidence_penalty: 0,
    hygiene_findings: [],
    artifact_assistant_questions: [],
    chairperson_evidence_citations: [],
    market_intelligence: null,
    evidence_verification: null,
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

function clampInteractionRounds(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return DEFAULT_INTERACTION_ROUNDS;
  }

  return Math.min(MAX_INTERACTION_ROUNDS, Math.max(MIN_INTERACTION_ROUNDS, Math.round(value)));
}

export function maxBulkRunDecisions(): number {
  const raw = Number(process.env.BOARDROOM_MAX_BULK_RUN_DECISIONS ?? DEFAULT_MAX_BULK_RUN_DECISIONS);
  if (!Number.isFinite(raw)) {
    return DEFAULT_MAX_BULK_RUN_DECISIONS;
  }

  return Math.max(1, Math.min(MAX_BULK_RUN_DECISIONS, Math.round(raw)));
}

export function buildDependencies(options?: Partial<RunWorkflowOptions>): WorkflowDependencies {
  const modelName = options?.modelName ?? process.env.BOARDROOM_MODEL ?? "gpt-4o-mini";
  const temperature = clampTemperature(options?.temperature);
  const maxTokens = clampMaxTokens(options?.maxTokens);
  const interactionRounds = clampInteractionRounds(options?.interactionRounds);
  const includeExternalResearch = options?.includeExternalResearch ?? false;
  const includeRedTeamPersonas =
    options?.includeRedTeamPersonas ?? parseBooleanFlag(process.env.BOARDROOM_INCLUDE_RED_TEAM_PERSONAS);
  const defaultProvider = resolveProvider(process.env.BOARDROOM_PROVIDER);
  let agentConfigs = normalizeAgentConfigs(options?.agentConfigs);
  const defaultAgentConfigs = buildDefaultAgentConfigs();
  const hasCustomAgentConfigsBase =
    Array.isArray(options?.agentConfigs) && !isSameAgentConfigSet(agentConfigs, defaultAgentConfigs);
  if (includeRedTeamPersonas) {
    const personas = buildRedTeamPersonas(defaultProvider, modelName, temperature, maxTokens);
    const existing = new Set(agentConfigs.map((config) => config.id));
    for (const persona of personas) {
      if (!existing.has(persona.id)) {
        agentConfigs = [...agentConfigs, persona];
      }
    }
  }

  const hasCustomAgentConfigs = hasCustomAgentConfigsBase || includeRedTeamPersonas;
  const providerClients = new ProviderClientRegistry();

  return {
    providerClients,
    defaultProvider,
    modelName,
    temperature,
    maxTokens,
    interactionRounds,
    includeExternalResearch,
    includeRedTeamPersonas,
    agentConfigs,
    hasCustomAgentConfigs,
  };
}
