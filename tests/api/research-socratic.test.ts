import { beforeEach, describe, expect, it, vi } from "vitest";

import { createMockRequest, createMockResponse } from "../helpers/next_api";

const mocks = vi.hoisted(() => ({
  enforceRateLimit: vi.fn(),
  enforceSensitiveRouteAccess: vi.fn(),
  fetchResearch: vi.fn(),
  resolveConfiguredResearchProvider: vi.fn(),
}));

vi.mock("../../src/security/request_guards", () => ({
  enforceRateLimit: mocks.enforceRateLimit,
  enforceSensitiveRouteAccess: mocks.enforceSensitiveRouteAccess,
}));

vi.mock("../../src/research", () => ({
  fetchResearch: mocks.fetchResearch,
  resolveConfiguredResearchProvider: mocks.resolveConfiguredResearchProvider,
}));

import handler from "../../pages/api/research/socratic";

describe("API /api/research/socratic", () => {
  beforeEach(() => {
    mocks.enforceRateLimit.mockResolvedValue(true);
    mocks.enforceSensitiveRouteAccess.mockReturnValue(true);
    mocks.resolveConfiguredResearchProvider.mockReturnValue("Perplexity");
    mocks.fetchResearch.mockResolvedValue(null);
  });

  it("returns 405 for unsupported methods", async () => {
    const req = createMockRequest({ method: "GET" });
    const mock = createMockResponse();

    await handler(req, mock.res);

    expect(mock.statusCode).toBe(405);
    expect(mock.headers.Allow).toBe("POST");
    expect(mock.body).toEqual({ error: "Method not allowed" });
  });

  it("returns early when rate limit guard rejects request", async () => {
    mocks.enforceRateLimit.mockResolvedValueOnce(false);
    const req = createMockRequest({
      method: "POST",
      body: {
        sectionKey: "problemFraming",
        sectionContent: "Some content",
      },
    });
    const mock = createMockResponse();

    await handler(req, mock.res);

    expect(mocks.enforceRateLimit).toHaveBeenCalledTimes(1);
    expect(mocks.enforceSensitiveRouteAccess).not.toHaveBeenCalled();
    expect(mocks.fetchResearch).not.toHaveBeenCalled();
  });

  it("returns early when sensitive route access is denied", async () => {
    mocks.enforceSensitiveRouteAccess.mockReturnValueOnce(false);
    const req = createMockRequest({
      method: "POST",
      body: {
        sectionKey: "problemFraming",
        sectionContent: "Some content",
      },
    });
    const mock = createMockResponse();

    await handler(req, mock.res);

    expect(mocks.enforceSensitiveRouteAccess).toHaveBeenCalledTimes(1);
    expect(mocks.fetchResearch).not.toHaveBeenCalled();
  });

  it("returns 400 for invalid payload", async () => {
    const req = createMockRequest({
      method: "POST",
      body: {
        sectionContent: "Missing sectionKey",
      },
    });
    const mock = createMockResponse();

    await handler(req, mock.res);

    expect(mock.statusCode).toBe(400);
    expect(mock.body).toEqual({ error: "Invalid request payload." });
    expect(mocks.fetchResearch).not.toHaveBeenCalled();
  });

  it("returns 400 when both section content and prompt are empty", async () => {
    const req = createMockRequest({
      method: "POST",
      body: {
        sectionKey: "problemFraming",
        sectionContent: "  ",
        prompt: "",
      },
    });
    const mock = createMockResponse();

    await handler(req, mock.res);

    expect(mock.statusCode).toBe(400);
    expect(mock.body).toEqual({ error: "Section content or prompt is required." });
  });

  it("returns mapped research links and provider", async () => {
    mocks.fetchResearch.mockResolvedValueOnce({
      query: "query",
      lens: "lens",
      generatedAt: "2026-02-20T00:00:00.000Z",
      items: [
        {
          title: "Source 1",
          url: "https://example.com/1",
          snippet: "Snippet 1",
          score: 0.9,
          publishedDate: "2026-02-19",
        },
      ],
    });

    const req = createMockRequest({
      method: "POST",
      body: {
        decisionName: "  Expansion Plan  ",
        sectionKey: "problemFraming",
        sectionContent: "Revenue dropped 8%",
        prompt: "Validate market demand",
      },
    });
    const mock = createMockResponse();

    await handler(req, mock.res);

    expect(mocks.resolveConfiguredResearchProvider).toHaveBeenCalledWith("Tavily");
    expect(mocks.fetchResearch).toHaveBeenCalledWith(
      expect.objectContaining({
        agentName: "Socratic Mirror",
        maxResults: 6,
        snapshot: {
          properties: {
            Title: "Expansion Plan",
            "Problem Quantified": "Revenue dropped 8%",
            "Success Metrics Defined": "Validate market demand",
          },
          section_excerpt: [
            {
              text: {
                content: "problemFraming: Revenue dropped 8% Validate market demand",
              },
            },
          ],
        },
      }),
      "Perplexity",
    );

    expect(mock.statusCode).toBe(200);
    expect(mock.body).toEqual({
      links: [
        {
          title: "Source 1",
          url: "https://example.com/1",
          snippet: "Snippet 1",
          publishedDate: "2026-02-19",
        },
      ],
      provider: "Perplexity",
    });
  });

  it("returns empty links when provider has no report", async () => {
    mocks.fetchResearch.mockResolvedValueOnce(null);
    const req = createMockRequest({
      method: "POST",
      body: {
        sectionKey: "problemFraming",
        prompt: "Need external references",
      },
    });
    const mock = createMockResponse();

    await handler(req, mock.res);

    expect(mock.statusCode).toBe(200);
    expect(mock.body).toEqual({
      links: [],
      provider: "Perplexity",
    });
  });

  it("returns 500 when research retrieval throws", async () => {
    mocks.fetchResearch.mockRejectedValueOnce(new Error("upstream failed"));
    const req = createMockRequest({
      method: "POST",
      body: {
        sectionKey: "problemFraming",
        prompt: "Need references",
      },
    });
    const mock = createMockResponse();

    await handler(req, mock.res);

    expect(mock.statusCode).toBe(500);
    expect(mock.body).toEqual({ error: "Unable to fetch research right now." });
  });
});
