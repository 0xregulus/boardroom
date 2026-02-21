import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
}));

vi.mock("../../src/store/postgres/client", () => ({
  query: mocks.query,
}));

import {
  listWorkflowRuns,
  loadPersistedDecisionOutputs,
  recordWorkflowRun,
  upsertDecisionPrd,
  upsertDecisionReview,
  upsertDecisionSynthesis,
} from "../../src/store/postgres/workflow_runs";

describe("store/postgres/workflow_runs", () => {
  beforeEach(() => {
    mocks.query.mockReset();
  });

  it("upserts a decision review with serialized arrays", async () => {
    mocks.query.mockResolvedValueOnce({ rows: [], rowCount: 1 });

    await upsertDecisionReview("dec-1", "ceo", {
      agent: "CEO",
      thesis: "Strong upside",
      score: 8,
      confidence: 0.82,
      blocked: false,
      blockers: ["none"],
      risks: [{ type: "execution", severity: 4, evidence: "Hiring plan" }],
      citations: [{ url: "https://example.com", title: "Source", claim: "Evidence" }],
      required_changes: ["add checkpoint"],
      approval_conditions: ["monitor churn"],
      apga_impact_view: "Positive",
      governance_checks_met: { "Strategic Alignment Brief": true },
    });

    const args = mocks.query.mock.calls[0]?.[1] as unknown[];
    expect(args[0]).toBe("dec-1");
    expect(args[1]).toBe("ceo");
    expect(args[6]).toBe(JSON.stringify(["none"]));
    expect(args[7]).toBe(JSON.stringify([{ type: "execution", severity: 4, evidence: "Hiring plan" }]));
    expect(args[8]).toBe(JSON.stringify([{ url: "https://example.com", title: "Source", claim: "Evidence" }]));
    expect(args[12]).toBe(JSON.stringify({ "Strategic Alignment Brief": true }));
  });

  it("upserts synthesis, prd, and workflow run records", async () => {
    mocks.query.mockResolvedValue({ rows: [], rowCount: 1 });

    await upsertDecisionSynthesis("dec-1", {
      executive_summary: "Proceed in phases.",
      final_recommendation: "Approved",
      consensus_points: [],
      point_of_contention: "",
      residual_risks: [],
      evidence_citations: [],
      conflicts: ["scope risk"],
      blockers: [],
      required_revisions: ["add rollout guardrail"],
    });

    await upsertDecisionPrd("dec-1", {
      title: "PRD",
      scope: ["scope-1"],
      milestones: ["milestone-1"],
      telemetry: ["telemetry-1"],
      risks: ["risk-1"],
      sections: { Goals: ["goal-1"] },
    });

    await recordWorkflowRun("dec-1", 8.5, "approved", "PERSISTED", {
      decision_name: "Decision One",
      missing_sections: ["None"],
    });

    const synthesisArgs = mocks.query.mock.calls[0]?.[1] as unknown[];
    expect(synthesisArgs).toEqual([
      "dec-1",
      "Proceed in phases.",
      "Approved",
      JSON.stringify(["scope risk"]),
      JSON.stringify([]),
      JSON.stringify(["add rollout guardrail"]),
    ]);

    const prdArgs = mocks.query.mock.calls[1]?.[1] as unknown[];
    expect(prdArgs).toEqual([
      "dec-1",
      "PRD",
      JSON.stringify(["scope-1"]),
      JSON.stringify(["milestone-1"]),
      JSON.stringify(["telemetry-1"]),
      JSON.stringify(["risk-1"]),
      JSON.stringify({ Goals: ["goal-1"] }),
    ]);

    const runArgs = mocks.query.mock.calls[2]?.[1] as unknown[];
    expect(runArgs).toEqual([
      "dec-1",
      8.5,
      "approved",
      "PERSISTED",
      JSON.stringify({ decision_name: "Decision One", missing_sections: ["None"] }),
    ]);
  });

  it("lists workflow runs with normalized row values", async () => {
    mocks.query.mockResolvedValueOnce({
      rows: [
        {
          id: "-1",
          decision_id: "dec-1",
          dqs: "bad",
          gate_decision: "challenged",
          workflow_status: "DECIDED",
          decision_name: null,
          state_status: 1,
          summary_line: null,
          missing_sections: '["A","B"]',
          created_at: new Date("2026-02-16T00:00:00.000Z"),
        },
      ],
      rowCount: 1,
    });

    const result = await listWorkflowRuns("  dec-1  ", Number.NaN);

    expect(mocks.query.mock.calls[0]?.[1]).toEqual(["dec-1", 20]);
    expect(result).toEqual([
      {
        id: 1,
        decisionId: "dec-1",
        dqs: 0,
        gateDecision: "challenged",
        workflowStatus: "DECIDED",
        decisionName: null,
        stateStatus: null,
        summaryLine: null,
        missingSections: ["A", "B"],
        reviewStances: [],
        riskFindingsCount: 0,
        mitigationCount: 0,
        pendingMitigationsCount: 0,
        frictionScore: 0,
        createdAt: "2026-02-16T00:00:00.000Z",
      },
    ]);
  });

  it("derives review stances and friction metrics from persisted state", async () => {
    mocks.query.mockResolvedValueOnce({
      rows: [
        {
          id: 9,
          decision_id: "dec-9",
          dqs: "8.1",
          gate_decision: "approved",
          workflow_status: "PERSISTED",
          decision_name: "Decision Nine",
          state_status: "DECIDED",
          summary_line: "Summary line",
          missing_sections: [],
          state_json: {
            reviews: {
              ceo: { agent: "CEO", score: 8.5, confidence: 0.9, blocked: false, risks: [{ type: "exec", evidence: "A" }] },
              cfo: { score: 9, confidence: 0.88, blocked: true, risks: [{ type: "cash", evidence: "B" }] },
              "": { score: 5, confidence: 0.6, blocked: false, risks: [{ type: "ops", evidence: "C" }] },
              invalid: "bad-value",
            },
            decision_snapshot: {
              properties: {
                Mitigations: [{ id: "m1" }, { id: "m2" }, { id: "m3" }],
              },
            },
            synthesis: {
              residual_risks: ["r1", "r2", "r3", "r4"],
            },
          },
          created_at: "2026-02-19T00:00:00.000Z",
        },
      ],
      rowCount: 1,
    });

    const [run] = await listWorkflowRuns("dec-9", 5);

    expect(run).toMatchObject({
      id: 9,
      decisionId: "dec-9",
      reviewStances: [
        { agent: "CEO", stance: "approved", score: 8.5, confidence: 0.9 },
        { agent: "cfo", stance: "blocked", score: 9, confidence: 0.88 },
        { agent: "Agent", stance: "caution", score: 5, confidence: 0.6 },
      ],
      riskFindingsCount: 3,
      mitigationCount: 3,
      pendingMitigationsCount: 4,
      frictionScore: 3.6,
    });
  });

  it("throws when workflow run lookup is missing decision id", async () => {
    await expect(listWorkflowRuns("   ")).rejects.toThrow("decisionId is required");
    expect(mocks.query).not.toHaveBeenCalled();
  });

  it("loads persisted outputs and clamps malformed values", async () => {
    mocks.query
      .mockResolvedValueOnce({
        rows: [
          {
            agent_name: "CEO",
            agent_role: "Chief Executive",
            thesis: "Thesis",
            score: "99",
            confidence: "-2",
            blocked: 0,
            blockers: "[\"b1\"]",
            risks: "not-an-array",
            citations: '[{"url":"https://a.com","title":"A","claim":"x"},{"title":"missing-url"}]',
            required_changes: '["c1"]',
            approval_conditions: '["a1"]',
            apga_impact_view: "Neutral",
            governance_checks_met: "{\"Gate\":1}",
          },
        ],
        rowCount: 1,
      })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({
        rows: [
          {
            title: "PRD",
            scope: '["s1"]',
            milestones: '["m1"]',
            telemetry: '["t1"]',
            risks: '["r1"]',
            sections: "not-an-object",
          },
        ],
        rowCount: 1,
      });

    const result = await loadPersistedDecisionOutputs("dec-1");

    expect(result.reviews.ceo).toMatchObject({
      agent: "Chief Executive",
      score: 10,
      confidence: 0,
      blocked: false,
      blockers: ["b1"],
      required_changes: ["c1"],
      approval_conditions: ["a1"],
      governance_checks_met: { Gate: true },
    });
    expect(result.reviews.ceo?.risks).toEqual([]);
    expect(result.reviews.ceo?.citations).toEqual([{ url: "https://a.com", title: "A", claim: "x" }]);
    expect(result.synthesis).toBeNull();
    expect(result.prd).toMatchObject({
      title: "PRD",
      scope: ["s1"],
      sections: {},
    });
  });
});
