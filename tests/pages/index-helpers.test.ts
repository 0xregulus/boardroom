import { describe, expect, it } from "vitest";

import {
  buildCreateDraftFromStrategy,
  deriveRiskAdjustedRoi,
  deriveRiskAdjustedValue,
  deriveRiskScore,
  deriveWeightedCapitalScore,
  parseSectionMatrix,
} from "../../pages/index";

describe("pages/index helper logic", () => {
  it("parses and normalizes serialized section matrices", () => {
    const fallback = {
      headers: ["A", "B", "C"],
      rows: [["x", "y", "z"]],
    };

    const parsed = parseSectionMatrix(
      JSON.stringify({
        headers: ["Col1", "Col2", "Col3"],
        rows: [["r1c1", "r1c2"], ["r2c1", "r2c2", "r2c3", "r2c4"]],
      }),
      fallback,
    );

    expect(parsed.headers).toEqual(["Col1", "Col2", "Col3"]);
    expect(parsed.rows).toEqual([
      ["r1c1", "r1c2", ""],
      ["r2c1", "r2c2", "r2c3"],
    ]);
  });

  it("falls back to default matrix on invalid payloads", () => {
    const fallback = {
      headers: ["Risk", "Impact"],
      rows: [["A", "High"]],
    };

    expect(parseSectionMatrix("not-json", fallback)).toEqual(fallback);
    expect(
      parseSectionMatrix(
        JSON.stringify({
          headers: [],
          rows: [],
        }),
        fallback,
      ),
    ).toEqual(fallback);
  });

  it("builds create draft from persisted strategy artifacts", () => {
    const strategy = {
      id: "d-1",
      name: "Checkout Strategy",
      status: "Proposed",
      owner: "Alex",
      reviewDate: "Feb 16, 2026",
      summary: "Improve conversion",
      primaryKpi: "Checkout conversion",
      investment: "$120,000",
      strategicObjective: "Revenue Growth",
      confidence: "75%",
      artifactSections: {
        executiveSummary: "Existing summary",
        coreProperties: JSON.stringify({
          strategicObjective: "Margin Expansion",
          primaryKpi: "AOV",
          baseline: "10",
          target: "12",
          timeHorizon: "Q3",
          decisionType: "Reversible",
        }),
        capitalAllocationModel: JSON.stringify({
          investmentRequired: 50000,
          grossBenefit12m: 180000,
          probabilityOfSuccess: "80%",
          strategicLeverageScore: "4 – Platform Leverage",
          reversibilityFactor: "Partially Reversible",
        }),
        riskProperties: JSON.stringify({
          regulatoryRisk: "Low",
          technicalRisk: "Medium",
          operationalRisk: "High",
          reputationalRisk: "Low",
        }),
      },
    };

    const draft = buildCreateDraftFromStrategy(strategy as Parameters<typeof buildCreateDraftFromStrategy>[0]);

    expect(draft.name).toBe("Checkout Strategy");
    expect(draft.coreProperties).toMatchObject({
      strategicObjective: "Margin Expansion",
      primaryKpi: "AOV",
      baseline: "10",
      target: "12",
    });
    expect(draft.capitalAllocation).toMatchObject({
      investmentRequired: 50000,
      grossBenefit12m: 180000,
      probabilityOfSuccess: "80%",
    });
    expect(draft.riskProperties.operationalRisk).toBe("High");
  });

  it("derives risk-adjusted value, ROI, weighted score, and top risk", () => {
    const draft = {
      capitalAllocation: {
        grossBenefit12m: 1000,
        probabilityOfSuccess: "75%",
        investmentRequired: 500,
        strategicLeverageScore: "4 – Platform Leverage",
        reversibilityFactor: "Partially Reversible",
      },
      riskProperties: {
        regulatoryRisk: "Low",
        technicalRisk: "Critical",
        operationalRisk: "Medium",
        reputationalRisk: "High",
      },
    } as unknown as Parameters<typeof deriveRiskAdjustedValue>[0];

    const riskAdjustedValue = deriveRiskAdjustedValue(draft);
    const roi = deriveRiskAdjustedRoi(draft, riskAdjustedValue);
    const weighted = deriveWeightedCapitalScore(draft, roi);

    expect(riskAdjustedValue).toBe(750);
    expect(roi).toBe(0.5);
    expect(weighted).toBe(4.5);
    expect(deriveRiskScore(draft)).toBe("Critical");
  });

  it("returns null/zero for non-derivable financial values", () => {
    const draft = {
      capitalAllocation: {
        grossBenefit12m: 2000,
        probabilityOfSuccess: "",
        investmentRequired: 0,
        strategicLeverageScore: "",
        reversibilityFactor: "",
      },
      riskProperties: {
        regulatoryRisk: "",
        technicalRisk: "",
        operationalRisk: "",
        reputationalRisk: "",
      },
    } as unknown as Parameters<typeof deriveRiskAdjustedValue>[0];

    const riskAdjustedValue = deriveRiskAdjustedValue(draft);
    const roi = deriveRiskAdjustedRoi(draft, riskAdjustedValue);

    expect(riskAdjustedValue).toBe(0);
    expect(roi).toBeNull();
    expect(deriveWeightedCapitalScore(draft, roi)).toBeNull();
    expect(deriveRiskScore(draft)).toBe("");
  });
});
