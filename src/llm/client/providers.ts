import OpenAI from "openai";

import { type LLMProvider } from "../../config/llm_providers";
import { isSimulationModeEnabled } from "../../simulation/mode";
import { jsonOnlyInstruction, requireProviderApiKey, requireProviderBaseUrl } from "./config";
import { simulateCompletion } from "./simulation";
import type {
  AnthropicCompletionResponse,
  LLMClient,
  LLMCompletionRequest,
  OpenAICompatibleCompletionResponse,
} from "./types";

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

export function createProviderClient(provider: LLMProvider): LLMClient {
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
