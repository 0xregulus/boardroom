import {
  asObject,
  buildResearchQuery,
  cleanString,
  isAllowedUrl,
  isLikelyPromptInjection,
  normalizeResearchItems,
  parseAllowedHosts,
  requireAllowedHosts,
  sanitizeResearchSnapshot,
  truncate,
  type ResearchInput,
  type ResearchItem,
  type ResearchReport,
} from "./common";
import { buildSimulatedResearchReport } from "./simulation";
import { isSimulationModeEnabled } from "../simulation/mode";

const PERPLEXITY_ENDPOINT = "https://api.perplexity.ai/chat/completions";
const DEFAULT_MAX_RESULTS = 4;
const REQUEST_TIMEOUT_MS = 10000;

interface PerplexityMessage {
  content?: string;
}

interface PerplexityChoice {
  message?: PerplexityMessage;
}

interface PerplexitySearchResult {
  title?: string;
  url?: string;
  snippet?: string;
  published_date?: string;
}

interface PerplexityResponsePayload {
  choices?: PerplexityChoice[];
  citations?: unknown[];
  search_results?: PerplexitySearchResult[];
}

function perplexityApiKey(): string {
  return (process.env.PERPLEXITY_API_KEY ?? "").trim();
}

export function perplexityEnabled(): boolean {
  return perplexityApiKey().length > 0;
}

function itemFromCitation(entry: unknown, fallbackSnippet: string, allowedHosts: Set<string>): ResearchItem | null {
  const node = asObject(entry);
  const rawUrl = typeof entry === "string" ? entry : cleanString(node?.url ?? node?.link);
  const url = cleanString(rawUrl);
  if (url.length === 0 || !isAllowedUrl(url, allowedHosts)) {
    return null;
  }

  const title = truncate(cleanString(node?.title ?? node?.name ?? url), 120);
  const snippet = truncate(cleanString(node?.snippet ?? fallbackSnippet), 280);
  if (snippet.length === 0 || isLikelyPromptInjection(`${title}\n${snippet}`)) {
    return null;
  }

  return {
    title,
    url,
    snippet,
    score: null,
    publishedDate: cleanString(node?.published_date ?? node?.publishedAt ?? node?.date) || null,
  };
}

function itemFromSearchResult(entry: PerplexitySearchResult, allowedHosts: Set<string>): ResearchItem | null {
  const title = truncate(cleanString(entry.title), 120);
  const url = cleanString(entry.url);
  const snippet = truncate(cleanString(entry.snippet), 280);

  if (title.length === 0 || url.length === 0 || snippet.length === 0) {
    return null;
  }

  if (!isAllowedUrl(url, allowedHosts)) {
    return null;
  }

  if (isLikelyPromptInjection(`${title}\n${snippet}`)) {
    return null;
  }

  return {
    title,
    url,
    snippet,
    score: null,
    publishedDate: cleanString(entry.published_date) || null,
  };
}

export async function fetchPerplexityResearch(input: ResearchInput): Promise<ResearchReport | null> {
  if (isSimulationModeEnabled()) {
    return buildSimulatedResearchReport("Perplexity", {
      ...input,
      snapshot: sanitizeResearchSnapshot(input.snapshot),
    });
  }

  const apiKey = perplexityApiKey();
  if (apiKey.length === 0 || typeof fetch !== "function") {
    return null;
  }

  const allowedHosts = parseAllowedHosts();
  if (requireAllowedHosts() && allowedHosts.size === 0) {
    return null;
  }

  const sanitizedSnapshot = sanitizeResearchSnapshot(input.snapshot);
  const { query, lens } = buildResearchQuery({
    ...input,
    snapshot: sanitizedSnapshot,
  });
  const maxResults = Math.min(6, Math.max(1, input.maxResults ?? DEFAULT_MAX_RESULTS));
  const timeout = new AbortController();
  const timer = setTimeout(() => timeout.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(PERPLEXITY_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "sonar-pro",
        messages: [
          {
            role: "system",
            content:
              "You are a strategic market researcher. Return concise, evidence-first findings with concrete references.",
          },
          {
            role: "user",
            content: `${query}\n\nReturn factual findings with citations only.`,
          },
        ],
        temperature: 0,
      }),
      signal: timeout.signal,
    });

    if (!response.ok) {
      return null;
    }

    const payload = (await response.json().catch(() => null)) as PerplexityResponsePayload | null;
    const summary = cleanString(payload?.choices?.[0]?.message?.content);

    const citationItems = (payload?.citations ?? [])
      .map((entry) => itemFromCitation(entry, summary, allowedHosts))
      .filter((entry): entry is ResearchItem => Boolean(entry));

    const searchItems = Array.isArray(payload?.search_results)
      ? payload.search_results
        .map((entry) => itemFromSearchResult(entry, allowedHosts))
        .filter((entry): entry is ResearchItem => Boolean(entry))
      : [];

    const items = normalizeResearchItems([...searchItems, ...citationItems], maxResults);
    if (items.length === 0) {
      return null;
    }

    return {
      query,
      lens,
      generatedAt: new Date().toISOString(),
      items,
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
