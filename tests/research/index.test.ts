import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  fetchJinaResearch: vi.fn(),
  fetchPerplexityResearch: vi.fn(),
  fetchTavilyResearch: vi.fn(),
  resolveResearchProvider: vi.fn(),
  resolveConfiguredResearchProvider: vi.fn(),
}));

vi.mock("../../src/research/jina", () => ({
  fetchJinaResearch: mocks.fetchJinaResearch,
}));

vi.mock("../../src/research/perplexity", () => ({
  fetchPerplexityResearch: mocks.fetchPerplexityResearch,
}));

vi.mock("../../src/research/tavily", () => ({
  fetchTavilyResearch: mocks.fetchTavilyResearch,
}));

vi.mock("../../src/research/providers", () => ({
  resolveResearchProvider: mocks.resolveResearchProvider,
  resolveConfiguredResearchProvider: mocks.resolveConfiguredResearchProvider,
  listResearchProviderOptions: vi.fn(),
  researchProviderApiKeyEnv: vi.fn(),
  researchProviderEnabled: vi.fn(),
  researchProviderOptions: vi.fn(),
}));

import { fetchResearch, formatResearch, resolveRuntimeResearchProvider } from "../../src/research/index";

describe("research/index", () => {
  beforeEach(() => {
    mocks.fetchJinaResearch.mockReset();
    mocks.fetchPerplexityResearch.mockReset();
    mocks.fetchTavilyResearch.mockReset();
    mocks.resolveResearchProvider.mockReset();
    mocks.resolveConfiguredResearchProvider.mockReset();
  });

  it("routes fetchResearch to Jina provider", async () => {
    mocks.fetchJinaResearch.mockResolvedValueOnce({ query: "q" });
    const input = { agentName: "CEO", snapshot: {} };

    const result = await fetchResearch(input as any, "Jina");

    expect(mocks.fetchJinaResearch).toHaveBeenCalledWith(input);
    expect(mocks.fetchPerplexityResearch).not.toHaveBeenCalled();
    expect(mocks.fetchTavilyResearch).not.toHaveBeenCalled();
    expect(result).toEqual({ query: "q" });
  });

  it("routes fetchResearch to Perplexity provider", async () => {
    mocks.fetchPerplexityResearch.mockResolvedValueOnce({ query: "q2" });
    const input = { agentName: "CFO", snapshot: {} };

    const result = await fetchResearch(input as any, "Perplexity");

    expect(mocks.fetchPerplexityResearch).toHaveBeenCalledWith(input);
    expect(mocks.fetchJinaResearch).not.toHaveBeenCalled();
    expect(mocks.fetchTavilyResearch).not.toHaveBeenCalled();
    expect(result).toEqual({ query: "q2" });
  });

  it("routes fetchResearch to Tavily provider by default", async () => {
    mocks.fetchTavilyResearch.mockResolvedValueOnce({ query: "q3" });
    const input = { agentName: "CTO", snapshot: {} };

    const result = await fetchResearch(input as any, "Tavily");

    expect(mocks.fetchTavilyResearch).toHaveBeenCalledWith(input);
    expect(mocks.fetchJinaResearch).not.toHaveBeenCalled();
    expect(mocks.fetchPerplexityResearch).not.toHaveBeenCalled();
    expect(result).toEqual({ query: "q3" });
  });

  it("returns empty string when formatResearch receives null report", () => {
    expect(formatResearch(null, "Tavily")).toBe("");
  });

  it("formats research output with score and publication fallback values", () => {
    const output = formatResearch(
      {
        query: "market growth",
        lens: "strategy",
        generatedAt: "2026-02-21T00:00:00.000Z",
        items: [
          {
            title: "Source A",
            url: "https://example.com/a",
            snippet: "Snippet A",
            score: null,
            publishedDate: null,
          },
          {
            title: "Source B",
            url: "https://example.com/b",
            snippet: "Snippet B",
            score: 0.876,
            publishedDate: "2026-02-01",
          },
        ],
      },
      "Perplexity",
    );

    expect(output).toContain("## External Research (Perplexity)");
    expect(output).toContain("Query: market growth");
    expect(output).toContain("Lens: strategy");
    expect(output).toContain("Published: unknown | Relevance: n/a");
    expect(output).toContain("Published: 2026-02-01 | Relevance: 0.88");
    expect(output).toContain("URL: https://example.com/a");
    expect(output).toContain("Snippet: Snippet B");
  });

  it("resolves runtime research provider by composing provider resolution functions", () => {
    mocks.resolveResearchProvider.mockReturnValueOnce("Jina");
    mocks.resolveConfiguredResearchProvider.mockReturnValueOnce("Perplexity");

    const resolved = resolveRuntimeResearchProvider("  jina  ");

    expect(mocks.resolveResearchProvider).toHaveBeenCalledWith("  jina  ");
    expect(mocks.resolveConfiguredResearchProvider).toHaveBeenCalledWith("Jina");
    expect(resolved).toBe("Perplexity");
  });
});
