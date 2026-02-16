import OpenAI from "openai";

import { getProviderApiKey, getProviderApiKeyEnv, getProviderBaseUrl, LLMProvider } from "../config/llm_providers";

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

export class ProviderClientRegistry {
  private readonly clients = new Map<LLMProvider, LLMClient>();

  getClient(provider: LLMProvider): LLMClient {
    const existing = this.clients.get(provider);
    if (existing) {
      return existing;
    }

    const created = createProviderClient(provider);
    this.clients.set(provider, created);
    return created;
  }
}
