import { describe, expect, it } from "vitest";

import { extractDocumentProbability, extractLabeledMoney, extractTableMoneyPair } from "../../src/workflow/hygiene/financial";

describe("workflow/hygiene/financial", () => {
  it("extracts labeled money with scale hints", () => {
    const market = extractLabeledMoney("Market size estimated at $5.5 billion in 2027.", ["market size"]);
    const revenue = extractLabeledMoney("Projected revenue can reach 250m in steady state.", ["projected revenue"]);
    const investment = extractLabeledMoney("Investment required: 120k", ["investment required"]);

    expect(market).toMatchObject({ value: 5_500_000_000 });
    expect(revenue).toMatchObject({ value: 250_000_000 });
    expect(investment).toMatchObject({ value: 120_000 });
  });

  it("returns null when labeled money cannot be parsed", () => {
    expect(extractLabeledMoney("", ["market size"])).toBeNull();
    expect(extractLabeledMoney("Market size unknown", ["market size"])).toBeNull();
  });

  it("extracts document probability only from explicit success phrasing", () => {
    expect(extractDocumentProbability("The probability of success is 73%.")).toBe(73);
    expect(extractDocumentProbability("Chance of success approximately 44.5 % after rollout")).toBe(44.5);
    expect(extractDocumentProbability("Probability discussed but no percentage")).toBeNull();
    expect(extractDocumentProbability("")).toBeNull();
  });

  it("extracts market and revenue pair from markdown table rows", () => {
    const text = `
| Metric | Conservative | Base |
|---|---|---|
| Market size (TAM) | $8 billion | $10 billion |
| Projected revenue | $2.4 billion | $3.2 billion |
| Investment Required | $900 million | $1.1 billion |
`;

    const parsed = extractTableMoneyPair(text);

    expect(parsed.observations).toBeGreaterThanOrEqual(3);
    expect(parsed.marketSize).toMatchObject({ value: 8_000_000_000 });
    expect(parsed.projectedRevenue).toMatchObject({ value: 2_400_000_000 });
  });

  it("extracts pair from csv-style lines and ignores malformed rows", () => {
    const text = `
not,a,metric
Market Size, 6.5 million
Projected Revenue, 2.1 million
Investment Required, 400 thousand
`;

    const parsed = extractTableMoneyPair(text);

    expect(parsed.observations).toBe(3);
    expect(parsed.marketSize).toMatchObject({ value: 6_500_000 });
    expect(parsed.projectedRevenue).toMatchObject({ value: 2_100_000 });
  });

  it("reports partial observations when only one key is found", () => {
    const parsed = extractTableMoneyPair("Market size, 4 million");

    expect(parsed.observations).toBe(1);
    expect(parsed.marketSize).toMatchObject({ value: 4_000_000 });
    expect(parsed.projectedRevenue).toBeNull();
  });
});
