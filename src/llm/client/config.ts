import {
  getProviderApiKey,
  getProviderApiKeyEnv,
  getProviderBaseUrl,
  type LLMProvider,
} from "../../config/llm_providers";
import { withOfflineFallback } from "../../offline/mode";

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

export function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, "");
}

export function jsonOnlyInstruction(enabled: boolean): string {
  return enabled ? "\n\nReturn only a valid JSON object with no extra text." : "";
}

export function requireProviderApiKey(provider: LLMProvider): string {
  const apiKey = withOfflineFallback(getProviderApiKey(provider), `offline-${provider.toLowerCase()}-key`);
  if (apiKey.length > 0) {
    return apiKey;
  }

  const envName = getProviderApiKeyEnv(provider);
  throw new Error(`${provider} API key is required. Set ${envName}.`);
}

export function requireProviderBaseUrl(provider: LLMProvider): string {
  const baseUrl = getProviderBaseUrl(provider);
  if (baseUrl && baseUrl.trim().length > 0) {
    return normalizeBaseUrl(baseUrl);
  }

  throw new Error(`${provider} base URL is not configured.`);
}

export function resolveProviderCooldownMs(): number {
  const raw = Number(process.env.BOARDROOM_PROVIDER_COOLDOWN_MS ?? DEFAULT_PROVIDER_COOLDOWN_MS);
  if (!Number.isFinite(raw)) {
    return DEFAULT_PROVIDER_COOLDOWN_MS;
  }

  return Math.max(1_000, Math.min(MAX_PROVIDER_COOLDOWN_MS, Math.round(raw)));
}

export function resolveRateLimitRetryMaxWaitMs(): number {
  const raw = Number(
    process.env.BOARDROOM_RATE_LIMIT_RETRY_MAX_WAIT_MS ?? DEFAULT_RATE_LIMIT_RETRY_MAX_WAIT_MS,
  );
  if (!Number.isFinite(raw)) {
    return DEFAULT_RATE_LIMIT_RETRY_MAX_WAIT_MS;
  }

  return Math.max(0, Math.min(MAX_RATE_LIMIT_RETRY_MAX_WAIT_MS, Math.round(raw)));
}

export function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === "string") {
    return error;
  }

  return "unknown error";
}

export function shouldMarkProviderCooldown(error: unknown): boolean {
  const normalized = errorMessage(error).toLowerCase();
  return COOLDOWN_SIGNALS.some((signal) => normalized.includes(signal));
}

export function parseRetryDelayMs(error: unknown): number | null {
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

export async function waitMs(delayMs: number): Promise<void> {
  if (delayMs <= 0) {
    return;
  }

  await new Promise((resolve) => {
    setTimeout(resolve, delayMs);
  });
}
