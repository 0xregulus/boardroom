import { describe, expect, it } from "vitest";

import { deriveArtifactAssistantQuestions } from "../../src/workflow/decision_workflow_assistant";
import type { WorkflowState } from "../../src/workflow/states";

function baseState(overrides: Partial<WorkflowState> = {}): WorkflowState {
  return {
    decision_id: "d-1",
    user_context: {},
    business_constraints: {},
    strategic_goals: [],
    decision_snapshot: null,
    reviews: {},
    dqs: 0,
    status: "REVIEWING",
    synthesis: null,
    prd: null,
    missing_sections: [],
    decision_name: "Decision One",
    interaction_rounds: [],
    ...overrides,
  };
}

describe("workflow/decision_workflow_assistant", () => {
  it("derives bounded, deduped questions from workflow signals", () => {
    const questions = deriveArtifactAssistantQuestions(
      baseState({
        missing_sections: ["Problem Framing", "Options Evaluated", "Risk Matrix", "Final Decision", "Ignored Section"],
        hygiene_findings: [
          { check: "financial_sanity", status: "warning", detail: "numbers mismatch", score_impact: 0 },
          { check: "metadata_consistency_time_horizon", status: "warning", detail: "Q mismatch", score_impact: 0 },
          { check: "metadata_consistency_decision_type", status: "warning", detail: "type mismatch", score_impact: 0 },
          { check: "probability_range", status: "pass", detail: "ok", score_impact: 0 },
        ],
        risk_simulation: { mode: "insufficient" } as any,
        reviews: {
          ceo: {
            agent: "CEO",
            thesis: "",
            score: 6,
            confidence: 0.5,
            blocked: false,
            blockers: [],
            risks: [],
            citations: [],
            required_changes: [],
            approval_conditions: [],
            apga_impact_view: "",
            governance_checks_met: {},
          },
          cfo: {
            agent: "CFO",
            thesis: "",
            score: 7,
            confidence: 0.55,
            blocked: false,
            blockers: [],
            risks: [],
            citations: [],
            required_changes: [],
            approval_conditions: [],
            apga_impact_view: "",
            governance_checks_met: {},
          },
          cto: {
            agent: "CTO",
            thesis: "",
            score: 8,
            confidence: 0.8,
            blocked: false,
            blockers: [],
            risks: [],
            citations: [],
            required_changes: [],
            approval_conditions: [],
            apga_impact_view: "",
            governance_checks_met: {},
          },
        },
        evidence_verification: {
          generated_at: "2026-02-21T00:00:00.000Z",
          verdict: "insufficient",
          summary: "",
          required_actions: [],
          by_agent: [
            {
              agent_id: "compliance",
              agent_name: "Compliance",
              verdict: "insufficient",
              citation_count: 0,
              risk_evidence_count: 0,
              gaps: ["Missing legal citation", "No policy source", "extra"],
            },
          ],
        },
      }),
    );

    expect(questions.length).toBe(8);
    expect(new Set(questions).size).toBe(8);
    expect(questions.join(" ")).toContain('missing "Problem Framing" section');
    expect(questions.join(" ")).toContain("investment, projected benefit, and risk-adjusted ROI");
    expect(questions.join(" ")).toContain("confidence is low");
  });

  it("adds risk outcome prompts and returns empty output when no signals exist", () => {
    const outcomeQuestions = deriveArtifactAssistantQuestions(
      baseState({
        risk_simulation: {
          mode: "monte-carlo",
          outcomes: {
            expected_case: { net_value: 100, roi: 0.2 },
            worst_case: { net_value: -10, roi: -0.05 },
            best_case: { net_value: 150, roi: 0.4 },
            probability_of_loss: 0.42,
          },
        } as any,
      }),
    );

    expect(outcomeQuestions.join(" ")).toContain("42% probability of loss");
    expect(outcomeQuestions.join(" ")).toContain("Worst-case scenario remains net negative");

    expect(deriveArtifactAssistantQuestions(baseState())).toEqual([]);
  });

  it("includes evidence-gap prompts when there is room in the question budget", () => {
    const questions = deriveArtifactAssistantQuestions(
      baseState({
        evidence_verification: {
          generated_at: "2026-02-21T00:00:00.000Z",
          verdict: "insufficient",
          summary: "",
          required_actions: [],
          by_agent: [
            {
              agent_id: "compliance",
              agent_name: "Compliance",
              verdict: "insufficient",
              citation_count: 0,
              risk_evidence_count: 0,
              gaps: ["Missing legal citation"],
            },
          ],
        },
      }),
    );

    expect(questions).toHaveLength(1);
    expect(questions[0]).toContain("Compliance evidence gap");
  });
});
