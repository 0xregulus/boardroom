import {
  getProviderApiKey,
  getProviderApiKeyEnv,
  type LLMProvider,
  providerFailoverOrder,
  resolveModelForProvider,
} from "../../config/llm_providers";
import { withOfflineFallback } from "../../offline/mode";
import {
  errorMessage,
  parseRetryDelayMs,
  resolveProviderCooldownMs,
  resolveRateLimitRetryMaxWaitMs,
  shouldMarkProviderCooldown,
  waitMs,
} from "./config";
import { createProviderClient } from "./providers";
import type { LLMClient, LLMCompletionRequest } from "./types";

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
    const attemptedProviders = this.buildAttemptOrder(preferredProvider);
    const failures: string[] = [];
    const hasConfiguredAlternative = attemptedProviders.some(
      (provider) => provider !== preferredProvider && getProviderApiKey(provider).length > 0,
    );
    let deferredPreferredRetryDelayMs: number | null = null;

    for (const provider of attemptedProviders) {
      const apiKey = withOfflineFallback(getProviderApiKey(provider), `offline-${provider.toLowerCase()}-key`);
      if (apiKey.length === 0) {
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
