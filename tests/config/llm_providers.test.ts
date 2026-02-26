import { afterEach, describe, expect, it, vi } from "vitest";

import {
  getProviderApiKey,
  getProviderApiKeyEnv,
  getProviderBaseUrl,
  listLLMProviderOptions,
  providerEnabled,
  providerFailoverOrder,
  providerOptions,
  resolveModelForProvider,
  resolveProvider,
} from "../../src/config/llm_providers";

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  vi.restoreAllMocks();
});

describe("llm_providers", () => {
  it("returns all provider options", () => {
    expect(providerOptions()).toEqual(["OpenAI", "Anthropic", "Mistral", "Meta"]);
  });

  it("returns deterministic provider failover order", () => {
    expect(providerFailoverOrder("OpenAI")).toEqual(["OpenAI", "Anthropic", "Mistral", "Meta"]);
    expect(providerFailoverOrder("Anthropic")).toEqual(["Anthropic", "OpenAI", "Mistral", "Meta"]);
  });

  it("resolves provider names with fallback", () => {
    expect(resolveProvider("anthropic")).toBe("Anthropic");
    expect(resolveProvider("MISTRAL")).toBe("Mistral");
    expect(resolveProvider("meta")).toBe("Meta");
    expect(resolveProvider("unknown")).toBe("OpenAI");
    expect(resolveProvider(undefined)).toBe("OpenAI");
  });

  it("resolves model by provider and falls back to provider default", () => {
    expect(resolveModelForProvider("OpenAI", "gpt-4o")).toBe("gpt-4o");
    expect(resolveModelForProvider("OpenAI", "not-a-model")).toBe("gpt-4o");
    expect(resolveModelForProvider("Anthropic", undefined)).toBe("claude-3-5-sonnet-latest");
  });

  it("reads and trims provider API keys", () => {
    process.env.OPENAI_API_KEY = "  sk-test  ";
    expect(getProviderApiKey("OpenAI")).toBe("sk-test");
  });

  it("returns provider API key env names", () => {
    expect(getProviderApiKeyEnv("OpenAI")).toBe("OPENAI_API_KEY");
    expect(getProviderApiKeyEnv("Anthropic")).toBe("ANTHROPIC_API_KEY");
    expect(getProviderApiKeyEnv("Mistral")).toBe("MISTRAL_API_KEY");
    expect(getProviderApiKeyEnv("Meta")).toBe("META_API_KEY");
  });

  it("detects whether a provider has an API key configured", () => {
    process.env.ANTHROPIC_API_KEY = "anthropic-test-key";

    expect(providerEnabled("Anthropic")).toBe(true);
    expect(providerEnabled("OpenAI")).toBe(false);
  });

  it("lists provider options with configured status", () => {
    process.env.OPENAI_API_KEY = "openai-test-key";
    process.env.META_API_KEY = "meta-test-key";

    expect(listLLMProviderOptions()).toEqual([
      { provider: "OpenAI", apiKeyEnv: "OPENAI_API_KEY", configured: true },
      { provider: "Anthropic", apiKeyEnv: "ANTHROPIC_API_KEY", configured: false },
      { provider: "Mistral", apiKeyEnv: "MISTRAL_API_KEY", configured: false },
      { provider: "Meta", apiKeyEnv: "META_API_KEY", configured: true },
    ]);
  });

  it("returns base url from env when defined, otherwise default", () => {
    process.env.MISTRAL_BASE_URL = " https://example.mistral.test/v1/ ";
    expect(getProviderBaseUrl("Mistral")).toBe("https://example.mistral.test/v1/");

    delete process.env.MISTRAL_BASE_URL;
    expect(getProviderBaseUrl("Mistral")).toBe("https://api.mistral.ai/v1");
    expect(getProviderBaseUrl("OpenAI")).toBe("https://api.openai.com/v1");
  });
});
