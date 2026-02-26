export type LLMProvider = "OpenAI" | "Anthropic" | "Mistral" | "Meta";

interface ProviderSettings {
  models: readonly string[];
  apiKeyEnv: string;
  baseUrlEnv?: string;
  defaultBaseUrl?: string;
}

export const PROVIDER_SETTINGS: Record<LLMProvider, ProviderSettings> = {
  OpenAI: {
    models: ["gpt-4o", "gpt-4o-mini"],
    apiKeyEnv: "OPENAI_API_KEY",
    defaultBaseUrl: "https://api.openai.com/v1",
  },
  Anthropic: {
    models: ["claude-3-5-sonnet-latest", "claude-3-5-haiku-latest"],
    apiKeyEnv: "ANTHROPIC_API_KEY",
    defaultBaseUrl: "https://api.anthropic.com",
  },
  Mistral: {
    models: ["mistral-large-latest", "mistral-small-latest"],
    apiKeyEnv: "MISTRAL_API_KEY",
    baseUrlEnv: "MISTRAL_BASE_URL",
    defaultBaseUrl: "https://api.mistral.ai/v1",
  },
  Meta: {
    models: ["llama-3.1-70b-instruct", "llama-3.1-8b-instruct"],
    apiKeyEnv: "META_API_KEY",
    baseUrlEnv: "META_BASE_URL",
    defaultBaseUrl: "https://api.llama.com/compat/v1",
  },
};

const PROVIDERS = Object.freeze(Object.keys(PROVIDER_SETTINGS) as LLMProvider[]);
const FAILOVER_PRIORITY = Object.freeze<LLMProvider[]>(["OpenAI", "Anthropic", "Mistral", "Meta"]);

export interface LLMProviderOption {
  provider: LLMProvider;
  apiKeyEnv: string;
  configured: boolean;
}

export const PROVIDER_MODEL_OPTIONS: Record<LLMProvider, string[]> = PROVIDERS.reduce(
  (acc, provider) => ({
    ...acc,
    [provider]: [...PROVIDER_SETTINGS[provider].models],
  }),
  {} as Record<LLMProvider, string[]>,
);

export function providerOptions(): LLMProvider[] {
  return [...PROVIDERS];
}

function envValue(env: NodeJS.ProcessEnv | undefined, key: string): string {
  if (!env) {
    return "";
  }

  return (env[key] ?? "").trim();
}

export function providerFailoverOrder(preferredProvider: LLMProvider): LLMProvider[] {
  return [preferredProvider, ...FAILOVER_PRIORITY.filter((provider) => provider !== preferredProvider)];
}

export function resolveProvider(value: unknown): LLMProvider {
  if (typeof value !== "string") {
    return "OpenAI";
  }

  const normalized = value.trim().toLowerCase();
  if (normalized === "anthropic") {
    return "Anthropic";
  }
  if (normalized === "mistral") {
    return "Mistral";
  }
  if (normalized === "meta") {
    return "Meta";
  }
  return "OpenAI";
}

export function resolveModelForProvider(provider: LLMProvider, candidate?: string): string {
  const options = PROVIDER_MODEL_OPTIONS[provider];
  if (typeof candidate === "string" && options.includes(candidate)) {
    return candidate;
  }
  return options[0];
}

export function getProviderApiKey(provider: LLMProvider): string {
  const settings = PROVIDER_SETTINGS[provider];
  return (process.env[settings.apiKeyEnv] ?? "").trim();
}

export function getProviderBaseUrl(provider: LLMProvider): string | null {
  const settings = PROVIDER_SETTINGS[provider];
  if (settings.baseUrlEnv) {
    const fromEnv = (process.env[settings.baseUrlEnv] ?? "").trim();
    if (fromEnv.length > 0) {
      return fromEnv;
    }
  }

  return settings.defaultBaseUrl ?? null;
}

export function getProviderApiKeyEnv(provider: LLMProvider): string {
  return PROVIDER_SETTINGS[provider].apiKeyEnv;
}

export function providerEnabled(provider: LLMProvider, env: NodeJS.ProcessEnv | undefined = process.env): boolean {
  return envValue(env, getProviderApiKeyEnv(provider)).length > 0;
}

export function listLLMProviderOptions(env: NodeJS.ProcessEnv | undefined = process.env): LLMProviderOption[] {
  return PROVIDERS.map((provider) => ({
    provider,
    apiKeyEnv: getProviderApiKeyEnv(provider),
    configured: providerEnabled(provider, env),
  }));
}
