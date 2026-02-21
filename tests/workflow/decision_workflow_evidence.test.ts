import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ReviewOutput } from "../../src/schemas/review_output";

const mocks = vi.hoisted(() => ({
  deriveArtifactAssistantQuestions: vi.fn(),
}));

vi.mock("../../src/workflow/decision_workflow_assistant", () => ({
  deriveArtifactAssistantQuestions: mocks.deriveArtifactAssistantQuestions,
}));

import {
  buildSynthesisEvidenceCitations,
  emitProviderFailureTrace,
  runEvidenceVerification,
} from "../../src/workflow/decision_workflow_evidence";

function review(overrides: Partial<ReviewOutput> = {}): ReviewOutput {
  return {
    agent: "Agent",
    thesis: "A sufficiently detailed thesis to pass minimum audit length.",
    score: 7,
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

function state(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    reviews: {},
    evidence_verification: null,
    artifact_assistant_questions: [],
    ...overrides,
  };
}

describe("emitProviderFailureTrace", () => {
  beforeEach(() => {
    mocks.deriveArtifactAssistantQuestions.mockReset().mockReturnValue([]);
  });

  it("does nothing when provider failure details are absent", () => {
    const onTrace = vi.fn();
    emitProviderFailureTrace(
      { onTrace } as any,
      "ceo",
      "CEO",
      review({
        blockers: ["No provider issue here"],
        risks: [{ type: "risk", severity: 3, evidence: "Evidence text" }],
      }),
    );
    expect(onTrace).not.toHaveBeenCalled();
  });

  it("emits warning trace when provider failure attempts are present", () => {
    const onTrace = vi.fn();
    emitProviderFailureTrace(
      { onTrace } as any,
      "cto",
      "CTO",
      review({
        blockers: ["All providers failed. Attempts: OpenAI: rate limit | Anthropic: missing key"],
      }),
    );

    expect(onTrace).toHaveBeenCalledWith({
      tag: "WARN",
      agentId: "cto",
      message: "CTO provider failure: OpenAI: rate limit | Anthropic: missing key",
    });
  });

  it("emits warning trace from provider-like risk evidence and truncates long details", () => {
    const onTrace = vi.fn();
    const longDetails = "All providers failed. Attempts: " + "x".repeat(600);
    emitProviderFailureTrace(
      { onTrace } as any,
      "compliance",
      "Compliance",
      review({
        blockers: [longDetails],
      }),
    );

    const message = (onTrace.mock.calls[0]?.[0] as { message: string }).message;
    expect(message).toContain("Compliance provider failure:");
    expect(message.endsWith("...")).toBe(true);
    expect(message.length).toBeLessThan(380);
  });

  it("emits warning trace when provider error is detected in risk evidence text", () => {
    const onTrace = vi.fn();
    emitProviderFailureTrace(
      { onTrace } as any,
      "risk-simulation",
      "Risk Agent",
      review({
        risks: [{ type: "risk", severity: 8, evidence: "Provider error: rate limit reached on fallback request." }],
      }),
    );

    expect(onTrace).toHaveBeenCalledWith(
      expect.objectContaining({
        tag: "WARN",
        agentId: "risk-simulation",
        message: expect.stringContaining("Risk Agent provider failure: Provider error: rate limit reached"),
      }),
    );
  });
});

describe("buildSynthesisEvidenceCitations", () => {
  it("sorts blocked reviews first, then by score, and caps to 8 lines", () => {
    const lines = buildSynthesisEvidenceCitations({
      b: review({
        agent: "Blocked Agent",
        blocked: true,
        score: 9,
        blockers: ["B-Blocker"],
        required_changes: ["B-Revision"],
        citations: [{ url: "https://b.example", title: "", claim: "" }],
      }),
      low: review({
        agent: "Low Score",
        blocked: false,
        score: 2,
        blockers: ["L-Blocker"],
        required_changes: ["L-Revision"],
        citations: [{ url: "https://l.example", title: "", claim: "" }],
      }),
      high: review({
        agent: "Higher Score",
        blocked: false,
        score: 8,
        blockers: ["H-Blocker"],
        required_changes: ["H-Revision"],
        citations: [{ url: "https://h.example", title: "", claim: "" }],
      }),
    });

    expect(lines).toHaveLength(8);
    expect(lines[0]).toContain("[Blocked Agent:thesis]");
    expect(lines.some((line) => line.includes("[Low Score:thesis]"))).toBe(true);
    expect(lines.some((line) => line.includes("[Higher Score:thesis]"))).toBe(false);
  });
});

describe("runEvidenceVerification", () => {
  beforeEach(() => {
    mocks.deriveArtifactAssistantQuestions.mockReset().mockReturnValue(["assistant-question"]);
  });

  it("returns sufficient verdict when no evidence gaps are detected", () => {
    const output = runEvidenceVerification(
      state({
        reviews: {
          ceo: review({
            agent: "CEO",
            thesis: "This thesis is long enough and contains concrete justification.",
            risks: [],
            blocked: false,
            citations: [],
            required_changes: [],
          }),
        },
      }) as any,
      {
        includeExternalResearch: false,
        agentConfigs: [{ id: "ceo" }],
      } as any,
    );

    expect(output.evidence_verification!.verdict).toBe("sufficient");
    expect(output.evidence_verification!.required_actions).toEqual([]);
    expect(output.evidence_verification!.by_agent[0]).toMatchObject({
      agent_id: "ceo",
      verdict: "sufficient",
      citation_count: 0,
      risk_evidence_count: 0,
    });
    expect(output.artifact_assistant_questions).toEqual(["assistant-question"]);
  });

  it("returns insufficient verdict with actionable gaps for high-risk review failures", () => {
    const output = runEvidenceVerification(
      state({
        reviews: {
          compliance: review({
            agent: "Compliance",
            thesis: "Too short",
            blocked: true,
            blockers: [],
            risks: [{ type: "risk", severity: 8, evidence: "short" }],
            citations: [{ url: "   ", title: "", claim: "" }],
            required_changes: ["Need remediation"],
          }),
          ceo: review({
            agent: "CEO",
            thesis: "This thesis is long enough and has no risk evidence issues.",
          }),
        },
      }) as any,
      {
        includeExternalResearch: false,
        agentConfigs: [{ id: "compliance" }, { id: "ceo" }, { id: "missing" }],
      } as any,
    );

    expect(output.evidence_verification!.verdict).toBe("insufficient");
    expect(output.evidence_verification!.summary).toContain("1 review(s) require stronger evidence");
    expect(output.evidence_verification!.by_agent).toHaveLength(2);

    const compliance = output.evidence_verification!.by_agent.find((entry: { agent_id: string }) => entry.agent_id === "compliance");
    expect(compliance).toBeDefined();
    expect(compliance?.gaps).toEqual(
      expect.arrayContaining([
        "Thesis is too short to be auditable.",
        "Risks were listed without concrete evidence details.",
        "Review is blocked but no explicit blocker was provided.",
        "No supporting citations were provided for material claims.",
      ]),
    );
    expect(output.evidence_verification!.required_actions).toEqual(
      expect.arrayContaining([
        "[Compliance] Thesis is too short to be auditable.",
        "[Compliance] Risks were listed without concrete evidence details.",
      ]),
    );
    expect(output.artifact_assistant_questions).toEqual(["assistant-question"]);
  });

  it("deduplicates citation urls and ignores malformed citation objects during verification", () => {
    const output = runEvidenceVerification(
      state({
        reviews: {
          cfo: review({
            agent: "CFO",
            thesis: "This thesis is long enough and contains measurable financial assumptions.",
            citations: [
              { url: "https://example.com/a", title: "", claim: "" },
              { url: "https://example.com/a", title: "", claim: "" },
              { url: "   ", title: "", claim: "" },
              { url: 42 as unknown as string, title: "", claim: "" },
            ],
            risks: [],
            blocked: false,
            required_changes: ["Improve downside model"],
          }),
        },
      }) as any,
      {
        includeExternalResearch: false,
        agentConfigs: [{ id: "cfo" }],
      } as any,
    );

    expect(output.evidence_verification!.verdict).toBe("sufficient");
    expect(output.evidence_verification!.by_agent[0]).toMatchObject({
      citation_count: 1,
      verdict: "sufficient",
    });
  });
});
