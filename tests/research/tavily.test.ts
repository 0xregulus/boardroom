import { afterEach, describe, expect, it, vi } from "vitest";

import { fetchTavilyResearch, formatTavilyResearch, tavilyEnabled } from "../../src/research/tavily";

const ORIGINAL_API_KEY = process.env.TAVILY_API_KEY;

afterEach(() => {
  if (ORIGINAL_API_KEY === undefined) {
    delete process.env.TAVILY_API_KEY;
  } else {
    process.env.TAVILY_API_KEY = ORIGINAL_API_KEY;
  }
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("tavilyEnabled", () => {
  it("returns false when api key is missing", () => {
    delete process.env.TAVILY_API_KEY;
    expect(tavilyEnabled()).toBe(false);
  });

  it("returns true when api key is configured", () => {
    process.env.TAVILY_API_KEY = "tvly-test-key";
    expect(tavilyEnabled()).toBe(true);
  });
});

describe("fetchTavilyResearch", () => {
  it("returns null when api key is missing", async () => {
    delete process.env.TAVILY_API_KEY;
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const report = await fetchTavilyResearch({
      agentName: "CEO",
      snapshot: {},
    });

    expect(report).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("maps Tavily results into normalized research items", async () => {
    process.env.TAVILY_API_KEY = "tvly-test-key";
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        results: [
          {
            title: "Market report",
            url: "https://example.com/market-report",
            content: "Demand is growing 24% YoY with stronger enterprise adoption.",
            score: 0.92,
            published_date: "2026-01-30",
          },
          {
            title: "",
            url: "https://example.com/invalid",
            content: "Missing title should be ignored.",
            score: 0.12,
          },
        ],
      }),
    });
    vi.stubGlobal("fetch", fetchSpy);

    const report = await fetchTavilyResearch({
      agentName: "CFO",
      snapshot: {
        section_excerpt: [{ text: { content: "Expand into adjacent SMB segment in North America." } }],
      },
    });

    expect(report).not.toBeNull();
    expect(report?.items).toHaveLength(1);
    expect(report?.items[0]).toMatchObject({
      title: "Market report",
      url: "https://example.com/market-report",
      score: 0.92,
      publishedDate: "2026-01-30",
    });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const body = JSON.parse(String(fetchSpy.mock.calls[0]?.[1]?.body));
    expect(body.api_key).toBe("tvly-test-key");
    expect(String(body.query)).toContain("Expand into adjacent SMB segment");
  });
});

describe("formatTavilyResearch", () => {
  it("renders a citation block for prompts", () => {
    const formatted = formatTavilyResearch({
      query: "test query",
      lens: "test lens",
      generatedAt: "2026-02-16T00:00:00.000Z",
      items: [
        {
          title: "Signal",
          url: "https://example.com/signal",
          snippet: "Relevant strategic evidence.",
          score: 0.7,
          publishedDate: "2026-01-01",
        },
      ],
    });

    expect(formatted).toContain("External Research (Tavily)");
    expect(formatted).toContain("https://example.com/signal");
    expect(formatted).toContain("Relevant strategic evidence.");
  });
});
