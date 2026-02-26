import type { LLMProvider } from "./llm_providers";
import { resolveModelForProvider, resolveProvider } from "./llm_providers";
import { getPromptDefinition } from "../prompts";

export type { LLMProvider, LLMProviderOption } from "./llm_providers";
export { PROVIDER_MODEL_OPTIONS, providerOptions, resolveModelForProvider } from "./llm_providers";

export type AgentId = string;
export type AgentRole = string;

export interface AgentConfig {
  id: AgentId;
  role: AgentRole;
  name: string;
  systemMessage: string;
  userMessage: string;
  provider: LLMProvider;
  model: string;
  temperature: number;
  maxTokens: number;
}

export const CORE_AGENT_ORDER = ["ceo", "cfo", "cto", "compliance"] as const;
export type CoreAgentId = (typeof CORE_AGENT_ORDER)[number];

export const AGENT_ORDER = [...CORE_AGENT_ORDER];

const DEFAULT_CUSTOM_PROFILE: Omit<AgentConfig, "id"> = {
  role: "Reviewer",
  name: "Custom Review Agent",
  systemMessage:
    "ROLE: Boardroom Executive Reviewer. Evaluate strategic initiatives as capital investments. Use HYGIENE and SUBSTANCE discipline, stress-test downside risk, integrate Tavily evidence when provided, rebut contradictory peer logic in interaction rounds, and score conservatively unless evidence is strong.",
  userMessage:
    "Review the strategic decision brief from your perspective. Return strict JSON and make blockers, risks, and required changes explicit.",
  provider: "OpenAI",
  model: "gpt-4o-mini",
  temperature: 0.35,
  maxTokens: 1700,
};

const DEFAULT_CEO_PROMPT = getPromptDefinition("ceo");
const DEFAULT_CFO_PROMPT = getPromptDefinition("cfo");
const DEFAULT_CTO_PROMPT = getPromptDefinition("cto");
const DEFAULT_COMPLIANCE_PROMPT = getPromptDefinition("compliance");

const DEFAULT_AGENT_PROFILES: Record<CoreAgentId, Omit<AgentConfig, "id">> = {
  ceo: {
    role: "CEO",
    name: "Chief Executive Officer Agent",
    systemMessage:
      DEFAULT_CEO_PROMPT?.systemMessage ??
      "ROLE: Boardroom Executive Reviewer (CEO). Evaluate as a capital investment, not a feature proposal. Focus on strategic alignment, market positioning, and durable moat. Stress-test opportunity cost and long-term viability. Integrate Tavily evidence when available and challenge contradictory peer assumptions.",
    userMessage:
      DEFAULT_CEO_PROMPT?.userTemplate ??
      "Review from the CEO lens. Determine whether this initiative strengthens strategic moat versus distracting from core objectives. Return strict JSON with evidence-grounded scoring.",
    provider: "OpenAI",
    model: "gpt-4o",
    temperature: 0.55,
    maxTokens: 2000,
  },
  cfo: {
    role: "CFO",
    name: "Chief Financial Officer Agent",
    systemMessage:
      DEFAULT_CFO_PROMPT?.systemMessage ??
      "ROLE: Boardroom Executive Reviewer (CFO). Evaluate as a capital investment. Focus on capital efficiency, runway impact, risk-adjusted ROI, downside sensitivity, and payback. Force explicit resource trade-offs and reject unsupported optimism. Integrate Tavily evidence when available.",
    userMessage:
      DEFAULT_CFO_PROMPT?.userTemplate ??
      "Review from the CFO lens. Challenge sunk-cost bias and weak assumptions. Make blockers and required revisions explicit in strict JSON.",
    provider: "OpenAI",
    model: "gpt-4o",
    temperature: 0.25,
    maxTokens: 1700,
  },
  cto: {
    role: "CTO",
    name: "Chief Technology Officer Agent",
    systemMessage:
      DEFAULT_CTO_PROMPT?.systemMessage ??
      "ROLE: Boardroom Executive Reviewer (CTO). Evaluate as a capital investment through technical feasibility. Focus on architecture resilience, implementation complexity, integration bottlenecks, technical debt, scalability, and reliability. Surface hidden execution risk and use Tavily evidence when available.",
    userMessage:
      DEFAULT_CTO_PROMPT?.userTemplate ??
      "Review from the CTO lens. Emphasize execution feasibility and identify architecture or integration blockers. Return strict JSON.",
    provider: "Anthropic",
    model: "claude-3-5-sonnet-latest",
    temperature: 0.45,
    maxTokens: 2300,
  },
  compliance: {
    role: "Compliance",
    name: "General Counsel & Compliance Agent",
    systemMessage:
      DEFAULT_COMPLIANCE_PROMPT?.systemMessage ??
      "ROLE: Boardroom Executive Reviewer (Compliance/Legal). Evaluate as a governance-critical capital decision. Focus on legal exposure, regulatory obligations, privacy controls, ethics, and governance gates. Treat missing compliance evidence as material risk and use Tavily for recent policy shifts when available.",
    userMessage:
      DEFAULT_COMPLIANCE_PROMPT?.userTemplate ??
      "Review from the Compliance/Legal lens. Identify unresolved regulatory and governance gaps and return strict JSON with blockers, risks, and required changes.",
    provider: "OpenAI",
    model: "gpt-4o-mini",
    temperature: 0.12,
    maxTokens: 1400,
  },
};

const RUNTIME_CONTEXT_SUFFIX = [
  "Strategic Decision Snapshot: {snapshot_json}",
  "Missing sections flagged: {missing_sections_str}",
  "Evaluate the following governance checks (set true if met, false otherwise): {governance_checkbox_fields_str}",
  "Return strict JSON with thesis, score, blockers, risks, required_changes, approval_conditions, governance_checks_met, and apga_impact_view.",
];

const LEGACY_CORE_USER_MESSAGE_DEFAULTS: Record<CoreAgentId, readonly string[]> = {
  ceo: [
    "Review the strategic decision brief. Return a JSON assessment with thesis, score, blockers, risks, required_changes, approval_conditions, and governance_checks_met. Prioritize strategic clarity, decision quality, and organizational alignment.",
    [
      "Review the following strategic decision. Pay close attention to strategic alignment, potential missed opportunities, and long-term business leverage.",
      ...RUNTIME_CONTEXT_SUFFIX,
    ].join("\n"),
  ],
  cfo: [
    "Evaluate the financial quality of this proposal. Return strict JSON with capital allocation strengths, major risks, blockers, and required changes. Emphasize downside modeling and confidence in assumptions.",
    [
      "Review the following strategic decision. Pay close attention to financial projections, required investment, potential returns, and downside exposure.",
      ...RUNTIME_CONTEXT_SUFFIX,
    ].join("\n"),
  ],
  cto: [
    "Assess technical feasibility and execution risk in strict JSON. Identify engineering blockers, architecture tradeoffs, long-term maintenance impact, and required design/implementation mitigations.",
    [
      "Review the following strategic decision. Pay close attention to feasibility, architecture impact, scalability constraints, and execution risk.",
      ...RUNTIME_CONTEXT_SUFFIX,
    ].join("\n"),
  ],
  compliance: [
    "Review this proposal for legal and compliance risk. Return strict JSON with explicit blockers, required remediations, and governance checks. Flag unresolved compliance concerns decisively.",
    [
      "Review the following strategic decision. Pay close attention to regulatory conflicts, legal liabilities, data handling practices, and ethical concerns.",
      ...RUNTIME_CONTEXT_SUFFIX,
    ].join("\n"),
  ],
};

function normalizeProvider(value: unknown): LLMProvider {
  return resolveProvider(value);
}

function sanitizeAgentId(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return normalized.length > 0 ? normalized : null;
}

export function isCoreAgentId(value: unknown): value is CoreAgentId {
  return typeof value === "string" && (CORE_AGENT_ORDER as readonly string[]).includes(value);
}

export function isAgentId(value: unknown): value is AgentId {
  return typeof value === "string" && sanitizeAgentId(value) !== null;
}

export function buildDefaultAgentConfigs(): AgentConfig[] {
  return CORE_AGENT_ORDER.map((id) => ({ id, ...DEFAULT_AGENT_PROFILES[id] }));
}

export function getDefaultAgentConfig(agentId: CoreAgentId): AgentConfig {
  return {
    id: agentId,
    ...DEFAULT_AGENT_PROFILES[agentId],
  };
}

function defaultProfileForAgentId(agentId: string): Omit<AgentConfig, "id"> {
  if (isCoreAgentId(agentId)) {
    return DEFAULT_AGENT_PROFILES[agentId];
  }

  return DEFAULT_CUSTOM_PROFILE;
}

function clampTemperature(value: unknown, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }
  return Math.min(1, Math.max(0, Number(value.toFixed(2))));
}

function clampTokens(value: unknown, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }
  return Math.min(8000, Math.max(256, Math.round(value)));
}

function normalizeText(value: unknown, fallback: string): string {
  if (typeof value !== "string") {
    return fallback;
  }

  const next = value.trim();
  return next.length > 0 ? next : fallback;
}

function normalizeSingleAgentConfig(value: unknown): AgentConfig | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const source = value as Partial<AgentConfig> & { id?: unknown };
  const normalizedId = sanitizeAgentId(source.id);
  if (!normalizedId) {
    return null;
  }

  const defaults = defaultProfileForAgentId(normalizedId);
  const provider = normalizeProvider(source.provider);
  const normalizedUserMessage = normalizeText(source.userMessage, defaults.userMessage);
  const userMessage =
    isCoreAgentId(normalizedId) && LEGACY_CORE_USER_MESSAGE_DEFAULTS[normalizedId].includes(normalizedUserMessage)
      ? defaults.userMessage
      : normalizedUserMessage;

  return {
    id: normalizedId,
    role: normalizeText(source.role, defaults.role),
    name: normalizeText(source.name, defaults.name),
    systemMessage: normalizeText(source.systemMessage, defaults.systemMessage),
    userMessage,
    provider,
    model: resolveModelForProvider(provider, typeof source.model === "string" ? source.model : defaults.model),
    temperature: clampTemperature(source.temperature, defaults.temperature),
    maxTokens: clampTokens(source.maxTokens, defaults.maxTokens),
  };
}

export function buildCustomAgentConfig(existingConfigs?: AgentConfig[]): AgentConfig {
  const existingIds = new Set((existingConfigs ?? []).map((config) => config.id));
  let suffix = 1;

  while (true) {
    const id = `reviewer-${suffix}`;
    if (!existingIds.has(id)) {
      return {
        id,
        ...DEFAULT_CUSTOM_PROFILE,
        role: `Reviewer ${suffix}`,
        name: `Custom Review Agent ${suffix}`,
      };
    }

    suffix += 1;
  }
}

export function normalizeAgentConfigs(value: unknown): AgentConfig[] {
  const defaults = buildDefaultAgentConfigs();
  const byId = new Map<string, AgentConfig>();

  if (Array.isArray(value)) {
    for (const entry of value) {
      const parsed = normalizeSingleAgentConfig(entry);
      if (parsed) {
        byId.set(parsed.id, parsed);
      }
    }
  }

  for (const defaultConfig of defaults) {
    if (!byId.has(defaultConfig.id)) {
      byId.set(defaultConfig.id, defaultConfig);
    }
  }

  const customIds = [...byId.keys()]
    .filter((id) => !isCoreAgentId(id))
    .sort((a, b) => a.localeCompare(b));

  const orderedIds = [...CORE_AGENT_ORDER, ...customIds];

  return orderedIds.map((id) => byId.get(id)).filter((config): config is AgentConfig => Boolean(config));
}
