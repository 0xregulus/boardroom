import { beforeEach, describe, expect, it, vi } from "vitest";

import type { DecisionAncestryCandidate, DecisionAncestryEmbedding } from "../../src/store/postgres/types";

const mocks = vi.hoisted(() => ({
  getDecisionAncestryEmbedding: vi.fn(),
  listDecisionAncestryCandidates: vi.fn(),
  listDecisionAncestryEmbeddings: vi.fn(),
  upsertDecisionAncestryEmbedding: vi.fn(),
  buildEmbeddingSourceHash: vi.fn((text: string) => `hash:${text}`),
  cosineSimilarityVectors: vi.fn((left: number[], right: number[]) => {
    const size = Math.min(left.length, right.length);
    let dot = 0;
    for (let index = 0; index < size; index += 1) {
      const l = Number.isFinite(left[index]) ? left[index] : 0;
      const r = Number.isFinite(right[index]) ? right[index] : 0;
      dot += l * r;
    }
    return dot;
  }),
  embedText: vi.fn(),
}));

vi.mock("../../src/store/postgres", () => ({
  getDecisionAncestryEmbedding: mocks.getDecisionAncestryEmbedding,
  listDecisionAncestryCandidates: mocks.listDecisionAncestryCandidates,
  listDecisionAncestryEmbeddings: mocks.listDecisionAncestryEmbeddings,
  upsertDecisionAncestryEmbedding: mocks.upsertDecisionAncestryEmbedding,
}));

vi.mock("../../src/memory/embedder", () => ({
  buildEmbeddingSourceHash: mocks.buildEmbeddingSourceHash,
  cosineSimilarityVectors: mocks.cosineSimilarityVectors,
  embedText: mocks.embedText,
}));

import { retrieveDecisionAncestryContext } from "../../src/memory/retriever";

function candidate(overrides: Partial<DecisionAncestryCandidate> = {}): DecisionAncestryCandidate {
  return {
    id: "d-old-1",
    name: "Legacy Decision",
    summary: "Summary",
    bodyText: "Growth strategy and CAC mitigation plan.",
    gateDecision: "challenged",
    dqs: 6.2,
    finalRecommendation: "Challenged",
    executiveSummary: "Legacy decision context.",
    blockers: ["Blocker A", "Blocker B", "Blocker C"],
    requiredRevisions: ["Revision A", "Revision B", "Revision C"],
    lastRunAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("memory/retriever", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getDecisionAncestryEmbedding.mockResolvedValue(null);
    mocks.listDecisionAncestryCandidates.mockResolvedValue([]);
    mocks.listDecisionAncestryEmbeddings.mockResolvedValue({});
    mocks.upsertDecisionAncestryEmbedding.mockResolvedValue(undefined);
    mocks.embedText.mockResolvedValue({
      provider: "local-hash",
      model: "local-hash-v1",
      dimensions: 2,
      vector: [1, 0],
    });
  });

  it("returns lexical fallback when decision id is blank", async () => {
    const result = await retrieveDecisionAncestryContext({
      decisionId: "   ",
      bodyText: "non-empty",
    });

    expect(result).toEqual({
      similar_decisions: [],
      retrieval_method: "lexical-fallback",
    });
    expect(mocks.listDecisionAncestryCandidates).not.toHaveBeenCalled();
  });

  it("returns lexical fallback when query text is empty", async () => {
    const result = await retrieveDecisionAncestryContext({
      decisionId: "d-1",
      decisionName: "   ",
      decisionSummary: "",
      bodyText: "  ",
    });

    expect(result.similar_decisions).toEqual([]);
    expect(result.retrieval_method).toBe("lexical-fallback");
    expect(mocks.listDecisionAncestryCandidates).not.toHaveBeenCalled();
  });

  it("returns lexical fallback when no ancestry candidates are available", async () => {
    const result = await retrieveDecisionAncestryContext({
      decisionId: "d-1",
      bodyText: "Growth and expansion",
    });

    expect(result.similar_decisions).toEqual([]);
    expect(result.retrieval_method).toBe("lexical-fallback");
    expect(mocks.listDecisionAncestryCandidates).toHaveBeenCalledWith("d-1", 60);
  });

  it("falls back to lexical scoring when embedding generation throws", async () => {
    mocks.listDecisionAncestryCandidates.mockResolvedValueOnce([candidate()]);
    mocks.embedText.mockRejectedValueOnce(new Error("embedding provider down"));

    const result = await retrieveDecisionAncestryContext({
      decisionId: "d-new",
      decisionName: "Growth Plan",
      bodyText: "Growth strategy and CAC mitigation plan",
    });

    expect(result.retrieval_method).toBe("lexical-fallback");
    expect(result.similar_decisions[0]?.decision_id).toBe("d-old-1");
    expect(result.similar_decisions[0]?.lessons).toEqual([
      "Outcome: Challenged; DQS 6.20.",
      "Blocker: Blocker A",
      "Blocker: Blocker B",
      "Required revision: Revision A",
      "Required revision: Revision B",
    ]);
  });

  it("falls back to lexical when vector similarity returns no positive matches", async () => {
    const input = {
      decisionId: "d-new",
      decisionName: "Growth Plan",
      decisionSummary: "CAC program",
      bodyText: "Growth strategy and CAC mitigation plan",
    };
    const queryText = `${input.decisionName}\n${input.decisionSummary}\n${input.bodyText}`;
    const existingQuery: DecisionAncestryEmbedding = {
      decisionId: "d-new",
      sourceHash: `hash:${queryText}`,
      embeddingProvider: "local-hash",
      embeddingModel: "local-hash-v1",
      embeddingDimensions: 2,
      embedding: [1, 0],
      updatedAt: "",
    };
    const existingCandidate: DecisionAncestryEmbedding = {
      decisionId: "d-old-1",
      sourceHash: `hash:${candidate().name}\n${candidate().summary}\n${candidate().bodyText}\n${candidate().executiveSummary}`,
      embeddingProvider: "local-hash",
      embeddingModel: "local-hash-v1",
      embeddingDimensions: 2,
      embedding: [0, 1],
      updatedAt: "",
    };

    mocks.getDecisionAncestryEmbedding.mockResolvedValueOnce(existingQuery);
    mocks.listDecisionAncestryCandidates.mockResolvedValueOnce([candidate()]);
    mocks.listDecisionAncestryEmbeddings.mockResolvedValueOnce({ "d-old-1": existingCandidate });

    const result = await retrieveDecisionAncestryContext(input);

    expect(result.retrieval_method).toBe("lexical-fallback");
    expect(result.similar_decisions[0]?.decision_id).toBe("d-old-1");
    expect(mocks.embedText).not.toHaveBeenCalled();
  });

  it("returns vector-db matches, trims summary, and clamps limits", async () => {
    const longSummary = new Array(100).fill("token").join(" ");
    mocks.listDecisionAncestryCandidates.mockResolvedValueOnce([
      candidate({
        executiveSummary: longSummary,
        blockers: [],
        requiredRevisions: [],
        finalRecommendation: null,
        gateDecision: null,
        dqs: null,
      }),
    ]);
    mocks.listDecisionAncestryEmbeddings.mockResolvedValueOnce({});
    mocks.embedText
      .mockResolvedValueOnce({
        provider: "local-hash",
        model: "local-hash-v1",
        dimensions: 2,
        vector: [1, 0],
      })
      .mockResolvedValueOnce({
        provider: "local-hash",
        model: "local-hash-v1",
        dimensions: 2,
        vector: [0.9, 0],
      });

    const result = await retrieveDecisionAncestryContext({
      decisionId: "d-new",
      decisionName: "Growth Plan",
      bodyText: "Growth strategy and CAC mitigation plan",
      topK: 99,
      candidateLimit: 999,
    });

    expect(mocks.listDecisionAncestryCandidates).toHaveBeenCalledWith("d-new", 250);
    expect(result.retrieval_method).toBe("vector-db");
    expect(result.similar_decisions).toHaveLength(1);
    expect(result.similar_decisions[0]?.similarity).toBe(0.9);
    expect(result.similar_decisions[0]?.summary.endsWith("...")).toBe(true);
    expect(result.similar_decisions[0]?.lessons).toEqual([
      "Outcome: Unknown; DQS unavailable.",
      "No explicit blockers or required revisions were recorded.",
    ]);
  });
});
