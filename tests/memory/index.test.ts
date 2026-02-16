import { describe, expect, it } from "vitest";

import { getEmbeddingProvider } from "../../src/memory/embedder";
import { retrieveMemoryContext } from "../../src/memory/retriever";

describe("memory modules", () => {
  it("returns default embedding provider", () => {
    expect(getEmbeddingProvider()).toBe("openai");
  });

  it("returns empty retrieval context by default", () => {
    expect(retrieveMemoryContext()).toEqual({});
  });
});
