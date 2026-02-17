import { afterEach, describe, expect, it, vi } from "vitest";

import {
  getProviderApiKey,
  getProviderApiKeyEnv,
  getProviderBaseUrl,
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

  it("returns base url from env when defined, otherwise default", () => {
    process.env.MISTRAL_BASE_URL = " https://example.mistral.test/v1/ ";
    expect(getProviderBaseUrl("Mistral")).toBe("https://example.mistral.test/v1/");

    delete process.env.MISTRAL_BASE_URL;
    expect(getProviderBaseUrl("Mistral")).toBe("https://api.mistral.ai/v1");
    expect(getProviderBaseUrl("OpenAI")).toBe("https://api.openai.com/v1");
  });
});
