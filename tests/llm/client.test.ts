import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  openaiCreate: vi.fn(),
  openaiCtor: vi.fn(),
}));

vi.mock("openai", () => ({
  default: class OpenAI {
    readonly chat = {
      completions: {
        create: mocks.openaiCreate,
      },
    };

    constructor(config: unknown) {
      mocks.openaiCtor(config);
    }
  },
}));

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  process.env = {
    ...ORIGINAL_ENV,
    OPENAI_API_KEY: "openai-key",
    ANTHROPIC_API_KEY: "anthropic-key",
    MISTRAL_API_KEY: "mistral-key",
    META_API_KEY: "meta-key",
    OPENAI_BASE_URL: "https://api.openai.com/v1",
    ANTHROPIC_BASE_URL: "https://api.anthropic.com",
    MISTRAL_BASE_URL: "https://mistral.example/v1",
    META_BASE_URL: "https://meta.example/v1",
  };

  mocks.openaiCreate.mockReset();
  mocks.openaiCtor.mockReset();
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  vi.unstubAllGlobals();
});

describe("ProviderClientRegistry", () => {
  it("caches provider clients", async () => {
    const { ProviderClientRegistry } = await import("../../src/llm/client");

    const registry = new ProviderClientRegistry();
    const first = registry.getClient("OpenAI");
    const second = registry.getClient("OpenAI");

    expect(first).toBe(second);
    expect(mocks.openaiCtor).toHaveBeenCalledTimes(1);
  });

  it("performs OpenAI chat completion", async () => {
    mocks.openaiCreate.mockResolvedValueOnce({
      choices: [{ message: { content: "{\"ok\":true}" } }],
    });

    const { ProviderClientRegistry } = await import("../../src/llm/client");
    const registry = new ProviderClientRegistry();
    const client = registry.getClient("OpenAI");

    const response = await client.complete({
      model: "gpt-4o-mini",
      systemMessage: "system",
      userMessage: "user",
      temperature: 0.2,
      maxTokens: 500,
      requireJsonObject: true,
    });

    expect(response).toBe('{"ok":true}');
    expect(mocks.openaiCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "gpt-4o-mini",
        response_format: { type: "json_object" },
      }),
    );
  });

  it("performs OpenAI-compatible completion and appends JSON-only instruction", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        choices: [{ message: { content: "{}" } }],
      }),
    });

    vi.stubGlobal("fetch", fetchMock);

    const { ProviderClientRegistry } = await import("../../src/llm/client");
    const registry = new ProviderClientRegistry();
    const client = registry.getClient("Mistral");

    const result = await client.complete({
      model: "mistral-small-latest",
      systemMessage: "sys",
      userMessage: "user-message",
      temperature: 0.4,
      maxTokens: 700,
      requireJsonObject: true,
    });

    expect(result).toBe("{}");
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string) as { messages: Array<{ content: string }> };
    expect(body.messages[1]?.content).toContain("Return only a valid JSON object");
  });

  it("throws when openai-compatible provider returns non-OK response", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      statusText: "Bad Request",
      json: vi.fn().mockResolvedValue({
        error: { message: "invalid request" },
      }),
    });

    vi.stubGlobal("fetch", fetchMock);

    const { ProviderClientRegistry } = await import("../../src/llm/client");
    const registry = new ProviderClientRegistry();
    const client = registry.getClient("Meta");

    await expect(
      client.complete({
        model: "llama-3.1-8b-instruct",
        systemMessage: "sys",
        userMessage: "user",
        temperature: 0.3,
        maxTokens: 200,
      }),
    ).rejects.toThrow("Meta completion failed: invalid request");
  });

  it("calls anthropic endpoint and returns text chunk", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        content: [
          { type: "tool_result", text: "ignored" },
          { type: "text", text: "anthropic-result" },
        ],
      }),
    });

    vi.stubGlobal("fetch", fetchMock);

    const { ProviderClientRegistry } = await import("../../src/llm/client");
    const registry = new ProviderClientRegistry();
    const client = registry.getClient("Anthropic");

    const result = await client.complete({
      model: "claude-3-5-sonnet-latest",
      systemMessage: "sys",
      userMessage: "user",
      temperature: 0.2,
      maxTokens: 800,
      requireJsonObject: true,
    });

    expect(result).toBe("anthropic-result");
    expect(fetchMock.mock.calls[0][0]).toContain("/v1/messages");
  });

  it("throws when required API key is missing", async () => {
    delete process.env.MISTRAL_API_KEY;

    const { ProviderClientRegistry } = await import("../../src/llm/client");
    const registry = new ProviderClientRegistry();

    expect(() => registry.getClient("Mistral")).toThrow("Mistral API key is required");
  });

  it("falls back to the next provider when the preferred provider is rate-limited", async () => {
    mocks.openaiCreate.mockRejectedValueOnce(new Error("OpenAI completion failed: rate limit"));

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        content: [{ type: "text", text: "fallback-result" }],
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const { ProviderClientRegistry } = await import("../../src/llm/client");
    const registry = new ProviderClientRegistry();
    const client = registry.getResilientClient("OpenAI");

    const result = await client.complete({
      model: "gpt-4o-mini",
      systemMessage: "system",
      userMessage: "user",
      temperature: 0.2,
      maxTokens: 400,
    });

    expect(result).toBe("fallback-result");
    expect(mocks.openaiCreate).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toContain("/v1/messages");

    const fallbackPayload = JSON.parse(fetchMock.mock.calls[0]?.[1]?.body as string) as { model: string };
    expect(fallbackPayload.model).toBe("claude-3-5-sonnet-latest");
  });

  it("skips providers in cooldown for subsequent resilient calls", async () => {
    process.env.BOARDROOM_PROVIDER_COOLDOWN_MS = "120000";
    mocks.openaiCreate.mockRejectedValue(new Error("OpenAI completion failed: rate limit"));

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        content: [{ type: "text", text: "anthropic-result" }],
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const { ProviderClientRegistry } = await import("../../src/llm/client");
    const registry = new ProviderClientRegistry();
    const client = registry.getResilientClient("OpenAI");

    const first = await client.complete({
      model: "gpt-4o-mini",
      systemMessage: "system",
      userMessage: "user-1",
      temperature: 0.2,
      maxTokens: 400,
    });

    const second = await client.complete({
      model: "gpt-4o-mini",
      systemMessage: "system",
      userMessage: "user-2",
      temperature: 0.2,
      maxTokens: 400,
    });

    expect(first).toBe("anthropic-result");
    expect(second).toBe("anthropic-result");
    expect(mocks.openaiCreate).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("throws aggregated error when all fallback providers fail", async () => {
    mocks.openaiCreate.mockRejectedValueOnce(new Error("OpenAI completion failed: rate limit"));

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        statusText: "Too Many Requests",
        json: vi.fn().mockResolvedValue({ error: { message: "anthropic busy" } }),
      })
      .mockResolvedValueOnce({
        ok: false,
        statusText: "Service Unavailable",
        json: vi.fn().mockResolvedValue({ error: { message: "mistral unavailable" } }),
      })
      .mockResolvedValueOnce({
        ok: false,
        statusText: "Service Unavailable",
        json: vi.fn().mockResolvedValue({ error: { message: "meta unavailable" } }),
      });
    vi.stubGlobal("fetch", fetchMock);

    const { ProviderClientRegistry } = await import("../../src/llm/client");
    const registry = new ProviderClientRegistry();
    const client = registry.getResilientClient("OpenAI");

    await expect(
      client.complete({
        model: "gpt-4o-mini",
        systemMessage: "system",
        userMessage: "user",
        temperature: 0.2,
        maxTokens: 400,
      }),
    ).rejects.toThrow("All providers failed");
    expect(mocks.openaiCreate).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});
