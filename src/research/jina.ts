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

const JINA_ENDPOINT = "https://api.jina.ai/v1/search";
const DEFAULT_MAX_RESULTS = 4;
const REQUEST_TIMEOUT_MS = 8000;

interface JinaSearchResponsePayload {
  data?: unknown[];
  results?: unknown[];
}

function jinaApiKey(): string {
  return (process.env.JINA_API_KEY ?? "").trim();
}

export function jinaEnabled(): boolean {
  return jinaApiKey().length > 0;
}

function mapJinaResult(entry: unknown, allowedHosts: Set<string>): ResearchItem | null {
  const node = asObject(entry);
  const title = truncate(cleanString(node?.title ?? node?.name), 120);
  const url = cleanString(node?.url ?? node?.link);
  const snippet = truncate(
    cleanString(node?.snippet ?? node?.description ?? node?.content ?? node?.text ?? node?.summary),
    280,
  );

  if (title.length === 0 || url.length === 0 || snippet.length === 0) {
    return null;
  }

  if (!isAllowedUrl(url, allowedHosts)) {
    return null;
  }

  if (isLikelyPromptInjection(`${title}\n${snippet}`)) {
    return null;
  }

  const score = node?.score;
  const publishedDate = cleanString(node?.published_date ?? node?.publishedAt ?? node?.date) || null;

  return {
    title,
    url,
    snippet,
    score: typeof score === "number" && Number.isFinite(score) ? score : null,
    publishedDate,
  };
}

function mapResults(results: unknown[], maxResults: number, allowedHosts: Set<string>): ResearchItem[] {
  const mapped = results
    .map((entry) => mapJinaResult(entry, allowedHosts))
    .filter((entry): entry is ResearchItem => Boolean(entry));

  return normalizeResearchItems(mapped, maxResults);
}

export async function fetchJinaResearch(input: ResearchInput): Promise<ResearchReport | null> {
  if (isSimulationModeEnabled()) {
    return buildSimulatedResearchReport("Jina", {
      ...input,
      snapshot: sanitizeResearchSnapshot(input.snapshot),
    });
  }

  const apiKey = jinaApiKey();
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
    const response = await fetch(JINA_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        query,
        count: maxResults,
      }),
      signal: timeout.signal,
    });

    if (!response.ok) {
      return null;
    }

    const payload = (await response.json().catch(() => null)) as JinaSearchResponsePayload | null;
    const rawResults = Array.isArray(payload?.data) ? payload.data : Array.isArray(payload?.results) ? payload.results : [];

    const items = mapResults(rawResults, maxResults, allowedHosts);
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
