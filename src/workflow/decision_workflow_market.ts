import { fetchResearch } from "../research";
import type { WorkflowDependencies } from "./decision_workflow_runtime";
import type { WorkflowMarketIntelligenceSignal, WorkflowState } from "./states";

export async function runMarketIntelligence(state: WorkflowState, deps: WorkflowDependencies): Promise<WorkflowState> {
  if (!deps.includeExternalResearch || !state.decision_snapshot) {
    return {
      ...state,
      market_intelligence: null,
    };
  }

  const analystSeeds: Array<{ id: string; analyst: string }> = [
    ...deps.agentConfigs.map((config) => ({
      id: config.id,
      analyst: config.role.trim().length > 0 ? config.role : config.name,
    })),
    { id: "market-intelligence", analyst: "Market Intelligence Analyst" },
    { id: "competitor-intelligence", analyst: "Competitor Intelligence Analyst" },
  ];

  const uniqueAnalysts = new Map<string, { id: string; analyst: string }>();
  for (const entry of analystSeeds) {
    const normalizedKey = `${entry.id}:${entry.analyst}`.toLowerCase();
    if (!uniqueAnalysts.has(normalizedKey)) {
      uniqueAnalysts.set(normalizedKey, entry);
    }
  }

  const results = await Promise.all(
    [...uniqueAnalysts.values()].map(async (entry) => {
      const report = await fetchResearch(
        {
          agentName: entry.analyst,
          snapshot: state.decision_snapshot as unknown as Record<string, unknown>,
          missingSections: state.missing_sections,
          maxResults: 3,
        },
        deps.researchProvider,
      );

      return { entry, report };
    }),
  );

  const signals: WorkflowMarketIntelligenceSignal[] = [];
  const sourceUrls = new Set<string>();
  const highlights = new Set<string>();

  for (const { entry, report } of results) {
    if (!report || report.items.length === 0) {
      continue;
    }

    const itemHighlights = report.items.slice(0, 2).map((item) => `${item.title}: ${item.snippet}`);
    for (const item of report.items) {
      sourceUrls.add(item.url);
    }
    for (const highlight of itemHighlights) {
      highlights.add(highlight);
    }

    signals.push({
      analyst: entry.analyst,
      lens: report.lens,
      query: report.query,
      highlights: itemHighlights,
      source_urls: report.items.map((item) => item.url),
    });
  }

  if (signals.length === 0) {
    return {
      ...state,
      market_intelligence: null,
    };
  }

  return {
    ...state,
    market_intelligence: {
      generated_at: new Date().toISOString(),
      highlights: [...highlights].slice(0, 8),
      source_urls: [...sourceUrls].slice(0, 10),
      signals,
    },
  };
}
