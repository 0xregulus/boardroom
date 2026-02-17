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

export const DQS_THRESHOLD = 7.0;
export const CORE_DQS_WEIGHTS: Record<string, number> = {
  ceo: 0.3,
  cfo: 0.25,
  cto: 0.25,
  compliance: 0.2,
};
export const EXTRA_AGENT_WEIGHT = 0.2;

export const STATUS_APPROVED = "Approved";
export const STATUS_BLOCKED = "Blocked";
export const STATUS_CHALLENGED = "Challenged";
export const STATUS_INCOMPLETE = "Incomplete";
export const STATUS_UNDER_EVALUATION = "Under Evaluation";

export type GateDecision = "approved" | "revision_required" | "blocked";

const DEFAULT_TEMPERATURE = 0.2;
const DEFAULT_MAX_TOKENS = 1200;
const MIN_TEMPERATURE = 0;
const MAX_TEMPERATURE = 1;
const MIN_MAX_TOKENS = 256;
const MAX_MAX_TOKENS = 8000;
const DEFAULT_MAX_BULK_RUN_DECISIONS = 50;
const MAX_BULK_RUN_DECISIONS = 500;
const DEFAULT_INTERACTION_ROUNDS = 1;
const MIN_INTERACTION_ROUNDS = 0;
const MAX_INTERACTION_ROUNDS = 3;

export interface WorkflowDependencies {
  providerClients: ProviderClientRegistry;
  defaultProvider: AgentConfig["provider"];
  modelName: string;
  temperature: number;
  maxTokens: number;
  interactionRounds: number;
  includeExternalResearch: boolean;
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
    interactionRounds,
    includeExternalResearch,
    agentConfigs,
    hasCustomAgentConfigs,
  };
}
