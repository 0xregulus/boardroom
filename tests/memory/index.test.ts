import { beforeEach, describe, expect, it, vi } from "vitest";

import { getEmbeddingProvider } from "../../src/memory/embedder";
import { retrieveDecisionAncestryContext, retrieveMemoryContext } from "../../src/memory/retriever";

const storeMocks = vi.hoisted(() => ({
  getDecisionAncestryEmbedding: vi.fn(),
  listDecisionAncestryCandidates: vi.fn(),
  listDecisionAncestryEmbeddings: vi.fn(),
  upsertDecisionAncestryEmbedding: vi.fn(),
}));

vi.mock("../../src/store/postgres", () => ({
  getDecisionAncestryEmbedding: storeMocks.getDecisionAncestryEmbedding,
  listDecisionAncestryCandidates: storeMocks.listDecisionAncestryCandidates,
  listDecisionAncestryEmbeddings: storeMocks.listDecisionAncestryEmbeddings,
  upsertDecisionAncestryEmbedding: storeMocks.upsertDecisionAncestryEmbedding,
}));

describe("memory modules", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.BOARDROOM_EMBEDDING_PROVIDER;
    storeMocks.getDecisionAncestryEmbedding.mockResolvedValue(null);
    storeMocks.listDecisionAncestryCandidates.mockResolvedValue([]);
    storeMocks.listDecisionAncestryEmbeddings.mockResolvedValue({});
    storeMocks.upsertDecisionAncestryEmbedding.mockResolvedValue(undefined);
  });

  it("returns configured embedding provider with local fallback default", () => {
    delete process.env.BOARDROOM_EMBEDDING_PROVIDER;
    expect(getEmbeddingProvider()).toBe("local-hash");

    process.env.BOARDROOM_EMBEDDING_PROVIDER = "openai";
    expect(getEmbeddingProvider()).toBe("openai");
  });

  it("returns empty retrieval context by default", () => {
    expect(retrieveMemoryContext()).toEqual({});
  });

  it("returns top ancestry matches by vector similarity with lexical fallback available", async () => {
    storeMocks.listDecisionAncestryCandidates.mockResolvedValueOnce([
      {
        id: "d-old-1",
        name: "Marketing Expansion FY24",
        summary: "Expansion into paid social",
        bodyText: "CAC increased and payback failed.",
        gateDecision: "revision_required",
        dqs: 5.5,
        finalRecommendation: "Challenged",
        executiveSummary: "Expansion was challenged due to CAC.",
        blockers: ["CAC exceeded threshold"],
        requiredRevisions: ["Model downside CAC scenarios"],
        lastRunAt: "2026-01-01T00:00:00.000Z",
      },
      {
        id: "d-old-2",
        name: "Infrastructure Modernization",
        summary: "Migrate services",
        bodyText: "Platform migration and reliability improvements.",
        gateDecision: "approved",
        dqs: 8.9,
        finalRecommendation: "Approved",
        executiveSummary: "Approved with low growth impact.",
        blockers: [],
        requiredRevisions: [],
        lastRunAt: "2026-01-02T00:00:00.000Z",
      },
    ]);

    const context = await retrieveDecisionAncestryContext({
      decisionId: "d-new",
      decisionName: "CRM Expansion",
      decisionSummary: "Expansion and growth investment",
      bodyText: "We are planning expansion and worry about CAC and payback.",
    });

    expect(context.retrieval_method).toBe("vector-db");
    expect(context.similar_decisions.length).toBeGreaterThan(0);
    expect(context.similar_decisions[0]?.decision_id).toBe("d-old-1");
    expect(context.similar_decisions[0]?.lessons.join(" ")).toContain("CAC");
    expect(storeMocks.upsertDecisionAncestryEmbedding).toHaveBeenCalled();
  });
});
