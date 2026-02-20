import { hashString, resolveSimulationDelayMs, sleepMs } from "../simulation/mode";
import { buildResearchQuery, type ResearchInput, type ResearchItem, type ResearchReport } from "./common";

function simulatedItem(provider: string, query: string, lens: string, index: number): ResearchItem {
  const seed = hashString(`${provider}:${query}:${index}`);
  const titleTopic = lens.split(",")[0]?.trim() || "Market signal";
  const domain = provider.toLowerCase();

  return {
    title: `${titleTopic} signal ${index + 1} (${provider} simulation)`,
    url: `https://simulation.local/${domain}/signal-${index + 1}`,
    snippet: `Synthetic ${provider} evidence item for local development. Seed=${seed}.`,
    score: Number((0.6 + ((seed % 39) / 100)).toFixed(2)),
    publishedDate: new Date(Date.now() - index * 86_400_000).toISOString().slice(0, 10),
  };
}

export async function buildSimulatedResearchReport(
  provider: "Tavily" | "Jina" | "Perplexity",
  input: ResearchInput,
): Promise<ResearchReport> {
  const { query, lens } = buildResearchQuery(input);
  const maxResults = Math.min(6, Math.max(1, input.maxResults ?? 4));
  const delayMs = resolveSimulationDelayMs(`research:${provider}:${query.slice(0, 120)}`);
  await sleepMs(delayMs);

  const items = Array.from({ length: maxResults }, (_, index) => simulatedItem(provider, query, lens, index));
  return {
    query,
    lens,
    generatedAt: new Date().toISOString(),
    items,
  };
}
