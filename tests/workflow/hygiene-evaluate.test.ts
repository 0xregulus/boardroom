import { describe, expect, it } from "vitest";

import { evaluateHygiene } from "../../src/workflow/hygiene";

function makeSnapshot(overrides: Record<string, unknown> = {}, bodyText = "") {
  return {
    page_id: "d1",
    captured_at: "2026-02-16T00:00:00.000Z",
    properties: {
      "Investment Required": 100000,
      "12-Month Gross Benefit": 200000,
      "Risk-Adjusted ROI": 2,
      "Primary KPI": "conversion rate",
      "Strategic Objective": "expand market share",
      "Decision Type": "Reversible",
      "Time Horizon": "Q3",
      Baseline: 10,
      Target: 20,
      "Probability of Success": "70%",
      ...overrides,
    },
    section_excerpt: [
      {
        type: "text",
        text: {
          content: bodyText,
        },
      },
    ],
    computed: {
      inferred_governance_checks: {},
      autochecked_governance_fields: [],
    },
  };
}

function statusFor(result: ReturnType<typeof evaluateHygiene>, check: string): string | undefined {
  return result.findings.find((finding) => finding.check === check)?.status;
}

describe("workflow/hygiene/evaluate", () => {
  it("flags mismatches across metadata, economics, and directional checks", () => {
    const result = evaluateHygiene(
      makeSnapshot(
        {
          "Risk-Adjusted ROI": 10,
          Baseline: 30,
          Target: 10,
          "Probability of Success": "150%",
          "Strategic Objective": "reduce churn risk",
        },
        `
| Metric | Value |
|---|---|
| Market size | $2 million |
| Projected revenue | $4 million |
Decision described as a one-way door.
Chance of success is 40%.
`,
      ),
      ["Final Decision", "Kill Criteria"],
    );

    expect(result.score).toBeLessThan(6);
    expect(statusFor(result, "required_artifacts")).toBe("fail");
    expect(statusFor(result, "financial_sanity")).toBe("warning");
    expect(statusFor(result, "financial_table_sanity")).toBe("fail");
    expect(statusFor(result, "market_size_vs_revenue")).toBe("fail");
    expect(statusFor(result, "metadata_consistency")).toBe("warning");
    expect(statusFor(result, "metadata_consistency_strategic_objective")).toBe("warning");
    expect(statusFor(result, "metadata_consistency_decision_type")).toBe("fail");
    expect(statusFor(result, "metadata_consistency_time_horizon")).toBe("warning");
    expect(statusFor(result, "metric_directionality")).toBe("fail");
    expect(statusFor(result, "probability_range")).toBe("warning");
    expect(statusFor(result, "metadata_consistency_probability")).toBe("warning");
  });

  it("warns when table parsing is partial and financial fields are missing", () => {
    const result = evaluateHygiene(
      makeSnapshot(
        {
          "Investment Required": "",
          "12-Month Gross Benefit": "",
          "Primary KPI": "",
          "Decision Type": "",
          "Strategic Objective": "",
          "Time Horizon": "",
        },
        "Market size, 9 million",
      ),
      [],
    );

    expect(statusFor(result, "required_artifacts")).toBe("pass");
    expect(statusFor(result, "financial_sanity")).toBe("warning");
    expect(statusFor(result, "financial_table_sanity")).toBe("warning");
    expect(statusFor(result, "market_size_vs_revenue")).toBe("warning");
    expect(statusFor(result, "metadata_consistency")).toBe("pass");
    expect(statusFor(result, "metric_directionality")).toBe("pass");
  });

  it("keeps high score when narrative and metadata are aligned", () => {
    const result = evaluateHygiene(
      makeSnapshot(
        {},
        `
Strategic objective is to expand market share.
Primary KPI conversion rate is reviewed weekly.
Decision framed as a reversible two-way door.
Time horizon Q3 execution.
Probability of success is 72%.
| Metric | Value |
|---|---|
| Market size | 12 million |
| Projected revenue | 3 million |
`,
      ),
      [],
    );

    expect(result.score).toBeGreaterThan(8.5);
    expect(statusFor(result, "financial_sanity")).toBe("pass");
    expect(statusFor(result, "financial_table_sanity")).toBe("pass");
    expect(statusFor(result, "market_size_vs_revenue")).toBe("pass");
    expect(statusFor(result, "metadata_consistency")).toBe("pass");
    expect(statusFor(result, "metadata_consistency_strategic_objective")).toBe("pass");
    expect(statusFor(result, "metadata_consistency_decision_type")).toBe("pass");
    expect(statusFor(result, "metadata_consistency_time_horizon")).toBe("pass");
    expect(statusFor(result, "probability_range")).toBe("pass");
    expect(statusFor(result, "metadata_consistency_probability")).toBe("pass");
  });

  it("warns when decision type metadata is present but not echoed in narrative", () => {
    const result = evaluateHygiene(
      makeSnapshot(
        {},
        `
Market size is 8 million and projected revenue is 4 million.
conversion rate and expand market share are both discussed.
Q3 goals and probability of success is 75%.
`,
      ),
      [],
    );

    expect(statusFor(result, "metadata_consistency_decision_type")).toBe("warning");
  });
});
