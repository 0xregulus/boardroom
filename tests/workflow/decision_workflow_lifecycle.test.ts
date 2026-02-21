import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ReviewOutput } from "../../src/schemas/review_output";

const mocks = vi.hoisted(() => ({
  chairCtor: vi.fn(),
  chairEvaluate: vi.fn(),
  resolveModelForProvider: vi.fn(),
  retrieveDecisionAncestryContext: vi.fn(),
  getDecisionForWorkflow: vi.fn(),
  recordWorkflowRun: vi.fn(),
  updateDecisionStatus: vi.fn(),
  upsertDecisionPrd: vi.fn(),
  upsertDecisionReview: vi.fn(),
  upsertDecisionSynthesis: vi.fn(),
  upsertGovernanceChecks: vi.fn(),
  deriveArtifactAssistantQuestions: vi.fn(),
  buildSynthesisEvidenceCitations: vi.fn(),
  average: vi.fn(),
  hasLowSpecializedConfidence: vi.fn(),
  specializedConfidenceValues: vi.fn(),
  evaluateRequiredGates: vi.fn(),
  inferGovernanceChecksFromText: vi.fn(),
  evaluateHygiene: vi.fn(),
  buildPrdOutput: vi.fn(),
  runRiskSimulation: vi.fn(),
}));

vi.mock("../../src/agents/base", () => ({
  ConfiguredChairpersonAgent: class ConfiguredChairpersonAgent {
    constructor(...args: unknown[]) {
      mocks.chairCtor(...args);
    }

    evaluate(payload: unknown) {
      return mocks.chairEvaluate(payload);
    }
  },
}));

vi.mock("../../src/config/llm_providers", () => ({
  resolveModelForProvider: mocks.resolveModelForProvider,
}));

vi.mock("../../src/memory/retriever", () => ({
  retrieveDecisionAncestryContext: mocks.retrieveDecisionAncestryContext,
}));

vi.mock("../../src/store/postgres", () => ({
  getDecisionForWorkflow: mocks.getDecisionForWorkflow,
  recordWorkflowRun: mocks.recordWorkflowRun,
  updateDecisionStatus: mocks.updateDecisionStatus,
  upsertDecisionPrd: mocks.upsertDecisionPrd,
  upsertDecisionReview: mocks.upsertDecisionReview,
  upsertDecisionSynthesis: mocks.upsertDecisionSynthesis,
  upsertGovernanceChecks: mocks.upsertGovernanceChecks,
}));

vi.mock("../../src/workflow/decision_workflow_assistant", () => ({
  deriveArtifactAssistantQuestions: mocks.deriveArtifactAssistantQuestions,
}));

vi.mock("../../src/workflow/decision_workflow_evidence", () => ({
  buildSynthesisEvidenceCitations: mocks.buildSynthesisEvidenceCitations,
}));

vi.mock("../../src/workflow/decision_workflow_scoring", () => ({
  average: mocks.average,
  hasLowSpecializedConfidence: mocks.hasLowSpecializedConfidence,
  specializedConfidenceValues: mocks.specializedConfidenceValues,
}));

vi.mock("../../src/workflow/gates", () => ({
  evaluateRequiredGates: mocks.evaluateRequiredGates,
  inferGovernanceChecksFromText: mocks.inferGovernanceChecksFromText,
}));

vi.mock("../../src/workflow/hygiene", () => ({
  evaluateHygiene: mocks.evaluateHygiene,
}));

vi.mock("../../src/workflow/prd", () => ({
  buildPrdOutput: mocks.buildPrdOutput,
}));

vi.mock("../../src/workflow/risk_simulation", () => ({
  runRiskSimulation: mocks.runRiskSimulation,
}));

import {
  buildDecisionState,
  decideGate,
  generatePrd,
  persistArtifacts,
  synthesizeReviews,
} from "../../src/workflow/decision_workflow_lifecycle";

function review(overrides: Partial<ReviewOutput> = {}): ReviewOutput {
  return {
    agent: "Agent",
    thesis: "A sufficiently long thesis for auditability.",
    score: 8,
    confidence: 0.8,
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

function baseState(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    decision_id: "d-1",
    user_context: {},
    business_constraints: {},
    strategic_goals: [],
    decision_snapshot: null,
    reviews: {},
    dqs: 8,
    status: "PROPOSED",
    synthesis: null,
    prd: null,
    missing_sections: [],
    decision_name: "Decision d-1",
    interaction_rounds: [],
    decision_ancestry: [],
    decision_ancestry_retrieval_method: "lexical-fallback",
    hygiene_score: 8,
    substance_score: 8,
    confidence_score: 0.8,
    dissent_penalty: 0,
    confidence_penalty: 0,
    hygiene_findings: [],
    artifact_assistant_questions: [],
    chairperson_evidence_citations: [],
    market_intelligence: null,
    evidence_verification: null,
    risk_simulation: null,
    ...overrides,
  };
}

describe("workflow lifecycle", () => {
  beforeEach(() => {
    mocks.chairCtor.mockReset();
    mocks.chairEvaluate.mockReset();
    mocks.resolveModelForProvider.mockReset().mockReturnValue("resolved-model");
    mocks.retrieveDecisionAncestryContext.mockReset().mockResolvedValue({
      similar_decisions: [{ decision_id: "d-old", similarity: 0.8 }],
      retrieval_method: "vector-db",
    });
    mocks.getDecisionForWorkflow.mockReset();
    mocks.recordWorkflowRun.mockReset().mockResolvedValue(undefined);
    mocks.updateDecisionStatus.mockReset().mockResolvedValue(undefined);
    mocks.upsertDecisionPrd.mockReset().mockResolvedValue(undefined);
    mocks.upsertDecisionReview.mockReset().mockResolvedValue(undefined);
    mocks.upsertDecisionSynthesis.mockReset().mockResolvedValue(undefined);
    mocks.upsertGovernanceChecks.mockReset().mockResolvedValue(undefined);
    mocks.deriveArtifactAssistantQuestions.mockReset().mockReturnValue(["assistant-question"]);
    mocks.buildSynthesisEvidenceCitations.mockReset().mockReturnValue(["[CEO:source] https://example.com/source"]);
    mocks.average.mockReset().mockImplementation((values: number[]) => (values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0));
    mocks.hasLowSpecializedConfidence.mockReset().mockReturnValue(false);
    mocks.specializedConfidenceValues.mockReset().mockReturnValue([0.8]);
    mocks.evaluateRequiredGates.mockReset().mockReturnValue([]);
    mocks.inferGovernanceChecksFromText.mockReset().mockReturnValue({});
    mocks.evaluateHygiene.mockReset().mockReturnValue({ score: 7.5, findings: [] });
    mocks.buildPrdOutput.mockReset().mockReturnValue({ title: "PRD", scope: [], milestones: [], telemetry: [], risks: [], sections: {} });
    mocks.runRiskSimulation.mockReset().mockReturnValue({ mode: "estimated" });
  });

  it("throws when decision cannot be loaded from postgres", async () => {
    mocks.getDecisionForWorkflow.mockResolvedValueOnce(null);
    await expect(buildDecisionState(baseState() as any)).rejects.toThrow("Decision d-1 was not found in PostgreSQL");
  });

  it("builds decision state, auto-checks governance fields, and marks incomplete when required sections are missing", async () => {
    const longBody = `${"A".repeat(12_500)}\nTrailing`;
    mocks.getDecisionForWorkflow.mockResolvedValueOnce({
      id: "d-1",
      name: "   ",
      createdAt: "2026-02-21T00:00:00.000Z",
      bodyText: longBody,
      properties: {
        "Executive Summary": "Decision summary",
      },
      governanceChecks: {
        "Problem Quantified": false,
      },
    });
    mocks.inferGovernanceChecksFromText.mockReturnValueOnce({
      "Problem Quantified": true,
      "Success Metrics Defined": false,
    });
    mocks.evaluateRequiredGates.mockReturnValueOnce(["Success Metrics Defined"]);

    const output = await buildDecisionState(baseState() as any);

    expect(mocks.upsertGovernanceChecks).toHaveBeenCalledWith("d-1", ["Problem Quantified"]);
    expect(mocks.updateDecisionStatus).toHaveBeenCalledWith("d-1", "Incomplete");
    expect(output.decision_name).toBe("Untitled Decision d-1");
    expect(output.missing_sections).toEqual(["Success Metrics Defined"]);
    expect(output.decision_ancestry_retrieval_method).toBe("vector-db");
    expect(output.hygiene_score).toBe(7.5);
    expect(output.risk_simulation).toEqual({ mode: "estimated" });
    expect(output.artifact_assistant_questions).toEqual(["assistant-question"]);
    expect((output.decision_snapshot as any).section_excerpt[0].text.content.length).toBe(12000);
    expect((output.decision_snapshot as any).properties["Problem Quantified"]).toBe(true);
  });

  it("does not upsert governance checks and marks under evaluation when required sections are complete", async () => {
    mocks.getDecisionForWorkflow.mockResolvedValueOnce({
      id: "d-1",
      name: "  Revenue Expansion  ",
      createdAt: "2026-02-21T00:00:00.000Z",
      bodyText: "Short body",
      properties: {},
      governanceChecks: {
        "Problem Quantified": true,
      },
    });
    mocks.inferGovernanceChecksFromText.mockReturnValueOnce({
      "Problem Quantified": true,
    });
    mocks.evaluateRequiredGates.mockReturnValueOnce([]);

    const output = await buildDecisionState(baseState() as any);

    expect(mocks.upsertGovernanceChecks).not.toHaveBeenCalled();
    expect(mocks.updateDecisionStatus).toHaveBeenCalledWith("d-1", "Under Evaluation");
    expect(output.decision_name).toBe("  Revenue Expansion  ");
  });

  it("synthesizes reviews and appends evidence section when missing", async () => {
    mocks.chairEvaluate.mockResolvedValueOnce({
      executive_summary: "Summary",
      final_recommendation: "Approved",
      consensus_points: [],
      point_of_contention: "",
      residual_risks: [],
      evidence_citations: ["[existing] https://existing.com"],
      conflicts: [],
      blockers: [],
      required_revisions: [],
    });
    const deps = {
      providerClients: {
        getResilientClient: vi.fn().mockReturnValue("client"),
      },
      defaultProvider: "OpenAI",
      modelName: "gpt-4.1-mini",
      temperature: 0.2,
    };
    const state = baseState({
      decision_snapshot: { page_id: "p-1" },
      reviews: {
        ceo: review({ agent: "CEO" }),
      },
      interaction_rounds: [{ round: 1, summary: "Round summary", deltas: [] }],
    });

    const output = await synthesizeReviews(state as any, deps as any);

    expect(mocks.resolveModelForProvider).toHaveBeenCalledWith("OpenAI", "gpt-4.1-mini");
    expect(mocks.chairCtor).toHaveBeenCalledWith("client", "resolved-model", 0.2, 500, { provider: "OpenAI" });
    expect(mocks.chairEvaluate).toHaveBeenCalledWith(
      expect.objectContaining({
        snapshot: expect.objectContaining({
          page_id: "p-1",
          reviews: [expect.objectContaining({ agent: "CEO" })],
        }),
      }),
    );
    expect(output.status).toBe("SYNTHESIZED");
    expect(output.synthesis!.final_recommendation).toBe("Approved");
    expect(output.synthesis!.executive_summary).toContain("Evidence citations:");
    expect(output.synthesis!.point_of_contention).toBe("Round summary");
    expect(output.chairperson_evidence_citations).toEqual([
      "[existing] https://existing.com",
      "[CEO:source] https://example.com/source",
    ]);
  });

  it("applies hard-block guardrail when CFO or Compliance blocks", async () => {
    mocks.chairEvaluate.mockResolvedValueOnce({
      executive_summary: "Summary",
      final_recommendation: "Approved",
      consensus_points: [],
      point_of_contention: "Point",
      residual_risks: [],
      evidence_citations: [],
      conflicts: [],
      blockers: [],
      required_revisions: [],
    });
    const state = baseState({
      reviews: {
        cfo: review({ agent: "CFO", blocked: true, blockers: ["Hard block"] }),
      },
    });

    const output = await synthesizeReviews(state as any, {
      providerClients: { getResilientClient: vi.fn().mockReturnValue("client") },
      defaultProvider: "OpenAI",
      modelName: "m",
      temperature: 0.2,
    } as any);

    expect(output.synthesis!.final_recommendation).toBe("Blocked");
    expect(output.synthesis!.blockers.some((entry: string) => entry.includes("governance policy enforces a blocked outcome"))).toBe(true);
  });

  it("normalizes unknown chairperson recommendations to Challenged", async () => {
    mocks.chairEvaluate.mockResolvedValueOnce({
      executive_summary: "Summary",
      final_recommendation: "Needs Debate",
      consensus_points: [],
      point_of_contention: "",
      residual_risks: [],
      evidence_citations: [],
      conflicts: [],
      blockers: [],
      required_revisions: [],
    });

    const output = await synthesizeReviews(
      baseState({
        reviews: { ceo: review({ agent: "CEO" }) },
        hygiene_score: 8,
        dissent_penalty: 0,
        evidence_verification: null,
      }) as any,
      {
        providerClients: { getResilientClient: vi.fn().mockReturnValue("client") },
        defaultProvider: "OpenAI",
        modelName: "m",
        temperature: 0.2,
      } as any,
    );

    expect(output.synthesis!.final_recommendation).toBe("Challenged");
  });

  it("returns synthesized state unchanged when chairperson returns no synthesis payload", async () => {
    mocks.chairEvaluate.mockResolvedValueOnce(null);
    const output = await synthesizeReviews(
      baseState({
        reviews: { ceo: review({ agent: "CEO" }) },
      }) as any,
      {
        providerClients: { getResilientClient: vi.fn().mockReturnValue("client") },
        defaultProvider: "OpenAI",
        modelName: "m",
        temperature: 0.2,
      } as any,
    );

    expect(output.status).toBe("SYNTHESIZED");
    expect(output.synthesis).toBeNull();
    expect(output.chairperson_evidence_citations).toEqual([]);
  });

  it("applies low-hygiene, low-specialized-confidence, dissent, and evidence guardrails", async () => {
    mocks.chairEvaluate.mockResolvedValue({
      executive_summary: "Summary",
      final_recommendation: "Approved",
      consensus_points: [],
      point_of_contention: "",
      residual_risks: [],
      evidence_citations: [],
      conflicts: [],
      blockers: [],
      required_revisions: [],
    });

    mocks.hasLowSpecializedConfidence.mockReturnValueOnce(true);
    mocks.specializedConfidenceValues.mockReturnValueOnce([0.52]);
    mocks.average.mockReturnValueOnce(0.52);
    const lowSpecialized = await synthesizeReviews(
      baseState({ hygiene_score: 8, dissent_penalty: 0, evidence_verification: null, reviews: { ceo: review({ agent: "CEO" }) } }) as any,
      {
        providerClients: { getResilientClient: vi.fn().mockReturnValue("client") },
        defaultProvider: "OpenAI",
        modelName: "m",
        temperature: 0.2,
      } as any,
    );
    expect(lowSpecialized.synthesis!.final_recommendation).toBe("Challenged");
    expect(lowSpecialized.synthesis!.required_revisions.some((entry: string) => entry.includes("Specialized confidence is low (52%)"))).toBe(
      true,
    );

    mocks.hasLowSpecializedConfidence.mockReturnValueOnce(false);
    const lowHygiene = await synthesizeReviews(
      baseState({ hygiene_score: 6.1, dissent_penalty: 0, evidence_verification: null, reviews: { ceo: review({ agent: "CEO" }) } }) as any,
      {
        providerClients: { getResilientClient: vi.fn().mockReturnValue("client") },
        defaultProvider: "OpenAI",
        modelName: "m",
        temperature: 0.2,
      } as any,
    );
    expect(lowHygiene.synthesis!.required_revisions).toContain(
      "Raise hygiene score by resolving quantitative consistency and documentation gaps.",
    );

    mocks.hasLowSpecializedConfidence.mockReturnValueOnce(false);
    const dissent = await synthesizeReviews(
      baseState({ hygiene_score: 8, dissent_penalty: 2.6, evidence_verification: null, reviews: { ceo: review({ agent: "CEO" }) } }) as any,
      {
        providerClients: { getResilientClient: vi.fn().mockReturnValue("client") },
        defaultProvider: "OpenAI",
        modelName: "m",
        temperature: 0.2,
      } as any,
    );
    expect(dissent.synthesis!.required_revisions).toContain(
      "Weighted dissent from risk/compliance reviewers requires additional mitigation evidence.",
    );

    mocks.hasLowSpecializedConfidence.mockReturnValueOnce(false);
    const evidence = await synthesizeReviews(
      baseState({
        hygiene_score: 8,
        dissent_penalty: 0,
        reviews: { ceo: review({ agent: "CEO" }) },
        evidence_verification: {
          verdict: "insufficient",
          required_actions: ["A1", "A2", "A3", "A4", "A5"],
        },
      }) as any,
      {
        providerClients: { getResilientClient: vi.fn().mockReturnValue("client") },
        defaultProvider: "OpenAI",
        modelName: "m",
        temperature: 0.2,
      } as any,
    );
    expect(evidence.synthesis!.final_recommendation).toBe("Challenged");
    expect(evidence.synthesis!.required_revisions).toEqual(expect.arrayContaining(["A1", "A2", "A3", "A4"]));
    expect(evidence.synthesis!.required_revisions).not.toContain("A5");
  });

  it("decides gate and updates status for each gate outcome branch", async () => {
    mocks.hasLowSpecializedConfidence.mockReset().mockReturnValue(false);
    const blocked = await decideGate(baseState({ reviews: { ceo: review({ blocked: true }) } }) as any);
    expect(blocked).toBe("blocked");
    expect(mocks.updateDecisionStatus).toHaveBeenLastCalledWith("d-1", "Blocked");

    mocks.hasLowSpecializedConfidence.mockReset().mockReturnValue(false);
    const lowHygiene = await decideGate(baseState({ reviews: { ceo: review() }, hygiene_score: 5.5 }) as any);
    expect(lowHygiene).toBe("revision_required");
    expect(mocks.updateDecisionStatus).toHaveBeenLastCalledWith("d-1", "Challenged");

    mocks.hasLowSpecializedConfidence.mockReset().mockReturnValue(true);
    const lowSpecialized = await decideGate(baseState({ reviews: { ceo: review() }, hygiene_score: 8, confidence_score: 0.8 }) as any);
    expect(lowSpecialized).toBe("revision_required");

    mocks.hasLowSpecializedConfidence.mockReset().mockReturnValue(false);
    const lowConfidence = await decideGate(baseState({ reviews: { ceo: review() }, hygiene_score: 8, confidence_score: 0.4 }) as any);
    expect(lowConfidence).toBe("revision_required");

    mocks.hasLowSpecializedConfidence.mockReset().mockReturnValue(false);
    const dissent = await decideGate(baseState({ reviews: { ceo: review() }, hygiene_score: 8, confidence_score: 0.8, dissent_penalty: 2.5 }) as any);
    expect(dissent).toBe("revision_required");

    mocks.hasLowSpecializedConfidence.mockReset().mockReturnValue(false);
    const insufficientEvidence = await decideGate(
      baseState({ reviews: { ceo: review() }, hygiene_score: 8, confidence_score: 0.8, dissent_penalty: 0, evidence_verification: { verdict: "insufficient" } }) as any,
    );
    expect(insufficientEvidence).toBe("revision_required");

    mocks.hasLowSpecializedConfidence.mockReset().mockReturnValue(false);
    const lowDqs = await decideGate(baseState({ reviews: { ceo: review() }, hygiene_score: 8, confidence_score: 0.8, dissent_penalty: 0, evidence_verification: { verdict: "sufficient" }, dqs: 6.9 }) as any);
    expect(lowDqs).toBe("revision_required");

    mocks.hasLowSpecializedConfidence.mockReset().mockReturnValue(false);
    const approved = await decideGate(baseState({ reviews: { ceo: review() }, hygiene_score: 8, confidence_score: 0.8, dissent_penalty: 0, evidence_verification: { verdict: "sufficient" }, dqs: 8.3 }) as any);
    expect(approved).toBe("approved");
    expect(mocks.updateDecisionStatus).toHaveBeenLastCalledWith("d-1", "Approved");
  });

  it("generates PRD and marks decided", () => {
    mocks.buildPrdOutput.mockReturnValueOnce({ title: "Generated PRD" });
    const output = generatePrd(baseState({ status: "SYNTHESIZED" }) as any);
    expect(output.status).toBe("DECIDED");
    expect(output.prd).toEqual({ title: "Generated PRD" });
  });

  it("persists reviews, synthesis, prd, and run metadata", async () => {
    const state = baseState({
      status: "DECIDED",
      dqs: 11,
      reviews: {
        ceo: review({ agent: "CEO", score: 7 }),
      },
      synthesis: {
        executive_summary: "Synthesis summary",
        final_recommendation: "Blocked",
        consensus_points: [],
        point_of_contention: "",
        residual_risks: [],
        evidence_citations: [],
        conflicts: [],
        blockers: ["B1"],
        required_revisions: ["R1"],
      },
      chairperson_evidence_citations: ["[CEO:source] https://example.com/evidence"],
      prd: { title: "PRD payload" },
    });

    const output = await persistArtifacts(state as any, "blocked");

    expect(mocks.upsertDecisionReview).toHaveBeenCalledWith("d-1", "ceo", expect.any(Object));
    expect(mocks.upsertDecisionSynthesis).toHaveBeenCalledWith("d-1", (state as any).synthesis);
    expect(mocks.upsertDecisionReview).toHaveBeenCalledWith(
      "d-1",
      "Chairperson",
      expect.objectContaining({
        blocked: true,
        score: 10,
        citations: [
          {
            url: "https://example.com/evidence",
            title: "Chairperson Evidence Line",
            claim: "[CEO:source] https://example.com/evidence",
          },
        ],
      }),
    );
    expect(mocks.upsertDecisionPrd).toHaveBeenCalledWith("d-1", { title: "PRD payload" });
    expect(mocks.recordWorkflowRun).toHaveBeenCalledWith("d-1", 11, "blocked", "DECIDED", expect.any(Object));
    expect(output.status).toBe("PERSISTED");
  });

  it("persists minimal artifacts when synthesis/prd are absent", async () => {
    const state = baseState({
      status: "REVIEWING",
      reviews: {
        ceo: review({ agent: "CEO" }),
      },
      synthesis: null,
      prd: null,
    });

    await persistArtifacts(state as any, "revision_required");

    expect(mocks.upsertDecisionSynthesis).not.toHaveBeenCalled();
    expect(mocks.upsertDecisionPrd).not.toHaveBeenCalled();
    expect(mocks.recordWorkflowRun).toHaveBeenCalledWith("d-1", 8, "revision_required", "REVIEWING", expect.any(Object));
  });
});
