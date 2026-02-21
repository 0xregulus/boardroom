import { describe, expect, it } from "vitest";

import {
  cleanLine,
  dedupeKeepOrder,
  dedupeSemantic,
  isLabelOnlyLine,
  normalizeSimilarityText,
} from "../../src/workflow/prd_helpers";

describe("workflow/prd_helpers/text", () => {
  it("normalizes lines and strips known prefixes", () => {
    expect(cleanLine("**Decision requirement:**\tImprove KPI now")).toBe("Improve KPI now");
    expect(cleanLine("trade-offs")).toBe("");
  });

  it("detects label-only lines", () => {
    expect(isLabelOnlyLine("Objective supported:")).toBe(true);
    expect(isLabelOnlyLine("Option A")).toBe(true);
    expect(isLabelOnlyLine("Root cause: legacy onboarding")).toBe(false);
  });

  it("dedupes clean lines while preserving order and limits", () => {
    const lines = dedupeKeepOrder(["alpha", " Alpha ", "beta", "", "gamma"], 2);
    expect(lines).toEqual(["alpha", "beta"]);
  });

  it("normalizes text for similarity checks", () => {
    const normalized = normalizeSimilarityText("Develop comprehensive market analysis for all segments.");
    expect(normalized).toBe("market analysis segments");
  });

  it("dedupes semantic near-duplicates", () => {
    const lines = dedupeSemantic(
      [
        "Build downside model for North America.",
        "Build downside model for North America",
        "Conduct compliance review before launch.",
      ],
      8,
      0.86,
    );

    expect(lines).toEqual([
      "Build downside model for North America.",
      "Conduct compliance review before launch.",
    ]);
  });

  it("falls back to raw lowercase comparison when similarity normalization is empty", () => {
    const lines = dedupeSemantic(
      [
        "Develop comprehensive required potential",
        "Develop comprehensive required potential",
        "All ensure conduct thorough",
      ],
      8,
      0.9,
    );

    expect(lines).toEqual(["Develop comprehensive required potential", "All ensure conduct thorough"]);
  });
});
