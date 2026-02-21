import { describe, expect, it } from "vitest";

import {
  buildDecisionAncestryRuntimeInstruction,
  buildHygieneRuntimeInstruction,
  buildInteractionRuntimeInstruction,
  buildMarketIntelligenceRuntimeInstruction,
  buildReviewRuntimeContextInstruction,
  buildRiskSimulationRuntimeInstruction,
  withResearchContext,
} from "../../src/agents/base_utils";

describe("agents/base_utils/context", () => {
  it("wraps untrusted research context only when research exists", () => {
    expect(withResearchContext("base", "   ")).toBe("base");

    const out = withResearchContext("base", "Evidence line");
    expect(out).toContain("### Untrusted External Evidence");
    expect(out).toContain("<BEGIN_UNTRUSTED_EXTERNAL_CONTENT>");
    expect(out).toContain("Evidence line");
  });

  it("builds review runtime instruction", () => {
    const out = buildReviewRuntimeContextInstruction('{"id":"d1"}', "Baseline", "Gate A, Gate B");
    expect(out).toContain("Strategic Decision Snapshot: {\"id\":\"d1\"}");
    expect(out).toContain("Missing sections flagged: Baseline");
    expect(out).toContain("Evaluate the following governance checks");
  });

  it("builds interaction runtime instruction from prior and peer reviews", () => {
    const out = buildInteractionRuntimeInstruction({
      interaction_round: 0,
      prior_self_review: {
        score: 7.8,
        blocked: false,
        thesis: "prior thesis",
        blockers: ["b1", "b2", "b3", "b4"],
        required_changes: ["c1", "c2", "c3", "c4"],
      },
      peer_reviews: [
        { agent_name: "CFO", score: 5, blocked: false, thesis: "concern", blockers: ["x"], required_changes: ["y"] },
        { agent_id: "cto", score: 8, blocked: true, thesis: "block", blockers: ["infra"] },
        { invalid: true },
      ],
    });

    expect(out).toContain("Cross-agent interaction round: 1");
    expect(out).toContain("prior thesis");
    expect(out).toContain("\"agent\":\"CFO\"");
    expect(out).toContain("\"agent\":\"cto\"");
  });

  it("returns empty interaction instruction when peer summaries are unusable", () => {
    expect(buildInteractionRuntimeInstruction({ interaction_round: 1, peer_reviews: [] })).toBe("");
    expect(buildInteractionRuntimeInstruction({ interaction_round: 1, peer_reviews: [{ score: 7 }] })).toBe("");
  });

  it("builds decision ancestry instruction and truncates entries", () => {
    const out = buildDecisionAncestryRuntimeInstruction({
      decision_ancestry: [
        {
          decision_name: "A",
          similarity: 0.9,
          summary: "sum-a",
          lessons: ["l1", "l2", "l3", "l4"],
          outcome: { gate_decision: "approved", final_recommendation: "Approved", dqs: 8.2 },
        },
        { id: "fallback-id", lessons: ["l"] },
        { decision_name: "C" },
        { decision_name: "D" },
      ],
    });

    expect(out).toContain("Decision ancestry");
    expect(out).toContain("\"decision_name\":\"A\"");
    expect(out).toContain("\"decision_name\":\"fallback-id\"");
    expect(out).not.toContain("\"decision_name\":\"D\"");
  });

  it("returns empty ancestry instruction when items are invalid", () => {
    expect(buildDecisionAncestryRuntimeInstruction({ decision_ancestry: [] })).toBe("");
    expect(buildDecisionAncestryRuntimeInstruction({ decision_ancestry: [{ similarity: 0.3 }] })).toBe("");
  });

  it("builds market intelligence instruction with highlights and sources", () => {
    const out = buildMarketIntelligenceRuntimeInstruction({
      market_intelligence: {
        generated_at: "2026-02-21T00:00:00.000Z",
        highlights: ["h1", "h2", "h3", "h4", "h5", "h6"],
        source_urls: ["u1", "u2", "u3", "u4", "u5", "u6", "u7"],
      },
    });

    expect(out).toContain("Pre-review market intelligence generated at: 2026-02-21T00:00:00.000Z");
    expect(out).toContain("Market intelligence highlights");
    expect(out).toContain("Market intelligence sources");
  });

  it("returns empty market intelligence instruction when data is absent", () => {
    expect(buildMarketIntelligenceRuntimeInstruction({})).toBe("");
    expect(buildMarketIntelligenceRuntimeInstruction({ market_intelligence: { highlights: [], source_urls: [] } })).toBe("");
  });

  it("builds hygiene instruction from score and findings", () => {
    const out = buildHygieneRuntimeInstruction({
      hygiene_score: 6.456,
      hygiene_findings: [
        { check: "financial_sanity", status: "warning", detail: "Mismatch", score_impact: 1.2 },
        { check: "no_status" },
      ],
    });

    expect(out).toContain("Automated hygiene score (0-10): 6.46");
    expect(out).toContain("financial_sanity");
    expect(out).not.toContain("no_status");
  });

  it("handles hygiene instruction with findings only", () => {
    const out = buildHygieneRuntimeInstruction({
      hygiene_findings: [{ check: "risk", status: "fail", detail: "missing evidence" }],
    });

    expect(out).toContain("Automated hygiene score (0-10): N/A");
    expect(out).toContain("missing evidence");
    expect(buildHygieneRuntimeInstruction({})).toBe("");
  });

  it("builds risk simulation instruction with formatted values", () => {
    const out = buildRiskSimulationRuntimeInstruction({
      risk_simulation: {
        mode: "monte-carlo",
        sample_size: 1499.6,
        summary: "Downside distribution has long tail.",
        assumptions: ["a1", "a2", "a3", "a4", "a5"],
        outcomes: {
          expected_case: { net_value: 2_300_000, roi: 0.34 },
          worst_case: { net_value: -5_500, roi: -0.08 },
          best_case: { net_value: 1_200_000_000, roi: 1.22 },
          probability_of_loss: 0.31,
        },
      },
    });

    expect(out).toContain("Monte Carlo risk simulation (1500 trials, mode: monte-carlo).");
    expect(out).toContain("$2.30M / -$5.50K / $1.20B");
    expect(out).toContain("34.0% / -8.0% / 122.0%");
    expect(out).toContain("Probability of loss: 31.0%");
    expect(out).toContain("Simulation assumptions");
  });

  it("returns empty risk simulation instruction when no useful payload exists", () => {
    expect(buildRiskSimulationRuntimeInstruction({})).toBe("");
    expect(buildRiskSimulationRuntimeInstruction({ risk_simulation: { mode: "x" } })).toBe("");
  });
});
