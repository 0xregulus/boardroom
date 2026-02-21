import { describe, expect, it } from "vitest";

import type { ReviewOutput } from "../../src/schemas/review_output";
import { finalDecisionRequirements, reviewsRequiredChanges, reviewsRiskEvidence } from "../../src/workflow/prd_helpers";

function makeReview(overrides: Partial<ReviewOutput> = {}): ReviewOutput {
  return {
    agent: "Agent",
    thesis: "Thesis",
    score: 7,
    confidence: 0.75,
    blocked: false,
    blockers: [],
    risks: [],
    citations: [],
    required_changes: [],
    approval_conditions: [],
    apga_impact_view: "Neutral",
    governance_checks_met: {},
    ...overrides,
  };
}

describe("workflow/prd_helpers/review_summaries", () => {
  it("aggregates required changes with topic and semantic dedupe", () => {
    const lines = reviewsRequiredChanges({
      ceo: makeReview({
        required_changes: ["Add downside model with a stress scenario.", "Expand downside modeling with assumptions."],
      }),
      cfo: makeReview({
        required_changes: ["Complete compliance review before launch.", "Finalize risk matrix with owners."],
      }),
      cto: makeReview({
        required_changes: ["Finalize risk matrix with owners."],
      }),
    });

    expect(lines.length).toBeLessThanOrEqual(4);
    expect(lines.join(" ")).toContain("downside model");
    expect(lines.join(" ")).toContain("compliance review");
    expect(lines.join(" ")).toContain("risk matrix");
  });

  it("builds ordered risk evidence lines with dedupe and limits", () => {
    const lines = reviewsRiskEvidence(
      {
        ceo: makeReview({ risks: [{ type: "execution", severity: 7, evidence: "Hiring bottleneck" }] }),
        cfo: makeReview({
          risks: [
            { type: "execution", severity: 6, evidence: "Hiring bottleneck" },
            { type: "financial", severity: 8, evidence: "Downside cash burn" },
          ],
        }),
      },
      2,
    );

    expect(lines).toEqual(["execution: Hiring bottleneck", "financial: Downside cash burn"]);
  });

  it("derives final decision requirements from options and guardrail lines", () => {
    const requirements = finalDecisionRequirements(`
**Chosen Option**
Option A (Partner-Led Motion)
Option B (Direct Enterprise Sales)
Combine option A and option B through a phased rollout.
Prioritize enterprise segment first.
Focus on CAC payback within two quarters.
`);

    expect(requirements[0]).toContain("Implement a phased rollout combining Option A (Partner-Led Motion) + Option B (Direct Enterprise Sales).");
    expect(requirements.join(" ")).toContain("Trade-off guardrail");
  });

  it("returns one-option and empty fallbacks for final decision requirements", () => {
    expect(finalDecisionRequirements("Option C (Self-Serve Motion)")).toEqual([
      "Implement Option C (Self-Serve Motion) as the selected approach.",
    ]);
    expect(finalDecisionRequirements("")).toEqual([]);
  });
});
