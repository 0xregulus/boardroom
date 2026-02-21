import { describe, expect, it } from "vitest";

import {
  normalizeWorkflowStates,
  parseSnapshotNumberProperty,
  parseSnapshotSelectName,
  parseSnapshotTextProperty,
  parseWorkflowState,
} from "../../src/features/boardroom/utils/workflow-state-parsers";

describe("features/boardroom/workflow-state-parsers", () => {
  it("parses snapshot text/number/select properties across supported shapes", () => {
    expect(parseSnapshotTextProperty("  KPI  ")).toBe("KPI");
    expect(parseSnapshotTextProperty(42)).toBe("42");
    expect(parseSnapshotTextProperty({ rich_text: [{ plain_text: "A" }, { plain_text: "B" }] })).toBe("AB");
    expect(parseSnapshotTextProperty({ title: [{ plain_text: "Title" }] })).toBe("Title");
    expect(parseSnapshotTextProperty({ multi_select: [{ plain_text: "X" }] })).toBe("X");
    expect(parseSnapshotTextProperty({ people: [{ plain_text: "Owner" }] })).toBe("Owner");
    expect(parseSnapshotTextProperty({ name: "Fallback" })).toBe("Fallback");
    expect(parseSnapshotTextProperty(null)).toBe("");

    expect(parseSnapshotNumberProperty(5)).toBe(5);
    expect(parseSnapshotNumberProperty("12.5")).toBe(12.5);
    expect(parseSnapshotNumberProperty({ number: 9 })).toBe(9);
    expect(parseSnapshotNumberProperty({ formula: { number: 7 } })).toBe(7);
    expect(parseSnapshotNumberProperty({ formula: { number: "bad" } })).toBeNull();

    expect(parseSnapshotSelectName(" Approved ")).toBe("Approved");
    expect(parseSnapshotSelectName({ select: { name: "Q3" } })).toBe("Q3");
    expect(parseSnapshotSelectName({ status: { name: "In Review" } })).toBe("In Review");
    expect(parseSnapshotSelectName({})).toBe("");
  });

  it("parses workflow state with normalization and filtering", () => {
    const parsed = parseWorkflowState({
      decision_id: "d-1",
      decision_name: "Growth Plan",
      dqs: 8.6,
      hygiene_score: 7.2,
      substance_score: 8.1,
      confidence_score: 0.74,
      dissent_penalty: 0.5,
      confidence_penalty: 0.25,
      status: "DECIDED",
      run_id: "9.4",
      run_created_at: "2026-02-21T00:00:00.000Z",
      missing_sections: ["Financial Model"],
      decision_ancestry_retrieval_method: "vector-db",
      artifact_assistant_questions: ["What evidence is missing?"],
      interaction_rounds: [
        {
          round: 0,
          deltas: [
            {
              agent_id: "cfo",
              agent_name: "CFO",
              previous_score: 6.4,
              revised_score: 7.8,
              score_delta: 1.4,
              previous_blocked: 0,
              revised_blocked: true,
            },
            null,
          ],
        },
      ],
      decision_ancestry: [
        {
          decision_id: "legacy-1",
          similarity: 0.82,
          outcome: {
            gate_decision: "approved",
            final_recommendation: "Approved",
            dqs: 7.1,
            run_at: "2026-01-01T00:00:00.000Z",
          },
          lessons: ["validate assumptions"],
          summary: "Prior launch had success",
        },
        {
          decision_id: "legacy-2",
          decision_name: "Legacy Two",
          similarity: 0.33,
          outcome: {
            gate_decision: "challenged",
            final_recommendation: "Unknown",
            dqs: "not-a-number",
            run_at: "2026-01-03T00:00:00.000Z",
          },
          lessons: ["tighten controls"],
          summary: "",
        },
        { similarity: 0.2 },
      ],
      hygiene_findings: [
        { check: "financial_sanity", status: "fail", detail: "Mismatch", score_impact: 1.2 },
        { check: "metadata", status: "weird", detail: "Ambiguous", score_impact: "2" },
        { check: "", status: "pass", detail: "ignored", score_impact: 0 },
      ],
      reviews: {
        cfo: {
          agent: "CFO",
          thesis: "Needs mitigation",
          score: 7.4,
          confidence: 0.66,
          blocked: false,
          blockers: ["cash risk"],
          risks: [
            { type: "financial", severity: 8, evidence: "high burn" },
            "invalid-risk",
          ],
          citations: [
            { url: "https://example.com", title: "Source", claim: "Evidence" },
            { title: "missing url" },
          ],
          required_changes: ["add guardrail"],
          approval_conditions: ["monthly check"],
          governance_checks_met: { "Problem Quantified": true, "Bad Type": "yes" },
        },
        bad: "not-an-object",
      },
      synthesis: {
        executive_summary: "Proceed with controls.",
        final_recommendation: "NotSure",
        consensus_points: ["point-1"],
        point_of_contention: "timeline",
        residual_risks: ["cash runway"],
        evidence_citations: ["[CFO:risk] high burn"],
        conflicts: ["speed vs control"],
        blockers: ["none"],
        required_revisions: ["add milestone"],
      },
      prd: {
        title: "Execution PRD",
        scope: ["scope-1"],
        milestones: ["m1"],
        telemetry: ["t1"],
        risks: ["r1"],
        sections: { Goals: ["g1"], Empty: "nope" },
      },
      decision_snapshot: {
        properties: { "Primary KPI": "ARR" },
        section_excerpt: [
          { text: { content: "Line one" } },
          { text: { content: "Line two" } },
        ],
        computed: {
          inferred_governance_checks: { "Strategic Alignment Brief": true, bad: "nope" },
          autochecked_governance_fields: ["Primary KPI", 1],
        },
      },
    });

    expect(parsed).not.toBeNull();
    expect(parsed).toMatchObject({
      decision_id: "d-1",
      decision_name: "Growth Plan",
      run_id: 9,
      run_created_at: "2026-02-21T00:00:00.000Z",
      status: "DECIDED",
      decision_ancestry_retrieval_method: "vector-db",
      missing_sections: ["Financial Model"],
      artifact_assistant_questions: ["What evidence is missing?"],
    });
    expect(parsed?.interaction_rounds?.[0]).toMatchObject({
      round: 1,
      summary: "Cross-agent rebuttal round executed.",
      deltas: [
        {
          agent_id: "cfo",
          agent_name: "CFO",
          previous_score: 6,
          revised_score: 8,
          score_delta: 1,
          previous_blocked: false,
          revised_blocked: true,
        },
      ],
    });
    expect(parsed?.decision_ancestry).toHaveLength(2);
    expect(parsed?.decision_ancestry[0]?.decision_name).toBe("legacy-1");
    expect(parsed?.decision_ancestry[1]?.outcome).toMatchObject({
      final_recommendation: null,
      dqs: null,
    });
    expect(parsed?.hygiene_findings).toEqual([
      { check: "financial_sanity", status: "fail", detail: "Mismatch", score_impact: 1.2 },
      { check: "metadata", status: "warning", detail: "Ambiguous", score_impact: 0 },
    ]);
    expect(parsed?.reviews).toEqual({
      cfo: {
        agent: "CFO",
        thesis: "Needs mitigation",
        score: 7.4,
        confidence: 0.66,
        blocked: false,
        blockers: ["cash risk"],
        risks: [{ type: "financial", severity: 8, evidence: "high burn" }],
        citations: [{ url: "https://example.com", title: "Source", claim: "Evidence" }],
        required_changes: ["add guardrail"],
        approval_conditions: ["monthly check"],
        governance_checks_met: { "Problem Quantified": true, "Bad Type": false },
      },
    });
    expect(parsed?.synthesis?.final_recommendation).toBe("Challenged");
    expect(parsed?.prd?.sections).toEqual({ Goals: ["g1"], Empty: [] });
    expect(parsed?.decision_snapshot).toMatchObject({
      excerpt: "Line one\nLine two",
      governance_checks: { "Strategic Alignment Brief": true, bad: false },
      autochecked_fields: ["Primary KPI"],
    });
  });

  it("normalizes workflow result payloads across modes", () => {
    expect(parseWorkflowState(null)).toBeNull();
    expect(normalizeWorkflowStates(null)).toEqual([]);

    expect(normalizeWorkflowStates({ mode: "single", result: "bad" })).toEqual([]);
    expect(
      normalizeWorkflowStates({
        mode: "single",
        result: {
          decision_id: "single-1",
          reviews: {},
          synthesis: null,
          prd: null,
          decision_snapshot: null,
          decision_ancestry: [],
          hygiene_findings: [],
          artifact_assistant_questions: [],
          missing_sections: [],
        },
      }),
    ).toHaveLength(1);

    const all = normalizeWorkflowStates({
      mode: "all_proposed",
      results: [
        { decision_id: "d-1", reviews: {}, decision_ancestry: [], hygiene_findings: [], artifact_assistant_questions: [], missing_sections: [] },
        "invalid",
        { decision_id: "d-2", reviews: {}, decision_ancestry: [], hygiene_findings: [], artifact_assistant_questions: [], missing_sections: [] },
      ],
    });
    expect(all.map((entry) => entry.decision_id)).toEqual(["d-1", "d-2"]);

    expect(normalizeWorkflowStates({ mode: "all_proposed", results: undefined })).toEqual([]);
  });
});
