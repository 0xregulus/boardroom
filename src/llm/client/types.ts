import type { LLMProvider } from "../../config/llm_providers";

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

export interface OpenAICompatibleCompletionResponse {
  choices?: Array<{
    message?: {
      content?: string | null;
    };
  }>;
  error?: {
    message?: string;
  };
}

export interface AnthropicCompletionResponse {
  content?: Array<{
    type?: string;
    text?: string;
  }>;
  error?: {
    message?: string;
  };
}
