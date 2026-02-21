import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  embeddingsCreate: vi.fn(),
  isSimulationModeEnabled: vi.fn(() => false),
  resolveSimulationDelayMs: vi.fn(() => 7),
  sleepMs: vi.fn(() => Promise.resolve()),
}));

vi.mock("openai", () => ({
  default: class OpenAI {
    embeddings = {
      create: mocks.embeddingsCreate,
    };
  },
}));

vi.mock("../../src/simulation/mode", () => ({
  isSimulationModeEnabled: mocks.isSimulationModeEnabled,
  resolveSimulationDelayMs: mocks.resolveSimulationDelayMs,
  sleepMs: mocks.sleepMs,
}));

const ORIGINAL_ENV = { ...process.env };

describe("memory/embedder", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    process.env = { ...ORIGINAL_ENV };
    delete process.env.BOARDROOM_EMBEDDING_PROVIDER;
    delete process.env.BOARDROOM_EMBEDDING_MODEL;
    delete process.env.OPENAI_API_KEY;
  });

  it("produces stable source hashes from normalized text", async () => {
    const mod = await import("../../src/memory/embedder");

    const a = mod.buildEmbeddingSourceHash("Hello   world\r\n");
    const b = mod.buildEmbeddingSourceHash(" Hello world ");

    expect(a).toBe(b);
  });

  it("computes cosine similarity defensively for non-finite values and empty vectors", async () => {
    const mod = await import("../../src/memory/embedder");

    expect(mod.cosineSimilarityVectors([], [1, 2])).toBe(0);
    expect(mod.cosineSimilarityVectors([1, Number.NaN], [1, 1])).toBeCloseTo(0.707106, 5);
  });

  it("returns zero local vector for empty text and clamps minimum dimensions", async () => {
    const mod = await import("../../src/memory/embedder");
    const result = await mod.embedText("   ", { dimensions: 12 });

    expect(result.provider).toBe("local-hash");
    expect(result.dimensions).toBe(64);
    expect(result.vector.length).toBe(64);
    expect(result.vector.every((value) => value === 0)).toBe(true);
  });

  it("uses OpenAI embeddings when requested and available", async () => {
    process.env.OPENAI_API_KEY = "test-key";
    mocks.embeddingsCreate.mockResolvedValueOnce({
      data: [{ embedding: [3, 4] }],
    });
    const mod = await import("../../src/memory/embedder");

    const result = await mod.embedText("Revenue growth", {
      provider: "openai",
      allowFallback: false,
    });

    expect(result).toMatchObject({
      provider: "openai",
      model: "text-embedding-3-small",
      dimensions: 2,
    });
    expect(result.vector).toEqual([0.6, 0.8]);
  });

  it("throws OpenAI errors when fallback is disabled", async () => {
    process.env.OPENAI_API_KEY = "test-key";
    const failure = new Error("provider unavailable");
    mocks.embeddingsCreate.mockRejectedValueOnce(failure);
    const mod = await import("../../src/memory/embedder");

    await expect(
      mod.embedText("Revenue growth", {
        provider: "openai",
        allowFallback: false,
      }),
    ).rejects.toThrow("provider unavailable");
  });

  it("forces local-hash fallback in simulation mode for requested openai provider", async () => {
    mocks.isSimulationModeEnabled.mockReturnValue(true);
    const mod = await import("../../src/memory/embedder");

    const result = await mod.embedText("Revenue growth", {
      provider: "openai",
    });

    expect(result.provider).toBe("local-hash");
    expect(mocks.embeddingsCreate).not.toHaveBeenCalled();
    expect(mocks.resolveSimulationDelayMs).toHaveBeenCalledTimes(1);
    expect(mocks.sleepMs).toHaveBeenCalledTimes(1);
  });
});
