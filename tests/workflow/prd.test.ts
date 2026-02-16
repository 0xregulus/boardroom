import { describe, expect, it } from "vitest";

import { ReviewOutput } from "../../src/schemas/review_output";
import { buildPrdOutput, cleanLine, dedupeKeepOrder, isLabelOnlyLine, prdChildren } from "../../src/workflow/prd";
import { WorkflowState } from "../../src/workflow/states";

function review(overrides: Partial<ReviewOutput> = {}): ReviewOutput {
  return {
    agent: "CEO",
    thesis: "Strong strategic rationale",
    score: 8,
    confidence: 0.8,
    blocked: false,
    blockers: [],
    risks: [],
    required_changes: [],
    approval_conditions: [],
    apga_impact_view: "Positive",
    governance_checks_met: {},
    ...overrides,
  };
}

function buildState(overrides: Partial<WorkflowState> = {}): WorkflowState {
  return {
    decision_id: "dec-123",
    user_context: {},
    business_constraints: {},
    strategic_goals: [],
    decision_snapshot: {
      page_id: "dec-123",
      captured_at: "2026-02-16T00:00:00.000Z",
      properties: {
        "Strategic Objective": "Increase APGA",
        "Primary KPI": "Checkout conversion",
        Baseline: 0.2,
        Target: 0.26,
        "Time Horizon": "Q3",
        "Decision Type": "Reversible",
        Owner: "Facundo",
        "Investment Required": "$120000",
        "12-Month Gross Benefit": "$450000",
        "Risk-Adjusted ROI": "1.8",
      },
      section_excerpt: [
        {
          type: "text",
          text: {
            content: `
Executive Summary
Improve checkout speed and recommendations.
1. Strategic Context
Objective supported with durable strategic alignment.
2. Problem Framing
Mobile buyers drop at payment step causing 16% loss.
3. Options Evaluated
Option A (Fast path)
Option B (Bundled recommendations)
Option C (International optimization)
4. Financial Model
Revenue impact +$450k with payback period of 3 months.
5. Risk Matrix
Risk matrix includes impact, probability, mitigation.
6. Final Decision
Option A (Fast path) + Option B (Bundled recommendations)
Prioritize speed before expanding recommendation logic.
7. Kill Criteria
We will stop or pivot if conversion drops 3%.
8. Monitoring Plan
Primary metric: checkout conversion.
Leading indicators: add-to-cart, checkout start, payment success.
`,
          },
        },
      ],
      computed: {
        inferred_governance_checks: {},
        autochecked_governance_fields: [],
      },
    },
    reviews: {
      ceo: review({
        required_changes: ["Add downside modeling"],
        risks: [{ type: "delivery", severity: 6, evidence: "Vendor timeline uncertain" }],
      }),
      compliance: review({
        agent: "Compliance",
        required_changes: ["Add compliance review evidence"],
      }),
    },
    dqs: 8.2,
    status: "SYNTHESIZED",
    synthesis: {
      executive_summary: "Proceed with phased rollout",
      final_recommendation: "Approved",
      conflicts: ["Speed vs personalization trade-off"],
      blockers: [],
      required_revisions: ["Document rollout guardrails"],
    },
    prd: null,
    missing_sections: [],
    decision_name: "Checkout Optimization",
    ...overrides,
  };
}

describe("workflow/prd utilities", () => {
  it("cleans lines and strips known prefixes/markdown", () => {
    expect(cleanLine(" **Decision requirement:**   Add telemetry   ")).toBe("Add telemetry");
    expect(cleanLine("trade-offs")).toBe("");
  });

  it("detects label-only lines", () => {
    expect(isLabelOnlyLine("Option A")).toBe(true);
    expect(isLabelOnlyLine("Risk: probability high due to SLA gaps")).toBe(false);
    expect(isLabelOnlyLine("trade-offs:")).toBe(true);
  });

  it("deduplicates in order with limit", () => {
    const output = dedupeKeepOrder(["One", "two", "ONE", "three", "four"], 3);
    expect(output).toEqual(["One", "two", "three"]);
  });
});

describe("buildPrdOutput", () => {
  it("builds a PRD using decision snapshot, reviews, and synthesis", () => {
    const prd = buildPrdOutput(buildState());

    expect(prd.title).toContain("Checkout Optimization");
    expect(prd.scope.length).toBeGreaterThan(0);
    expect(prd.milestones).toHaveLength(3);
    expect(prd.telemetry.some((line) => line.toLowerCase().includes("checkout conversion"))).toBe(true);
    expect(prd.risks.some((line) => line.toLowerCase().includes("vendor timeline uncertain"))).toBe(true);
    expect(prd.sections["Q&A"].some((line) => line.includes("Required revision"))).toBe(true);
  });

  it("falls back to default section text when data is sparse", () => {
    const prd = buildPrdOutput(
      buildState({
        decision_snapshot: {
          page_id: "id",
          captured_at: "2026-02-16T00:00:00.000Z",
          properties: {},
          section_excerpt: [],
          computed: {
            inferred_governance_checks: {},
            autochecked_governance_fields: [],
          },
        },
        reviews: {},
        synthesis: null,
      }),
    );

    expect(prd.sections.Goals[0]).toContain("Define the north star");
    expect(prd.sections.Requirements[0]).toContain("Functional");
  });

  it("creates serialized PRD blocks", () => {
    const prd = buildPrdOutput(buildState());
    const blocks = prdChildren("Checkout Optimization", prd);

    expect(blocks.length).toBeGreaterThan(10);
    expect(blocks[0]).toMatchObject({ type: "heading_1" });
    expect(blocks.length).toBeLessThanOrEqual(100);
  });
});
