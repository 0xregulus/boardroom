import { describe, expect, it } from "vitest";

import { evaluateHygiene } from "../../src/workflow/hygiene";

function makeSnapshot(overrides: Record<string, unknown> = {}) {
  return {
    page_id: "d1",
    captured_at: "2026-02-16T00:00:00.000Z",
    properties: {
      "Investment Required": 100000,
      "12-Month Gross Benefit": 250000,
      "Risk-Adjusted ROI": 2.5,
      "Primary KPI": "CAC payback",
      Baseline: 10,
      Target: 20,
      "Probability of Success": "70%",
      ...overrides,
    },
    section_excerpt: [
      {
        type: "text",
        text: {
          content:
            "Market size is $5,000,000 and projected revenue is $1,200,000. CAC payback and leading indicators are defined.",
        },
      },
    ],
    computed: {
      inferred_governance_checks: {},
      autochecked_governance_fields: [],
    },
  };
}

describe("evaluateHygiene", () => {
  it("returns high score for coherent inputs", () => {
    const result = evaluateHygiene(makeSnapshot(), []);

    expect(result.score).toBeGreaterThan(8);
    expect(result.findings.some((finding) => finding.status === "fail")).toBe(false);
  });

  it("drops score for missing sections and contradictory economics", () => {
    const result = evaluateHygiene(
      makeSnapshot({
        "Investment Required": 100000,
        "12-Month Gross Benefit": 50000,
        "Risk-Adjusted ROI": 5,
      }),
      ["Strategic Alignment Brief", "Kill Criteria Defined"],
    );

    expect(result.score).toBeLessThan(8);
    expect(result.findings.some((finding) => finding.check === "required_artifacts" && finding.status === "fail")).toBe(
      true,
    );
  });
});
