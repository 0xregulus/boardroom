import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
}));

vi.mock("../../src/store/postgres/client", () => ({
  query: mocks.query,
}));

import {
  getDecisionAncestryEmbedding,
  listDecisionAncestryCandidates,
  listDecisionAncestryEmbeddings,
  upsertDecisionAncestryEmbedding,
} from "../../src/store/postgres/ancestry";

describe("store/postgres/ancestry", () => {
  beforeEach(() => {
    mocks.query.mockReset();
  });

  it("throws when decision id is empty for candidate listing", async () => {
    await expect(listDecisionAncestryCandidates("   ")).rejects.toThrow("decisionId is required");
  });

  it("maps ancestry candidates and clamps limit", async () => {
    mocks.query.mockResolvedValueOnce({
      rows: [
        {
          id: "abc123456789",
          name: "  ",
          summary: "  Summary text  ",
          body_text: null,
          gate_decision: "approved",
          dqs: "8.4",
          final_recommendation: "Approved",
          executive_summary: "  Exec summary  ",
          blockers: '["b1", 2]',
          required_revisions: ["r1", 2],
          last_run_at: "2026-02-20T10:20:30.000Z",
        },
      ],
      rowCount: 1,
    });

    const output = await listDecisionAncestryCandidates("  decision-1  ", 999);

    expect(mocks.query).toHaveBeenCalledWith(expect.stringContaining("FROM decisions d"), ["decision-1", 250]);
    expect(output).toEqual([
      {
        id: "abc123456789",
        name: "Decision abc12345",
        summary: "Summary text",
        bodyText: "",
        gateDecision: "approved",
        dqs: 8.4,
        finalRecommendation: "Approved",
        executiveSummary: "Exec summary",
        blockers: ["b1"],
        requiredRevisions: ["r1"],
        lastRunAt: "2026-02-20T10:20:30.000Z",
      },
    ]);
  });

  it("throws when decision id is empty for embedding lookup", async () => {
    await expect(getDecisionAncestryEmbedding(" ")).rejects.toThrow("decisionId is required");
  });

  it("returns null when no embedding row is found", async () => {
    mocks.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });
    await expect(getDecisionAncestryEmbedding("d-1")).resolves.toBeNull();
  });

  it("maps a single embedding row with numeric normalization", async () => {
    mocks.query.mockResolvedValueOnce({
      rows: [
        {
          decision_id: "d-1",
          source_hash: "hash-1",
          embedding_provider: "OpenAI",
          embedding_model: "text-embedding-3-small",
          embedding_dimensions: "0",
          embedding_json: "[1, \"2\", \"invalid\"]",
          updated_at: "2026-02-20T10:20:30.000Z",
        },
      ],
      rowCount: 1,
    });

    await expect(getDecisionAncestryEmbedding("d-1")).resolves.toEqual({
      decisionId: "d-1",
      sourceHash: "hash-1",
      embeddingProvider: "OpenAI",
      embeddingModel: "text-embedding-3-small",
      embeddingDimensions: 1,
      embedding: [1, 2],
      updatedAt: "2026-02-20T10:20:30.000Z",
    });
  });

  it("returns empty object without querying when embedding id list is empty", async () => {
    const output = await listDecisionAncestryEmbeddings([" ", ""]);
    expect(output).toEqual({});
    expect(mocks.query).not.toHaveBeenCalled();
  });

  it("dedupes embedding ids and maps rows by decision id", async () => {
    mocks.query.mockResolvedValueOnce({
      rows: [
        {
          decision_id: "a",
          source_hash: "hash-a",
          embedding_provider: "OpenAI",
          embedding_model: "m1",
          embedding_dimensions: 3,
          embedding_json: [0.1, 0.2, 0.3],
          updated_at: "2026-02-20T00:00:00.000Z",
        },
        {
          decision_id: "b",
          source_hash: "hash-b",
          embedding_provider: "OpenAI",
          embedding_model: "m1",
          embedding_dimensions: 3,
          embedding_json: "[0.3,0.2,0.1]",
          updated_at: "2026-02-21T00:00:00.000Z",
        },
      ],
      rowCount: 2,
    });

    const output = await listDecisionAncestryEmbeddings([" a ", "a", "", "b"]);

    expect(mocks.query).toHaveBeenCalledWith(expect.stringContaining("WHERE decision_id = ANY"), [["a", "b"]]);
    expect(output).toMatchObject({
      a: {
        decisionId: "a",
        embedding: [0.1, 0.2, 0.3],
      },
      b: {
        decisionId: "b",
        embedding: [0.3, 0.2, 0.1],
      },
    });
  });

  it("validates required upsert fields", async () => {
    await expect(
      upsertDecisionAncestryEmbedding({
        decisionId: " ",
        sourceText: "x",
        sourceHash: "hash",
        embeddingProvider: "OpenAI",
        embeddingModel: "m1",
        embeddingDimensions: 2,
        embedding: [1, 2],
      }),
    ).rejects.toThrow("decisionId is required");

    await expect(
      upsertDecisionAncestryEmbedding({
        decisionId: "d-1",
        sourceText: "x",
        sourceHash: " ",
        embeddingProvider: "OpenAI",
        embeddingModel: "m1",
        embeddingDimensions: 2,
        embedding: [1, 2],
      }),
    ).rejects.toThrow("sourceHash is required");

    await expect(
      upsertDecisionAncestryEmbedding({
        decisionId: "d-1",
        sourceText: "x",
        sourceHash: "hash",
        embeddingProvider: "OpenAI",
        embeddingModel: "m1",
        embeddingDimensions: 2,
        embedding: [Number.NaN],
      }),
    ).rejects.toThrow("embedding vector is required");
  });

  it("upserts embeddings with filtered vector and normalized defaults", async () => {
    mocks.query.mockResolvedValueOnce({ rows: [], rowCount: 1 });

    await upsertDecisionAncestryEmbedding({
      decisionId: "  d-1  ",
      sourceText: "source text",
      sourceHash: "  hash-1 ",
      embeddingProvider: " ",
      embeddingModel: " ",
      embeddingDimensions: 0,
      embedding: [1, Number.NaN, 2],
    });

    expect(mocks.query).toHaveBeenCalledTimes(1);
    const values = mocks.query.mock.calls[0]?.[1] as unknown[];
    expect(values[0]).toBe("d-1");
    expect(values[1]).toBe("hash-1");
    expect(values[2]).toBe("source text");
    expect(values[3]).toBe("unknown");
    expect(values[4]).toBe("unknown");
    expect(values[5]).toBe(2);
    expect(values[6]).toBe("[1,2]");
  });
});
