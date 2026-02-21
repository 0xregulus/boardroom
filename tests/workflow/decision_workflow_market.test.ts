import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  fetchResearch: vi.fn(),
}));

vi.mock("../../src/research", () => ({
  fetchResearch: mocks.fetchResearch,
}));

import { runMarketIntelligence } from "../../src/workflow/decision_workflow_market";

function buildState(withSnapshot = true) {
  return {
    decision_snapshot: withSnapshot
      ? {
        properties: { Title: "Decision A" },
        section_excerpt: [{ text: { content: "Core context" } }],
      }
      : null,
    missing_sections: ["Problem Quantified"],
    market_intelligence: "placeholder",
  } as any;
}

describe("runMarketIntelligence", () => {
  beforeEach(() => {
    mocks.fetchResearch.mockReset();
  });

  it("returns null intelligence when external research is disabled", async () => {
    const state = buildState(true);
    const output = await runMarketIntelligence(state, {
      includeExternalResearch: false,
    } as any);

    expect(output.market_intelligence).toBeNull();
    expect(mocks.fetchResearch).not.toHaveBeenCalled();
  });

  it("returns null intelligence when no decision snapshot is present", async () => {
    const state = buildState(false);
    const output = await runMarketIntelligence(state, {
      includeExternalResearch: true,
    } as any);

    expect(output.market_intelligence).toBeNull();
    expect(mocks.fetchResearch).not.toHaveBeenCalled();
  });

  it("returns null intelligence when all research calls return empty reports", async () => {
    mocks.fetchResearch.mockResolvedValue(null);
    const state = buildState(true);

    const output = await runMarketIntelligence(state, {
      includeExternalResearch: true,
      researchProvider: "Tavily",
      agentConfigs: [{ id: "ceo", role: "CEO", name: "CEO" }],
    } as any);

    expect(mocks.fetchResearch).toHaveBeenCalledTimes(3);
    expect(output.market_intelligence).toBeNull();
  });

  it("builds aggregated market intelligence from unique analyst reports with capped highlights and sources", async () => {
    mocks.fetchResearch.mockImplementation(async (input: { agentName: string }) => {
      if (input.agentName === "Finance Agent") {
        return null;
      }

      const normalized = input.agentName.toLowerCase().replace(/\s+/g, "-");
      return {
        query: `query:${input.agentName}`,
        lens: `lens:${input.agentName}`,
        generatedAt: "2026-02-21T00:00:00.000Z",
        items: [
          {
            title: `${input.agentName}-A`,
            url: `https://example.com/${normalized}/a`,
            snippet: "Signal A",
            score: 0.9,
            publishedDate: null,
          },
          {
            title: `${input.agentName}-B`,
            url: `https://example.com/${normalized}/b`,
            snippet: "Signal B",
            score: 0.8,
            publishedDate: null,
          },
          {
            title: `${input.agentName}-C`,
            url: `https://example.com/${normalized}/c`,
            snippet: "Signal C",
            score: 0.7,
            publishedDate: null,
          },
        ],
      };
    });

    const state = buildState(true);
    const output = await runMarketIntelligence(state, {
      includeExternalResearch: true,
      researchProvider: "Jina",
      agentConfigs: [
        { id: "ceo", role: "CEO", name: "Chief Executive" },
        { id: "ceo", role: "ceo", name: "Duplicate by normalized id+role" },
        { id: "cfo", role: "", name: "Finance Agent" },
        { id: "cto", role: "CTO", name: "Technology" },
        { id: "compliance", role: "Compliance", name: "Legal" },
        { id: "growth", role: "Growth", name: "Growth" },
      ],
    } as any);

    expect(mocks.fetchResearch).toHaveBeenCalledTimes(7);
    const calledAnalysts = mocks.fetchResearch.mock.calls.map((call) => call[0]?.agentName);
    expect(calledAnalysts).toEqual([
      "CEO",
      "Finance Agent",
      "CTO",
      "Compliance",
      "Growth",
      "Market Intelligence Analyst",
      "Competitor Intelligence Analyst",
    ]);
    expect(mocks.fetchResearch).toHaveBeenCalledWith(
      expect.objectContaining({
        agentName: "CEO",
        snapshot: state.decision_snapshot,
        missingSections: ["Problem Quantified"],
        maxResults: 3,
      }),
      "Jina",
    );

    expect(output.market_intelligence).not.toBeNull();
    expect(output.market_intelligence?.signals).toHaveLength(6);
    expect(output.market_intelligence?.generated_at).toEqual(expect.any(String));
    expect(output.market_intelligence?.highlights).toHaveLength(8);
    expect(output.market_intelligence?.source_urls).toHaveLength(10);
    expect(output.market_intelligence?.signals[0]).toMatchObject({
      analyst: "CEO",
      query: "query:CEO",
      lens: "lens:CEO",
      highlights: ["CEO-A: Signal A", "CEO-B: Signal B"],
      source_urls: ["https://example.com/ceo/a", "https://example.com/ceo/b", "https://example.com/ceo/c"],
    });
  });
});
