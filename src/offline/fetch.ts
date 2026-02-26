import type { LLMProvider } from "../config/llm_providers";
import { offlineCompletion } from "../llm/client/offline";
import { hashString, isOfflineModeEnabled, resolveOfflineDelayMs, sleepMs } from "./mode";

type FetchInput = Parameters<typeof fetch>[0];
type FetchInit = Parameters<typeof fetch>[1];

interface ParsedRequest {
  url: URL;
  body: Record<string, unknown> | null;
}

function asObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function toUrl(input: FetchInput): URL | null {
  if (typeof input === "string") {
    try {
      return new URL(input);
    } catch {
      return null;
    }
  }

  if (input instanceof URL) {
    return input;
  }

  if (typeof Request !== "undefined" && input instanceof Request) {
    try {
      return new URL(input.url);
    } catch {
      return null;
    }
  }

  return null;
}

function textFromMessageContent(content: unknown): string {
  if (typeof content === "string") {
    return content;
  }

  if (!Array.isArray(content)) {
    return "";
  }

  return content
    .map((entry) => {
      const node = asObject(entry);
      if (!node) {
        return "";
      }

      if (typeof node.text === "string") {
        return node.text;
      }

      const maybeText = asObject(node.text);
      return maybeText ? asString(maybeText.value) : "";
    })
    .filter((entry) => entry.length > 0)
    .join("\n");
}

async function parseRequest(input: FetchInput, init?: FetchInit): Promise<ParsedRequest | null> {
  const url = toUrl(input);
  if (!url) {
    return null;
  }

  if (!init?.body || typeof init.body !== "string") {
    return { url, body: null };
  }

  try {
    const parsed = JSON.parse(init.body) as unknown;
    return { url, body: asObject(parsed) };
  } catch {
    return { url, body: null };
  }
}

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "Content-Type": "application/json",
    },
  });
}

function clampResults(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.min(6, Math.max(1, Math.round(value)));
  }

  return 4;
}

function detectProviderFromUrl(url: URL, body: Record<string, unknown> | null): LLMProvider {
  const host = url.hostname.toLowerCase();
  const model = asString(body?.model).toLowerCase();

  if (host.includes("anthropic") || url.pathname.includes("/v1/messages") || model.includes("claude")) {
    return "Anthropic";
  }
  if (host.includes("mistral") || model.includes("mistral")) {
    return "Mistral";
  }
  if (host.includes("llama") || host.includes("meta") || model.includes("llama")) {
    return "Meta";
  }

  return "OpenAI";
}

function openAIStyleRequest(provider: LLMProvider, body: Record<string, unknown> | null) {
  const model = asString(body?.model) || "gpt-4o-mini";
  const messages = Array.isArray(body?.messages) ? body.messages : [];
  const system = messages.find((entry) => asObject(entry)?.role === "system");
  const user = [...messages].reverse().find((entry) => asObject(entry)?.role === "user");
  const temperature = typeof body?.temperature === "number" && Number.isFinite(body.temperature) ? body.temperature : 0.2;
  const maxTokens = typeof body?.max_tokens === "number" && Number.isFinite(body.max_tokens) ? body.max_tokens : 800;
  const responseFormat = asObject(body?.response_format);
  const userMessage = textFromMessageContent(asObject(user)?.content);

  return {
    provider,
    request: {
      model,
      systemMessage: textFromMessageContent(asObject(system)?.content),
      userMessage,
      temperature,
      maxTokens,
      requireJsonObject:
        asString(responseFormat?.type) === "json_object" || /json object|return only json/i.test(userMessage),
    },
  };
}

function anthropicStyleRequest(body: Record<string, unknown> | null) {
  const messages = Array.isArray(body?.messages) ? body.messages : [];
  const user = [...messages].reverse().find((entry) => asObject(entry)?.role === "user");
  const userMessage = textFromMessageContent(asObject(user)?.content);

  return {
    provider: "Anthropic" as const,
    request: {
      model: asString(body?.model) || "claude-3-5-sonnet-latest",
      systemMessage: asString(body?.system),
      userMessage,
      temperature: typeof body?.temperature === "number" && Number.isFinite(body.temperature) ? body.temperature : 0.2,
      maxTokens: typeof body?.max_tokens === "number" && Number.isFinite(body.max_tokens) ? body.max_tokens : 800,
      requireJsonObject: /json object|return only json/i.test(userMessage),
    },
  };
}

function buildOfflineResearchItems(provider: "Tavily" | "Jina" | "Perplexity", query: string, maxResults: number) {
  const normalizedQuery = query.trim().length > 0 ? query.trim() : "Strategic signal";

  return Array.from({ length: maxResults }, (_, index) => {
    const seed = hashString(`${provider}:${normalizedQuery}:${index}`);
    return {
      title: `${normalizedQuery.slice(0, 56)} signal ${index + 1} (${provider} offline)`,
      url: `https://offline.local/${provider.toLowerCase()}/signal-${index + 1}`,
      snippet: `Synthetic ${provider} evidence item for local development. Seed=${seed}.`,
      score: Number((0.6 + ((seed % 39) / 100)).toFixed(2)),
      published_date: new Date(Date.now() - index * 86_400_000).toISOString().slice(0, 10),
    };
  });
}

function buildOfflineEmbeddingVector(input: string, dimensions = 256): number[] {
  const size = Math.max(64, Math.min(1536, dimensions));
  const vector = new Array<number>(size).fill(0);

  for (let index = 0; index < input.length; index += 1) {
    const seed = hashString(`${input}:${index}`);
    const bucket = seed % size;
    const value = ((seed % 2000) - 1000) / 1000;
    vector[bucket] += value;
  }

  let norm = 0;
  for (const value of vector) {
    norm += value * value;
  }

  if (norm <= 0) {
    return vector;
  }

  const scale = 1 / Math.sqrt(norm);
  return vector.map((value) => Number((value * scale).toFixed(8)));
}

async function offlineResponseForRequest(parsed: ParsedRequest): Promise<Response | null> {
  const { url, body } = parsed;
  const target = `${url.origin}${url.pathname}`.toLowerCase();

  if (target.includes("api.tavily.com/search")) {
    const query = asString(body?.query);
    const maxResults = clampResults(body?.max_results);
    await sleepMs(resolveOfflineDelayMs(`research:Tavily:${query.slice(0, 120)}`));
    const results = buildOfflineResearchItems("Tavily", query, maxResults).map((entry) => ({
      title: entry.title,
      url: entry.url,
      content: entry.snippet,
      score: entry.score,
      published_date: entry.published_date,
    }));
    return jsonResponse({ results });
  }

  if (target.includes("api.jina.ai/v1/search")) {
    const query = asString(body?.query);
    const maxResults = clampResults(body?.count);
    await sleepMs(resolveOfflineDelayMs(`research:Jina:${query.slice(0, 120)}`));
    const data = buildOfflineResearchItems("Jina", query, maxResults).map((entry) => ({
      title: entry.title,
      url: entry.url,
      snippet: entry.snippet,
      score: entry.score,
      published_date: entry.published_date,
    }));
    return jsonResponse({ data });
  }

  if (target.includes("api.perplexity.ai/chat/completions")) {
    const messages = Array.isArray(body?.messages) ? body.messages : [];
    const user = [...messages].reverse().find((entry) => asObject(entry)?.role === "user");
    const query = textFromMessageContent(asObject(user)?.content);
    const maxResults = 4;
    await sleepMs(resolveOfflineDelayMs(`research:Perplexity:${query.slice(0, 120)}`));
    const searchResults = buildOfflineResearchItems("Perplexity", query, maxResults);
    return jsonResponse({
      choices: [
        {
          message: {
            content: "Offline mode generated synthetic research snippets for local development.",
          },
        },
      ],
      citations: searchResults.slice(0, 2).map((entry) => entry.url),
      search_results: searchResults.map((entry) => ({
        title: entry.title,
        url: entry.url,
        snippet: entry.snippet,
        published_date: entry.published_date,
      })),
    });
  }

  if (target.includes("/v1/messages")) {
    const { provider, request } = anthropicStyleRequest(body);
    const content = await offlineCompletion(provider, request);
    return jsonResponse({
      id: `msg_offline_${hashString(`${request.model}:${request.userMessage}`)}`,
      type: "message",
      role: "assistant",
      model: request.model,
      content: [{ type: "text", text: content }],
      stop_reason: "end_turn",
    });
  }

  if (target.includes("/chat/completions")) {
    const provider = detectProviderFromUrl(url, body);
    const { request } = openAIStyleRequest(provider, body);
    const content = await offlineCompletion(provider, request);
    return jsonResponse({
      id: `chatcmpl-offline-${hashString(`${provider}:${request.model}:${request.userMessage}`)}`,
      object: "chat.completion",
      created: Math.floor(Date.now() / 1000),
      model: request.model,
      choices: [
        {
          index: 0,
          finish_reason: "stop",
          message: {
            role: "assistant",
            content,
          },
        },
      ],
      usage: {
        prompt_tokens: 0,
        completion_tokens: 0,
        total_tokens: 0,
      },
    });
  }

  if (target.includes("/embeddings")) {
    const model = asString(body?.model) || "text-embedding-3-small";
    const input = asString(body?.input);
    const vector = buildOfflineEmbeddingVector(input);
    await sleepMs(resolveOfflineDelayMs(`embedding:${input.slice(0, 120)}`));
    return jsonResponse({
      object: "list",
      data: [
        {
          object: "embedding",
          index: 0,
          embedding: vector,
        },
      ],
      model,
      usage: {
        prompt_tokens: 0,
        total_tokens: 0,
      },
    });
  }

  return null;
}

export async function offlineAwareFetch(input: FetchInput, init?: FetchInit): Promise<Response> {
  if (!isOfflineModeEnabled()) {
    return fetch(input, init);
  }

  const parsed = await parseRequest(input, init);
  if (!parsed) {
    return fetch(input, init);
  }

  const mocked = await offlineResponseForRequest(parsed);
  if (mocked) {
    return mocked;
  }

  return fetch(input, init);
}
