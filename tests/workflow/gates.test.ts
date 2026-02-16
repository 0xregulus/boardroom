import { describe, expect, it } from "vitest";

import { evaluateRequiredGates, inferGovernanceChecksFromText } from "../../src/workflow/gates";

describe("workflow/gates", () => {
  it("infers governance checks from structured decision text", () => {
    const text = `
Executive Summary
Strategic alignment is clear and objective supported.
Problem framing includes quantified impact of 120, 35%, and 2.4x.
Options evaluated include Option A, Option B, and Option C.
Chosen option is Option B with trade-offs listed.
Success metrics and primary metric are defined.
Leading indicators are listed with monitoring cadence.
Kill criteria: we will stop or pivot if conversion drops below threshold.
Financial model includes payback period and revenue impact.
Risk matrix contains probability, impact, and mitigation.
Compliance review completed by legal review.
Final decision captured with assumptions and confidence level.
Root cause analysis completed.
`;

    const inferred = inferGovernanceChecksFromText(text);

    expect(inferred["Strategic Alignment Brief"]).toBe(true);
    expect(inferred["Problem Quantified"]).toBe(true);
    expect(inferred["≥3 Options Evaluated"]).toBe(true);
    expect(inferred["Success Metrics Defined"]).toBe(true);
    expect(inferred["Leading Indicators Defined"]).toBe(true);
    expect(inferred["Kill Criteria Defined"]).toBe(true);
    expect(inferred["Compliance Reviewed"]).toBe(true);
  });

  it("respects explicit NO markers in text inference", () => {
    const inferred = inferGovernanceChecksFromText(
      "Strategic Alignment Brief: no\nSuccess metrics are present but Success Metrics Defined: no",
    );

    expect(inferred["Strategic Alignment Brief"]).toBe(false);
    expect(inferred["Success Metrics Defined"]).toBe(false);
  });

  it("evaluates missing required gates from mixed property types", () => {
    const missing = evaluateRequiredGates({
      Baseline: { number: 10 },
      Target: 12,
      "Time Horizon": { select: { name: "Q2" } },
      "Strategic Alignment Brief": { checkbox: true },
      "Problem Quantified": false,
      "≥3 Options Evaluated": { checkbox: false },
      "Success Metrics Defined": false,
      "Leading Indicators Defined": { checkbox: false },
      "Kill Criteria Defined": { checkbox: false },
    });

    expect(missing).toEqual([
      "Problem Quantified",
      "≥3 Options Evaluated",
      "Success Metrics Defined",
      "Leading Indicators Defined",
      "Kill Criteria Defined",
    ]);
  });

  it("accepts inferred checks when checkbox gates are unchecked", () => {
    const missing = evaluateRequiredGates(
      {
        Baseline: 10,
        Target: 20,
        "Time Horizon": "6 months",
        "Strategic Alignment Brief": false,
        "Problem Quantified": false,
        "≥3 Options Evaluated": false,
        "Success Metrics Defined": false,
        "Leading Indicators Defined": false,
        "Kill Criteria Defined": false,
      },
      {
        "Strategic Alignment Brief": true,
        "Problem Quantified": true,
        "≥3 Options Evaluated": true,
        "Success Metrics Defined": true,
        "Leading Indicators Defined": true,
        "Kill Criteria Defined": true,
      },
    );

    expect(missing).toEqual([]);
  });

  it("flags baseline/target/time-horizon when absent", () => {
    const missing = evaluateRequiredGates({});

    expect(missing).toContain("Baseline");
    expect(missing).toContain("Target");
    expect(missing).toContain("Time Horizon");
  });
});
