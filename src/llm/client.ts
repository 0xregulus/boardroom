import OpenAI from "openai";

import {
  getProviderApiKey,
  getProviderApiKeyEnv,
  getProviderBaseUrl,
  LLMProvider,
  providerFailoverOrder,
  resolveModelForProvider,
} from "../config/llm_providers";

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

  const envName = getProviderApiKeyEnv(provider);
  throw new Error(`${provider} API key is required. Set ${envName}.`);
}

function requireProviderBaseUrl(provider: LLMProvider): string {
  const baseUrl = getProviderBaseUrl(provider);
  if (baseUrl && baseUrl.trim().length > 0) {
    return normalizeBaseUrl(baseUrl);
  }

  throw new Error(`${provider} base URL is not configured.`);
}

const DEFAULT_PROVIDER_COOLDOWN_MS = 20_000;
const MAX_PROVIDER_COOLDOWN_MS = 5 * 60 * 1_000;
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
    const attemptedProviders = this.buildAttemptOrder(preferredProvider);
    const failures: string[] = [];

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
