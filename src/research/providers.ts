export type ResearchProvider = "Tavily" | "Jina" | "Perplexity";

interface ResearchProviderSettings {
  apiKeyEnv: string;
}

const RESEARCH_PROVIDER_SETTINGS: Record<ResearchProvider, ResearchProviderSettings> = {
  Tavily: {
    apiKeyEnv: "TAVILY_API_KEY",
  },
  Jina: {
    apiKeyEnv: "JINA_API_KEY",
  },
  Perplexity: {
    apiKeyEnv: "PERPLEXITY_API_KEY",
  },
};

const RESEARCH_PROVIDERS = Object.freeze(Object.keys(RESEARCH_PROVIDER_SETTINGS) as ResearchProvider[]);

export interface ResearchProviderOption {
  provider: ResearchProvider;
  apiKeyEnv: string;
  configured: boolean;
}

function envValue(env: NodeJS.ProcessEnv | undefined, key: string): string {
  if (!env) {
    return "";
  }

  return (env[key] ?? "").trim();
}

export function researchProviderOptions(): ResearchProvider[] {
  return [...RESEARCH_PROVIDERS];
}

export function resolveResearchProvider(value: unknown): ResearchProvider {
  if (typeof value !== "string") {
    return "Tavily";
  }

  const normalized = value.trim().toLowerCase();
  if (normalized === "jina") {
    return "Jina";
  }
  if (normalized === "perplexity") {
    return "Perplexity";
  }

  return "Tavily";
}

export function researchProviderApiKeyEnv(provider: ResearchProvider): string {
  return RESEARCH_PROVIDER_SETTINGS[provider].apiKeyEnv;
}

export function researchProviderEnabled(provider: ResearchProvider, env: NodeJS.ProcessEnv | undefined = process.env): boolean {
  return envValue(env, researchProviderApiKeyEnv(provider)).length > 0;
}

export function listResearchProviderOptions(env: NodeJS.ProcessEnv | undefined = process.env): ResearchProviderOption[] {
  return RESEARCH_PROVIDERS.map((provider) => ({
    provider,
    apiKeyEnv: researchProviderApiKeyEnv(provider),
    configured: researchProviderEnabled(provider, env),
  }));
}

export function resolveConfiguredResearchProvider(
  candidate: unknown,
  env: NodeJS.ProcessEnv | undefined = process.env,
): ResearchProvider {
  const preferred = resolveResearchProvider(candidate);
  if (researchProviderEnabled(preferred, env)) {
    return preferred;
  }

  const firstConfigured = listResearchProviderOptions(env).find((option) => option.configured);
  return firstConfigured?.provider ?? preferred;
}
