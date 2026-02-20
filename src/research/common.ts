import { sanitizeForExternalUse } from "../security/redaction";

const MAX_CONTEXT_LENGTH = 700;
const MAX_SNIPPET_LENGTH = 280;

const PROMPT_INJECTION_SIGNALS = [
  "ignore previous instructions",
  "disregard previous instructions",
  "reveal your system prompt",
  "show me the system prompt",
  "developer message",
  "act as",
];

export interface ResearchInput {
  agentName: string;
  snapshot: Record<string, unknown>;
  missingSections?: string[];
  maxResults?: number;
}

export interface ResearchItem {
  title: string;
  url: string;
  snippet: string;
  score: number | null;
  publishedDate: string | null;
}

export interface ResearchReport {
  query: string;
  lens: string;
  generatedAt: string;
  items: ResearchItem[];
}

export function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

export function cleanString(value: unknown): string {
  return typeof value === "string" ? normalizeWhitespace(value) : "";
}

export function truncate(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, Math.max(0, maxLength - 3)).trimEnd()}...`;
}

export function asObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

function decisionContext(snapshot: Record<string, unknown>): string {
  const excerptEntries = Array.isArray(snapshot.section_excerpt) ? snapshot.section_excerpt : [];
  const excerptText = excerptEntries
    .map((entry) => {
      const textNode = asObject(entry);
      const nested = asObject(textNode?.text);
      return cleanString(nested?.content);
    })
    .filter((entry) => entry.length > 0)
    .join(" ");

  const properties = asObject(snapshot.properties);
  const signalFields = [
    "Title",
    "Strategic Alignment Brief",
    "Problem Quantified",
    "Success Metrics Defined",
    "Leading Indicators Defined",
  ]
    .map((key) => {
      const raw = properties?.[key];
      if (typeof raw === "string") {
        const value = cleanString(raw);
        return value.length > 0 ? `${key}: ${value}` : "";
      }
      if (typeof raw === "number" || typeof raw === "boolean") {
        return `${key}: ${String(raw)}`;
      }
      return "";
    })
    .filter((entry) => entry.length > 0)
    .join("; ");

  const combined = normalizeWhitespace(`${excerptText} ${signalFields}`);
  if (combined.length === 0) {
    return "No detailed proposal context was provided.";
  }

  return truncate(combined, MAX_CONTEXT_LENGTH);
}

export function researchLens(agentName: string): string {
  const normalized = agentName.trim().toLowerCase();

  if (normalized.includes("competitor")) {
    return "Competitor launches, pricing changes, market positioning, differentiation claims, and substitution threats.";
  }
  if (normalized.includes("market intelligence") || normalized.includes("market analyst")) {
    return "Market demand, customer behavior shifts, category growth, macro drivers, and market structure changes.";
  }
  if (normalized.includes("ceo")) {
    return "Market demand, competition, strategic positioning, and macroeconomic shifts.";
  }
  if (normalized.includes("cfo")) {
    return "Capital efficiency, ROI benchmarks, cost trends, and downside financial scenarios.";
  }
  if (normalized.includes("cto")) {
    return "Technology maturity, implementation complexity, scalability constraints, and operational reliability.";
  }
  if (normalized.includes("compliance") || normalized.includes("counsel") || normalized.includes("legal")) {
    return "Regulatory obligations, legal precedent, privacy/security obligations, and governance exposure.";
  }

  return "Recent objective evidence, market context, and execution risks relevant to the proposal.";
}

export function buildResearchQuery(input: ResearchInput): { query: string; lens: string } {
  const lens = researchLens(input.agentName);
  const context = decisionContext(input.snapshot);
  const missing =
    Array.isArray(input.missingSections) && input.missingSections.length > 0
      ? `Known missing sections: ${input.missingSections.join(", ")}.`
      : "";

  const query = normalizeWhitespace(
    [
      "Find recent and credible external evidence for this strategic decision.",
      `Analyst lens: ${lens}`,
      `Proposal context: ${context}`,
      missing,
      "Prioritize primary sources, filings, market data, and concrete numbers.",
    ].join(" "),
  );

  return { query, lens };
}

export function parseAllowedHosts(): Set<string> {
  const primary = (process.env.RESEARCH_ALLOWED_HOSTS ?? "").trim();
  const fallback = (process.env.TAVILY_ALLOWED_HOSTS ?? "").trim();
  const raw = primary.length > 0 ? primary : fallback;
  if (raw.length === 0) {
    return new Set<string>();
  }

  return new Set(
    raw
      .split(",")
      .map((entry) => entry.trim().toLowerCase())
      .filter((entry) => entry.length > 0),
  );
}

export function requireAllowedHosts(): boolean {
  const primary = (process.env.RESEARCH_REQUIRE_ALLOWED_HOSTS ?? "").trim().toLowerCase();
  const fallback = (process.env.TAVILY_REQUIRE_ALLOWED_HOSTS ?? "").trim().toLowerCase();
  const configured = primary.length > 0 ? primary : fallback;

  if (configured === "false") {
    return false;
  }
  if (configured === "true") {
    return true;
  }

  return true;
}

export function isLikelyPromptInjection(text: string): boolean {
  const normalized = text.toLowerCase();
  return PROMPT_INJECTION_SIGNALS.some((signal) => normalized.includes(signal));
}

function parsedUrl(url: string): URL | null {
  try {
    return new URL(url);
  } catch {
    return null;
  }
}

function isPrivateOrLocalHost(host: string): boolean {
  const normalized = host.trim().toLowerCase();
  if (normalized.length === 0) {
    return true;
  }

  if (
    normalized === "localhost" ||
    normalized === "::1" ||
    normalized === "0.0.0.0" ||
    normalized.endsWith(".localhost")
  ) {
    return true;
  }

  if (/^\d+\.\d+\.\d+\.\d+$/.test(normalized)) {
    const octets = normalized.split(".").map((entry) => Number(entry));
    const [first, second] = octets;
    if (octets.some((entry) => !Number.isInteger(entry) || entry < 0 || entry > 255)) {
      return true;
    }

    if (first === 10 || first === 127) {
      return true;
    }
    if (first === 169 && second === 254) {
      return true;
    }
    if (first === 192 && second === 168) {
      return true;
    }
    if (first === 172 && typeof second === "number" && second >= 16 && second <= 31) {
      return true;
    }
  }

  if (
    normalized.startsWith("fc") ||
    normalized.startsWith("fd") ||
    normalized.startsWith("fe80:") ||
    normalized.startsWith("::ffff:127.")
  ) {
    return true;
  }

  return false;
}

function isSafePublicHttpsUrl(url: string): boolean {
  const parsed = parsedUrl(url);
  if (!parsed) {
    return false;
  }

  if (parsed.protocol !== "https:") {
    return false;
  }

  return !isPrivateOrLocalHost(parsed.hostname.toLowerCase());
}

function hostMatchesAllowEntry(host: string, entry: string): boolean {
  const normalizedEntry = entry.trim().toLowerCase();
  if (normalizedEntry.length === 0) {
    return false;
  }

  if (normalizedEntry.startsWith("*.")) {
    const suffix = normalizedEntry.slice(2);
    return host === suffix || host.endsWith(`.${suffix}`);
  }

  if (normalizedEntry.startsWith(".")) {
    const suffix = normalizedEntry.slice(1);
    return host === suffix || host.endsWith(`.${suffix}`);
  }

  return host === normalizedEntry;
}

export function isAllowedUrl(url: string, allowedHosts: Set<string>): boolean {
  if (!isSafePublicHttpsUrl(url)) {
    return false;
  }

  const parsed = parsedUrl(url);
  if (!parsed) {
    return false;
  }

  const host = parsed.hostname.toLowerCase();
  if (allowedHosts.size === 0) {
    return true;
  }

  for (const entry of allowedHosts) {
    if (hostMatchesAllowEntry(host, entry)) {
      return true;
    }
  }

  return false;
}

export function sanitizeResearchSnapshot(snapshot: Record<string, unknown>): Record<string, unknown> {
  return sanitizeForExternalUse(snapshot) as Record<string, unknown>;
}

export function normalizeResearchItems(items: ResearchItem[], maxResults: number): ResearchItem[] {
  return items.slice(0, Math.max(1, maxResults)).map((item) => ({
    title: truncate(cleanString(item.title), 120),
    url: cleanString(item.url),
    snippet: truncate(cleanString(item.snippet), MAX_SNIPPET_LENGTH),
    score: typeof item.score === "number" && Number.isFinite(item.score) ? item.score : null,
    publishedDate: cleanString(item.publishedDate) || null,
  }));
}
