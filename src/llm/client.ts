import OpenAI from "openai";

import {
  getProviderApiKey,
  getProviderApiKeyEnv,
  getProviderBaseUrl,
  LLMProvider,
  providerFailoverOrder,
  resolveModelForProvider,
} from "../config/llm_providers";
import { hashString, isSimulationModeEnabled, resolveSimulationDelayMs, sleepMs } from "../simulation/mode";

export interface LLMCompletionRequest {
  model: string;
  systemMessage: string;
  userMessage: string;
  temperature: number;
  maxTokens: number;
  requireJsonObject?: boolean;
}

export interface LLMClient {
  readonly provider: LLMProvider;
  complete(request: LLMCompletionRequest): Promise<string>;
}

interface OpenAICompatibleCompletionResponse {
  choices?: Array<{
    message?: {
      content?: string | null;
    };
  }>;
  error?: {
    message?: string;
  };
}

interface AnthropicCompletionResponse {
  content?: Array<{
    type?: string;
    text?: string;
  }>;
  error?: {
    message?: string;
  };
}

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, "");
}

function jsonOnlyInstruction(enabled: boolean): string {
  return enabled ? "\n\nReturn only a valid JSON object with no extra text." : "";
}

function requireProviderApiKey(provider: LLMProvider): string {
  const apiKey = getProviderApiKey(provider);
  if (apiKey.length > 0) {
    return apiKey;
  }

  if (isSimulationModeEnabled()) {
    return `simulated-${provider.toLowerCase()}-key`;
  }

  const envName = getProviderApiKeyEnv(provider);
  throw new Error(`${provider} API key is required. Set ${envName}.`);
}

function requireProviderBaseUrl(provider: LLMProvider): string {
  const baseUrl = getProviderBaseUrl(provider);
  if (baseUrl && baseUrl.trim().length > 0) {
    return normalizeBaseUrl(baseUrl);
  }

  if (isSimulationModeEnabled()) {
    return "https://simulation.local";
  }

  throw new Error(`${provider} base URL is not configured.`);
}

const DEFAULT_PROVIDER_COOLDOWN_MS = 20_000;
const MAX_PROVIDER_COOLDOWN_MS = 5 * 60 * 1_000;
const DEFAULT_RATE_LIMIT_RETRY_MAX_WAIT_MS = 15_000;
const MAX_RATE_LIMIT_RETRY_MAX_WAIT_MS = 60_000;
const COOLDOWN_SIGNALS = [
  "429",
  "too many requests",
  "rate limit",
  "timeout",
  "timed out",
  "temporarily unavailable",
  "overloaded",
  "503",
  "502",
  "504",
  "econnreset",
  "enotfound",
  "api key is required",
  "base url is not configured",
];

function resolveProviderCooldownMs(): number {
  const raw = Number(process.env.BOARDROOM_PROVIDER_COOLDOWN_MS ?? DEFAULT_PROVIDER_COOLDOWN_MS);
  if (!Number.isFinite(raw)) {
    return DEFAULT_PROVIDER_COOLDOWN_MS;
  }

  return Math.max(1_000, Math.min(MAX_PROVIDER_COOLDOWN_MS, Math.round(raw)));
}

function resolveRateLimitRetryMaxWaitMs(): number {
  const raw = Number(
    process.env.BOARDROOM_RATE_LIMIT_RETRY_MAX_WAIT_MS ?? DEFAULT_RATE_LIMIT_RETRY_MAX_WAIT_MS,
  );
  if (!Number.isFinite(raw)) {
    return DEFAULT_RATE_LIMIT_RETRY_MAX_WAIT_MS;
  }

  return Math.max(0, Math.min(MAX_RATE_LIMIT_RETRY_MAX_WAIT_MS, Math.round(raw)));
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === "string") {
    return error;
  }

  return "unknown error";
}

function shouldMarkProviderCooldown(error: unknown): boolean {
  const normalized = errorMessage(error).toLowerCase();
  return COOLDOWN_SIGNALS.some((signal) => normalized.includes(signal));
}

function parseRetryDelayMs(error: unknown): number | null {
  const message = errorMessage(error).toLowerCase();
  const match = message.match(/(?:try again in|retry after)\s+(\d+(?:\.\d+)?)\s*(ms|s|sec|secs|second|seconds)?/i);
  if (!match) {
    return null;
  }

  const rawValue = Number(match[1]);
  if (!Number.isFinite(rawValue) || rawValue < 0) {
    return null;
  }

  const unit = match[2]?.toLowerCase() ?? "s";
  if (unit === "ms") {
    return Math.round(rawValue);
  }

  return Math.round(rawValue * 1_000);
}

async function waitMs(delayMs: number): Promise<void> {
  if (delayMs <= 0) {
    return;
  }

  await new Promise((resolve) => {
    setTimeout(resolve, delayMs);
  });
}

const SIMULATED_GOVERNANCE_CHECKS = {
  "≥3 Options Evaluated": true,
  "Success Metrics Defined": true,
  "Leading Indicators Defined": true,
  "Kill Criteria Defined": true,
  "Option Trade-offs Explicit": true,
  "Risk Matrix Completed": true,
  "Financial Model Included": true,
  "Downside Modeled": true,
  "Compliance Reviewed": true,
  "Decision Memo Written": true,
  "Root Cause Done": true,
  "Assumptions Logged": true,
};

function isChairpersonPrompt(request: LLMCompletionRequest): boolean {
  const haystack = `${request.systemMessage}\n${request.userMessage}`.toLowerCase();
  return haystack.includes("chairperson") || haystack.includes("final_recommendation") || haystack.includes("consensus_points");
}

function extractAgentName(request: LLMCompletionRequest): string {
  const fromSchema = request.userMessage.match(/"agent"\s*:\s*"([^"]+)"/i)?.[1]?.trim();
  if (fromSchema && fromSchema.length > 0) {
    return fromSchema;
  }

  const fromRoleLine = request.userMessage.match(/agent_name["\s:]+([A-Za-z0-9' -]{2,})/i)?.[1]?.trim();
  if (fromRoleLine && fromRoleLine.length > 0) {
    return fromRoleLine;
  }

  return "Simulation Agent";
}

function simulatedReviewResponse(provider: LLMProvider, request: LLMCompletionRequest): string {
  const agent = extractAgentName(request);
  const seed = hashString(`${provider}:${request.model}:${agent}:${request.userMessage.slice(0, 220)}`);
  const score = 6 + (seed % 4);
  const confidence = Math.min(0.94, 0.62 + ((seed % 28) / 100));
  const blocked = /compliance|risk|devil|pre-mortem/i.test(agent) && seed % 9 === 0;

  return JSON.stringify({
    agent,
    thesis: `${agent} simulated review: evidence suggests a viable path with measurable downside controls.`,
    score,
    confidence: Number(confidence.toFixed(2)),
    blocked,
    blockers: blocked ? [`${agent} requires stronger controls before approval.`] : [],
    risks: [
      {
        type: "execution_risk",
        severity: 4 + (seed % 5),
        evidence: `${agent} flagged concentrated implementation dependency.`,
      },
    ],
    citations: [
      {
        url: `https://simulation.local/${provider.toLowerCase()}/${agent.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
        title: "Simulated source",
        claim: "Synthetic evidence generated for local development mode.",
      },
    ],
    required_changes: blocked ? ["Define explicit stop-loss and rollback criteria."] : ["Confirm telemetry before rollout."],
    approval_conditions: blocked ? [] : ["Proceed with staged rollout and weekly checkpoints."],
    apga_impact_view: "Simulation indicates moderate upside with controllable downside exposure.",
    governance_checks_met: SIMULATED_GOVERNANCE_CHECKS,
  });
}

function simulatedChairpersonResponse(provider: LLMProvider, request: LLMCompletionRequest): string {
  const seed = hashString(`${provider}:${request.model}:${request.userMessage.slice(0, 260)}`);
  const finalRecommendation = seed % 5 === 0 ? "Blocked" : seed % 3 === 0 ? "Challenged" : "Approved";

  return JSON.stringify({
    executive_summary: "Simulation mode generated a synthetic board synthesis for local UX validation.",
    final_recommendation: finalRecommendation,
    consensus_points: [
      "Core strategic thesis is coherent under baseline assumptions.",
      "Risk controls are present but require continuous monitoring.",
    ],
    point_of_contention: "Downside execution variance remains the primary debate point.",
    residual_risks: ["Synthetic output is not production-grade evidence."],
    evidence_citations: ["[SIM] Deterministic evidence set"],
    conflicts: finalRecommendation === "Approved" ? [] : ["Risk-focused reviewer challenged rollout timing."],
    blockers: finalRecommendation === "Blocked" ? ["Add hard stop-loss triggers before release."] : [],
    required_revisions: finalRecommendation === "Approved" ? [] : ["Tighten governance gates and owner accountability."],
  });
}

async function simulateCompletion(provider: LLMProvider, request: LLMCompletionRequest): Promise<string> {
  const delayMs = resolveSimulationDelayMs(`${provider}:${request.model}:${request.userMessage.slice(0, 180)}`);
  await sleepMs(delayMs);

  if (!request.requireJsonObject) {
    return `[SIMULATED:${provider}] ${request.model} response for local UX testing.`;
  }

  return isChairpersonPrompt(request)
    ? simulatedChairpersonResponse(provider, request)
    : simulatedReviewResponse(provider, request);
}

class OpenAIProviderClient implements LLMClient {
  readonly provider: LLMProvider = "OpenAI";
  private readonly client: OpenAI;

  constructor() {
    this.client = new OpenAI({
      apiKey: requireProviderApiKey("OpenAI"),
      baseURL: requireProviderBaseUrl("OpenAI"),
    });
  }

  async complete(request: LLMCompletionRequest): Promise<string> {
    if (isSimulationModeEnabled()) {
      return simulateCompletion(this.provider, request);
    }

    const response = await this.client.chat.completions.create({
      model: request.model,
      messages: [
        { role: "system", content: request.systemMessage },
        { role: "user", content: request.userMessage },
      ],
      temperature: request.temperature,
      max_tokens: request.maxTokens,
      response_format: request.requireJsonObject ? { type: "json_object" } : undefined,
    });

    return response.choices[0]?.message?.content ?? "";
  }
}

abstract class OpenAICompatibleProviderClient implements LLMClient {
  abstract readonly provider: LLMProvider;

  private readonly apiKey: string;
  private readonly baseUrl: string;

  protected constructor(provider: LLMProvider) {
    this.apiKey = requireProviderApiKey(provider);
    this.baseUrl = requireProviderBaseUrl(provider);
  }

  async complete(request: LLMCompletionRequest): Promise<string> {
    if (isSimulationModeEnabled()) {
      return simulateCompletion(this.provider, request);
    }

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: request.model,
        messages: [
          { role: "system", content: request.systemMessage },
          {
            role: "user",
            content: `${request.userMessage}${jsonOnlyInstruction(Boolean(request.requireJsonObject))}`,
          },
        ],
        temperature: request.temperature,
        max_tokens: request.maxTokens,
        response_format: request.requireJsonObject ? { type: "json_object" } : undefined,
      }),
    });

    const payload = (await response.json().catch(() => ({}))) as OpenAICompatibleCompletionResponse;
    if (!response.ok) {
      const message = payload.error?.message ?? response.statusText;
      throw new Error(`${this.provider} completion failed: ${message}`);
    }

    return payload.choices?.[0]?.message?.content ?? "";
  }
}

class MistralProviderClient extends OpenAICompatibleProviderClient {
  readonly provider: LLMProvider = "Mistral";

  constructor() {
    super("Mistral");
  }
}

class MetaProviderClient extends OpenAICompatibleProviderClient {
  readonly provider: LLMProvider = "Meta";

  constructor() {
    super("Meta");
  }
}

class AnthropicProviderClient implements LLMClient {
  readonly provider: LLMProvider = "Anthropic";

  private readonly apiKey: string;
  private readonly baseUrl: string;

  constructor() {
    this.apiKey = requireProviderApiKey("Anthropic");
    this.baseUrl = requireProviderBaseUrl("Anthropic");
  }

  async complete(request: LLMCompletionRequest): Promise<string> {
    if (isSimulationModeEnabled()) {
      return simulateCompletion(this.provider, request);
    }

    const response = await fetch(`${this.baseUrl}/v1/messages`, {
      method: "POST",
      headers: {
        "x-api-key": this.apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: request.model,
        system: request.systemMessage,
        messages: [
          {
            role: "user",
            content: `${request.userMessage}${jsonOnlyInstruction(Boolean(request.requireJsonObject))}`,
          },
        ],
        temperature: request.temperature,
        max_tokens: request.maxTokens,
      }),
    });

    const payload = (await response.json().catch(() => ({}))) as AnthropicCompletionResponse;
    if (!response.ok) {
      const message = payload.error?.message ?? response.statusText;
      throw new Error(`Anthropic completion failed: ${message}`);
    }

    const textChunk = payload.content?.find((entry) => entry.type === "text");
    return textChunk?.text ?? "";
  }
}

function createProviderClient(provider: LLMProvider): LLMClient {
  if (provider === "OpenAI") {
    return new OpenAIProviderClient();
  }

  if (provider === "Anthropic") {
    return new AnthropicProviderClient();
  }

  if (provider === "Mistral") {
    return new MistralProviderClient();
  }

  return new MetaProviderClient();
}

class ResilientProviderClient implements LLMClient {
  readonly provider: LLMProvider;

  private readonly registry: ProviderClientRegistry;

  constructor(provider: LLMProvider, registry: ProviderClientRegistry) {
    this.provider = provider;
    this.registry = registry;
  }

  async complete(request: LLMCompletionRequest): Promise<string> {
    return this.registry.completeWithFallback(this.provider, request);
  }
}

export class ProviderClientRegistry {
  private readonly clients = new Map<LLMProvider, LLMClient>();
  private readonly resilientClients = new Map<LLMProvider, LLMClient>();
  private readonly providerCooldownUntil = new Map<LLMProvider, number>();
  private readonly providerCooldownMs = resolveProviderCooldownMs();
  private readonly rateLimitRetryMaxWaitMs = resolveRateLimitRetryMaxWaitMs();

  getClient(provider: LLMProvider): LLMClient {
    const existing = this.clients.get(provider);
    if (existing) {
      return existing;
    }

    const created = createProviderClient(provider);
    this.clients.set(provider, created);
    return created;
  }

  getResilientClient(provider: LLMProvider): LLMClient {
    const existing = this.resilientClients.get(provider);
    if (existing) {
      return existing;
    }

    const created = new ResilientProviderClient(provider, this);
    this.resilientClients.set(provider, created);
    return created;
  }

  async completeWithFallback(preferredProvider: LLMProvider, request: LLMCompletionRequest): Promise<string> {
    if (isSimulationModeEnabled()) {
      const client = this.getClient(preferredProvider);
      return client.complete({
        ...request,
        model: resolveModelForProvider(preferredProvider, request.model),
      });
    }

    const attemptedProviders = this.buildAttemptOrder(preferredProvider);
    const failures: string[] = [];
    const hasConfiguredAlternative = attemptedProviders.some(
      (provider) => provider !== preferredProvider && getProviderApiKey(provider).length > 0,
    );
    let deferredPreferredRetryDelayMs: number | null = null;

    for (const provider of attemptedProviders) {
      if (getProviderApiKey(provider).length === 0) {
        failures.push(`${provider}: missing ${getProviderApiKeyEnv(provider)}`);
        this.markProviderCooldown(provider);
        continue;
      }

      const providerModel = resolveModelForProvider(provider, request.model);

      try {
        const client = this.getClient(provider);
        const result = await client.complete({
          ...request,
          model: providerModel,
        });
        this.clearProviderCooldown(provider);
        return result;
      } catch (error) {
        const message = errorMessage(error);
        failures.push(`${provider}: ${message}`);
        if (shouldMarkProviderCooldown(error)) {
          this.markProviderCooldown(provider);
          const retryDelayMs = parseRetryDelayMs(error);
          if (
            provider === preferredProvider &&
            !hasConfiguredAlternative &&
            retryDelayMs !== null &&
            deferredPreferredRetryDelayMs === null
          ) {
            deferredPreferredRetryDelayMs = Math.min(this.rateLimitRetryMaxWaitMs, retryDelayMs);
          }
        }
      }
    }

    if (deferredPreferredRetryDelayMs !== null) {
      await waitMs(deferredPreferredRetryDelayMs);
      try {
        const client = this.getClient(preferredProvider);
        const result = await client.complete({
          ...request,
          model: resolveModelForProvider(preferredProvider, request.model),
        });
        this.clearProviderCooldown(preferredProvider);
        return result;
      } catch (error) {
        failures.push(`${preferredProvider} retry: ${errorMessage(error)}`);
        if (shouldMarkProviderCooldown(error)) {
          this.markProviderCooldown(preferredProvider);
        }
      }
    }

    throw new Error(`All providers failed. Attempts: ${failures.join(" | ")}`);
  }

  private buildAttemptOrder(preferredProvider: LLMProvider): LLMProvider[] {
    const ordered = providerFailoverOrder(preferredProvider);
    const ready = ordered.filter((provider) => !this.isProviderOnCooldown(provider));

    if (ready.length === ordered.length || ready.length === 0) {
      return ordered;
    }

    const cooldown = ordered.filter((provider) => this.isProviderOnCooldown(provider));
    return [...ready, ...cooldown];
  }

  private isProviderOnCooldown(provider: LLMProvider): boolean {
    const until = this.providerCooldownUntil.get(provider);
    return typeof until === "number" && until > Date.now();
  }

  private markProviderCooldown(provider: LLMProvider): void {
    this.providerCooldownUntil.set(provider, Date.now() + this.providerCooldownMs);
  }

  private clearProviderCooldown(provider: LLMProvider): void {
    this.providerCooldownUntil.delete(provider);
  }
}
