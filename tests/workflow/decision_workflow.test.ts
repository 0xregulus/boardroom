import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentConfig } from "../../src/config/agent_config";

function makeReviewOutput(agent: string) {
  return {
    agent,
    thesis: `${agent} review indicates balanced evidence and clear rationale for decision quality.`,
    score: 8,
    confidence: 0.8,
    blocked: false,
    blockers: [],
    risks: [],
    citations: [],
    required_changes: [],
    approval_conditions: [],
    apga_impact_view: "Positive",
    governance_checks_met: {},
  };
}

function interactionRoundContexts(entries: unknown[]): unknown[] {
  return entries.filter((entry) => {
    const memory = (entry as { memory_context?: Record<string, unknown> })?.memory_context;
    return typeof memory?.interaction_round === "number";
  });
}

const workflowMockState = vi.hoisted(() => ({
  reviewOutputs: {
    CEO: makeReviewOutput("CEO"),
    CFO: makeReviewOutput("CFO"),
    CTO: makeReviewOutput("CTO"),
    compliance: makeReviewOutput("Compliance"),
    "Risk Agent": makeReviewOutput("Risk Agent"),
    "Devil's Advocate": makeReviewOutput("Devil's Advocate"),
  } as Record<string, any>,
  synthesis: {
    executive_summary: "Synthesis",
    final_recommendation: "Approved",
    consensus_points: [],
    point_of_contention: "",
    residual_risks: [],
    evidence_citations: [],
    conflicts: [],
    blockers: [],
    required_revisions: [],
  } as Record<string, any>,
  reviewAgentRuntimeOptions: [] as Array<{
    includeExternalResearch?: boolean;
    promptOverride?: { systemMessage: string; userTemplate: string };
  }>,
  complianceAgentRuntimeOptions: [] as Array<{
    includeExternalResearch?: boolean;
    promptOverride?: { systemMessage: string; userTemplate: string };
  }>,
  reviewAgentRuntimeParams: [] as Array<{ temperature?: number; maxTokens?: number }>,
  complianceAgentRuntimeParams: [] as Array<{ temperature?: number; maxTokens?: number }>,
  reviewAgentContexts: [] as Array<unknown>,
  complianceAgentContexts: [] as Array<unknown>,
}));

const storeMocks = vi.hoisted(() => ({
  getDecisionAncestryEmbedding: vi.fn(),
  getDecisionForWorkflow: vi.fn(),
  listDecisionAncestryCandidates: vi.fn(),
  listDecisionAncestryEmbeddings: vi.fn(),
  listProposedDecisionIds: vi.fn(),
  recordWorkflowRun: vi.fn(),
  updateDecisionStatus: vi.fn(),
  upsertDecisionAncestryEmbedding: vi.fn(),
  upsertDecisionPrd: vi.fn(),
  upsertDecisionReview: vi.fn(),
  upsertDecisionSynthesis: vi.fn(),
  upsertGovernanceChecks: vi.fn(),
}));

const agentConfigMocks = vi.hoisted(() => {
  const defaults: AgentConfig[] = [
    {
      id: "ceo",
      role: "CEO",
      name: "CEO",
      provider: "OpenAI",
      model: "gpt-4o-mini",
      temperature: 0.3,
      maxTokens: 1200,
      systemMessage: "default ceo system",
      userMessage: "default ceo user {snapshot_json}",
    },
    {
      id: "cfo",
      role: "CFO",
      name: "CFO",
      provider: "OpenAI",
      model: "gpt-4o-mini",
      temperature: 0.3,
      maxTokens: 1200,
      systemMessage: "default cfo system",
      userMessage: "default cfo user {snapshot_json}",
    },
    {
      id: "cto",
      role: "CTO",
      name: "CTO",
      provider: "OpenAI",
      model: "gpt-4o-mini",
      temperature: 0.3,
      maxTokens: 1200,
      systemMessage: "default cto system",
      userMessage: "default cto user {snapshot_json}",
    },
    {
      id: "compliance",
      role: "Compliance",
      name: "Compliance",
      provider: "OpenAI",
      model: "gpt-4o-mini",
      temperature: 0.3,
      maxTokens: 1200,
      systemMessage: "default compliance system",
      userMessage: "default compliance user {snapshot_json}",
    },
  ];

  const clone = () => defaults.map((config) => ({ ...config }));

  return {
    defaults,
    normalizeAgentConfigs: vi.fn(clone),
    buildDefaultAgentConfigs: vi.fn(clone),
  };
});

vi.mock("../../src/store/postgres", () => ({
  getDecisionAncestryEmbedding: storeMocks.getDecisionAncestryEmbedding,
  getDecisionForWorkflow: storeMocks.getDecisionForWorkflow,
  listDecisionAncestryCandidates: storeMocks.listDecisionAncestryCandidates,
  listDecisionAncestryEmbeddings: storeMocks.listDecisionAncestryEmbeddings,
  listProposedDecisionIds: storeMocks.listProposedDecisionIds,
  recordWorkflowRun: storeMocks.recordWorkflowRun,
  updateDecisionStatus: storeMocks.updateDecisionStatus,
  upsertDecisionAncestryEmbedding: storeMocks.upsertDecisionAncestryEmbedding,
  upsertDecisionPrd: storeMocks.upsertDecisionPrd,
  upsertDecisionReview: storeMocks.upsertDecisionReview,
  upsertDecisionSynthesis: storeMocks.upsertDecisionSynthesis,
  upsertGovernanceChecks: storeMocks.upsertGovernanceChecks,
}));

vi.mock("../../src/config/agent_config", () => ({
  normalizeAgentConfigs: agentConfigMocks.normalizeAgentConfigs,
  buildDefaultAgentConfigs: agentConfigMocks.buildDefaultAgentConfigs,
}));

vi.mock("../../src/config/llm_providers", () => ({
  resolveModelForProvider: vi.fn((_provider: string, candidate?: string) => candidate ?? "gpt-4o-mini"),
  resolveProvider: vi.fn(() => "OpenAI"),
}));

vi.mock("../../src/llm/client", () => ({
  ProviderClientRegistry: class {
    getResilientClient(provider: string) {
      return { provider, complete: vi.fn() };
    }
  },
}));

vi.mock("../../src/workflow/prd", () => ({
  buildPrdOutput: vi.fn((state: { decision_name: string }) => ({
    title: `PRD for ${state.decision_name}`,
    scope: ["scope"],
    milestones: ["m1", "m2", "m3"],
    telemetry: ["t1"],
    risks: ["r1"],
    sections: {
      Goals: ["g1"],
    },
  })),
}));

vi.mock("../../src/agents/base", () => ({
  ConfiguredReviewAgent: class {
    readonly role: string;

    constructor(
      role: string,
      _client?: unknown,
      _modelName?: string,
      temperature?: number,
      maxTokens?: number,
      options?: { includeExternalResearch?: boolean; promptOverride?: { systemMessage: string; userTemplate: string } },
    ) {
      this.role = role;
      workflowMockState.reviewAgentRuntimeOptions.push(options ?? {});
      workflowMockState.reviewAgentRuntimeParams.push({ temperature, maxTokens });
    }

    async evaluate(context?: unknown) {
      workflowMockState.reviewAgentContexts.push(context);
      return workflowMockState.reviewOutputs[this.role];
    }
  },
  ConfiguredComplianceAgent: class {
    constructor(
      _client?: unknown,
      _modelName?: string,
      temperature?: number,
      maxTokens?: number,
      options?: { includeExternalResearch?: boolean; promptOverride?: { systemMessage: string; userTemplate: string } },
    ) {
      workflowMockState.complianceAgentRuntimeOptions.push(options ?? {});
      workflowMockState.complianceAgentRuntimeParams.push({ temperature, maxTokens });
    }

    async evaluate(context?: unknown) {
      workflowMockState.complianceAgentContexts.push(context);
      return workflowMockState.reviewOutputs.compliance;
    }
  },
  ConfiguredChairpersonAgent: class {
    async evaluate() {
      return workflowMockState.synthesis;
    }
  },
}));

import { runAllProposedDecisions, runDecisionWorkflow } from "../../src/workflow/decision_workflow";

function makeDecision(id: string) {
  const requiredChecks = {
    "Strategic Alignment Brief": true,
    "Problem Quantified": true,
    "≥3 Options Evaluated": true,
    "Success Metrics Defined": true,
    "Leading Indicators Defined": true,
    "Kill Criteria Defined": true,
  };

  return {
    id,
    name: `Decision ${id}`,
    createdAt: "2026-02-16T00:00:00.000Z",
    bodyText: "Strategic context with objective supported and success metrics.",
    properties: {
      Baseline: 1,
      Target: 2,
      "Time Horizon": "Q2",
      "Strategic Alignment Brief": true,
      "Problem Quantified": true,
      "≥3 Options Evaluated": true,
      "Success Metrics Defined": true,
      "Leading Indicators Defined": true,
      "Kill Criteria Defined": true,
    },
    governanceChecks: requiredChecks,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.BOARDROOM_MAX_BULK_RUN_DECISIONS;

  const cloneDefaults = () => agentConfigMocks.defaults.map((config) => ({ ...config }));
  agentConfigMocks.normalizeAgentConfigs.mockImplementation(cloneDefaults);
  agentConfigMocks.buildDefaultAgentConfigs.mockImplementation(cloneDefaults);

  storeMocks.getDecisionForWorkflow.mockResolvedValue(makeDecision("d1"));
  storeMocks.getDecisionAncestryEmbedding.mockResolvedValue(null);
  storeMocks.listDecisionAncestryCandidates.mockResolvedValue([]);
  storeMocks.listDecisionAncestryEmbeddings.mockResolvedValue({});
  storeMocks.listProposedDecisionIds.mockResolvedValue(["d1", "d2"]);
  storeMocks.updateDecisionStatus.mockResolvedValue(undefined);
  storeMocks.upsertDecisionAncestryEmbedding.mockResolvedValue(undefined);
  storeMocks.upsertGovernanceChecks.mockResolvedValue(undefined);
  storeMocks.upsertDecisionReview.mockResolvedValue(undefined);
  storeMocks.upsertDecisionSynthesis.mockResolvedValue(undefined);
  storeMocks.upsertDecisionPrd.mockResolvedValue(undefined);
  storeMocks.recordWorkflowRun.mockResolvedValue(undefined);

  workflowMockState.reviewOutputs.CEO.score = 8;
  workflowMockState.reviewOutputs.CFO.score = 8;
  workflowMockState.reviewOutputs.CTO.score = 8;
  workflowMockState.reviewOutputs.compliance.score = 8;
  workflowMockState.reviewOutputs["Risk Agent"].score = 8;
  workflowMockState.reviewOutputs["Devil's Advocate"].score = 8;

  workflowMockState.reviewOutputs.CEO.blocked = false;
  workflowMockState.reviewOutputs.CFO.blocked = false;
  workflowMockState.reviewOutputs.CTO.blocked = false;
  workflowMockState.reviewOutputs.compliance.blocked = false;
  workflowMockState.reviewOutputs["Risk Agent"].blocked = false;
  workflowMockState.reviewOutputs["Devil's Advocate"].blocked = false;
  workflowMockState.reviewOutputs.CEO.blockers = [];
  workflowMockState.reviewOutputs.CFO.blockers = [];
  workflowMockState.reviewOutputs.CTO.blockers = [];
  workflowMockState.reviewOutputs.compliance.blockers = [];
  workflowMockState.reviewOutputs["Risk Agent"].blockers = [];
  workflowMockState.reviewOutputs["Devil's Advocate"].blockers = [];
  workflowMockState.reviewOutputs.CEO.risks = [];
  workflowMockState.reviewOutputs.CFO.risks = [];
  workflowMockState.reviewOutputs.CTO.risks = [];
  workflowMockState.reviewOutputs.compliance.risks = [];
  workflowMockState.reviewOutputs["Risk Agent"].risks = [];
  workflowMockState.reviewOutputs["Devil's Advocate"].risks = [];

  workflowMockState.synthesis = {
    executive_summary: "Synthesis",
    final_recommendation: "Approved",
    consensus_points: [],
    point_of_contention: "",
    residual_risks: [],
    evidence_citations: [],
    conflicts: [],
    blockers: [],
    required_revisions: [],
  };
  workflowMockState.reviewAgentRuntimeOptions = [];
  workflowMockState.complianceAgentRuntimeOptions = [];
  workflowMockState.reviewAgentRuntimeParams = [];
  workflowMockState.complianceAgentRuntimeParams = [];
  workflowMockState.reviewAgentContexts = [];
  workflowMockState.complianceAgentContexts = [];
});

describe("runDecisionWorkflow", () => {
  it("runs full approved flow and persists PRD", async () => {
    const state = await runDecisionWorkflow({ decisionId: "d1" });

    expect(state.status).toBe("PERSISTED");
    expect(state.prd?.title).toContain("Decision d1");

    expect(storeMocks.updateDecisionStatus).toHaveBeenNthCalledWith(1, "d1", "Under Evaluation");
    expect(storeMocks.updateDecisionStatus).toHaveBeenCalledWith("d1", "Approved");
    expect(storeMocks.upsertDecisionPrd).toHaveBeenCalledTimes(1);
    expect(storeMocks.upsertDecisionReview).toHaveBeenCalledTimes(5);
    expect(storeMocks.recordWorkflowRun).toHaveBeenCalledWith(
      "d1",
      expect.any(Number),
      "approved",
      "DECIDED",
      expect.any(Object),
    );
  });

  it("marks decision as blocked and skips PRD when any review is blocked", async () => {
    workflowMockState.reviewOutputs.CFO.blocked = true;

    const state = await runDecisionWorkflow({ decisionId: "d1" });

    expect(state.prd).toBeNull();
    expect(storeMocks.updateDecisionStatus).toHaveBeenCalledWith("d1", "Blocked");
    expect(storeMocks.upsertDecisionPrd).not.toHaveBeenCalled();
    expect(storeMocks.recordWorkflowRun).toHaveBeenCalledWith(
      "d1",
      expect.any(Number),
      "blocked",
      "SYNTHESIZED",
      expect.any(Object),
    );
  });

  it("marks decision as challenged when dqs is below threshold", async () => {
    workflowMockState.reviewOutputs.CEO.score = 3;
    workflowMockState.reviewOutputs.CFO.score = 3;
    workflowMockState.reviewOutputs.CTO.score = 3;
    workflowMockState.reviewOutputs.compliance.score = 3;

    const state = await runDecisionWorkflow({ decisionId: "d1" });

    expect(state.prd).toBeNull();
    expect(storeMocks.updateDecisionStatus).toHaveBeenCalledWith("d1", "Challenged");
    expect(storeMocks.recordWorkflowRun).toHaveBeenCalledWith(
      "d1",
      expect.any(Number),
      "revision_required",
      "SYNTHESIZED",
      expect.any(Object),
    );
  });

  it("runs one interaction round by default and records context", async () => {
    const state = await runDecisionWorkflow({ decisionId: "d1" });

    expect(state.interaction_rounds).toHaveLength(1);
    expect(state.interaction_rounds[0]).toMatchObject({
      round: 1,
      deltas: [],
    });

    const allContexts = [...workflowMockState.reviewAgentContexts, ...workflowMockState.complianceAgentContexts];
    const interactionContexts = interactionRoundContexts(allContexts);

    expect(interactionContexts).toHaveLength(4);
  });

  it("supports disabling interaction rounds", async () => {
    const state = await runDecisionWorkflow({ decisionId: "d1", interactionRounds: 0 });

    expect(state.interaction_rounds).toEqual([]);
    const allContexts = [...workflowMockState.reviewAgentContexts, ...workflowMockState.complianceAgentContexts];
    const interactionContexts = interactionRoundContexts(allContexts);
    expect(interactionContexts).toHaveLength(0);
  });

  it("clamps interaction rounds to upper bound", async () => {
    const state = await runDecisionWorkflow({ decisionId: "d1", interactionRounds: 99 });

    expect(state.interaction_rounds).toHaveLength(5);
    const allContexts = [...workflowMockState.reviewAgentContexts, ...workflowMockState.complianceAgentContexts];
    const interactionContexts = interactionRoundContexts(allContexts);
    expect(interactionContexts).toHaveLength(20);
  });

  it("disables external research by default", async () => {
    await runDecisionWorkflow({ decisionId: "d1" });

    expect(workflowMockState.reviewAgentRuntimeOptions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ includeExternalResearch: false }),
        expect.objectContaining({ includeExternalResearch: false }),
        expect.objectContaining({ includeExternalResearch: false }),
      ]),
    );
    expect(workflowMockState.complianceAgentRuntimeOptions).toEqual(
      expect.arrayContaining([expect.objectContaining({ includeExternalResearch: false })]),
    );
    expect(workflowMockState.complianceAgentRuntimeOptions.every((entry) => entry.includeExternalResearch === false)).toBe(
      true,
    );
  });

  it("enables external research when includeExternalResearch=true", async () => {
    await runDecisionWorkflow({ decisionId: "d1", includeExternalResearch: true });

    expect(workflowMockState.reviewAgentRuntimeOptions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ includeExternalResearch: true }),
        expect.objectContaining({ includeExternalResearch: true }),
        expect.objectContaining({ includeExternalResearch: true }),
      ]),
    );
    expect(workflowMockState.complianceAgentRuntimeOptions).toEqual(
      expect.arrayContaining([expect.objectContaining({ includeExternalResearch: true })]),
    );
    expect(workflowMockState.complianceAgentRuntimeOptions.every((entry) => entry.includeExternalResearch === true)).toBe(
      true,
    );
  });

  it("does not pass promptOverride when provided configs match defaults", async () => {
    await runDecisionWorkflow({
      decisionId: "d1",
      agentConfigs: agentConfigMocks.defaults.map((config) => ({ ...config })),
    });

    expect(workflowMockState.reviewAgentRuntimeOptions.every((entry) => entry.promptOverride === undefined)).toBe(true);
    expect(workflowMockState.complianceAgentRuntimeOptions.every((entry) => entry.promptOverride === undefined)).toBe(
      true,
    );
  });

  it("passes promptOverride when any provided agent config is customized", async () => {
    const customizedConfigs = agentConfigMocks.defaults.map((config) => ({ ...config }));
    customizedConfigs[0] = {
      ...customizedConfigs[0],
      userMessage: "custom ceo prompt {snapshot_json}",
    };
    agentConfigMocks.normalizeAgentConfigs.mockImplementationOnce(() => customizedConfigs.map((config) => ({ ...config })));

    await runDecisionWorkflow({
      decisionId: "d1",
      agentConfigs: customizedConfigs,
    });

    expect(workflowMockState.reviewAgentRuntimeOptions[0]?.promptOverride?.userTemplate).toContain("custom ceo prompt");
    expect(workflowMockState.reviewAgentRuntimeOptions.every((entry) => entry.promptOverride !== undefined)).toBe(true);
    expect(workflowMockState.complianceAgentRuntimeOptions[0]?.promptOverride?.systemMessage).toBe(
      "default compliance system",
    );
  });

  it("clamps workflow runtime bounds for temperature and maxTokens", async () => {
    await runDecisionWorkflow({ decisionId: "d1", temperature: -4, maxTokens: 999999 });

    expect(workflowMockState.reviewAgentRuntimeParams).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ temperature: 0, maxTokens: 8000 }),
        expect.objectContaining({ temperature: 0, maxTokens: 8000 }),
        expect.objectContaining({ temperature: 0, maxTokens: 8000 }),
      ]),
    );
    expect(workflowMockState.complianceAgentRuntimeParams).toEqual(
      expect.arrayContaining([expect.objectContaining({ temperature: 0, maxTokens: 8000 })]),
    );
    expect(workflowMockState.complianceAgentRuntimeParams.every((entry) => entry.temperature === 0)).toBe(true);
    expect(workflowMockState.complianceAgentRuntimeParams.every((entry) => entry.maxTokens === 8000)).toBe(true);
  });

  it("challenges decision when specialized confidence is low", async () => {
    workflowMockState.reviewOutputs.CFO.confidence = 0.25;
    workflowMockState.reviewOutputs.CTO.confidence = 0.3;
    workflowMockState.reviewOutputs.compliance.confidence = 0.2;

    const state = await runDecisionWorkflow({ decisionId: "d1" });

    expect(state.prd).toBeNull();
    expect(storeMocks.updateDecisionStatus).toHaveBeenCalledWith("d1", "Challenged");
    expect(storeMocks.recordWorkflowRun).toHaveBeenCalledWith(
      "d1",
      expect.any(Number),
      "revision_required",
      "SYNTHESIZED",
      expect.any(Object),
    );
  });

  it("adds red-team personas when requested", async () => {
    const state = await runDecisionWorkflow({ decisionId: "d1", includeRedTeamPersonas: true });

    expect(state.interaction_rounds).toHaveLength(1);
    const allContexts = [...workflowMockState.reviewAgentContexts, ...workflowMockState.complianceAgentContexts];
    const interactionContexts = interactionRoundContexts(allContexts);
    expect(interactionContexts).toHaveLength(8);
    expect(storeMocks.upsertDecisionReview).toHaveBeenCalledTimes(9);
  });

  it("emits trace events when a provider fails for an agent review", async () => {
    const onTrace = vi.fn();
    workflowMockState.reviewOutputs.CFO.blockers = [
      "CFO LLM call failed: Error: All providers failed. Attempts: OpenAI: 429 rate limit | Anthropic: missing ANTHROPIC_API_KEY",
    ];

    await runDecisionWorkflow({ decisionId: "d1", onTrace });

    const hasProviderFailureTrace = onTrace.mock.calls.some(([event]) => {
      const candidate = event as { tag?: string; agentId?: string; message?: string };
      return (
        candidate.tag === "WARN" &&
        candidate.agentId === "cfo" &&
        typeof candidate.message === "string" &&
        candidate.message.includes("provider failure")
      );
    });

    expect(hasProviderFailureTrace).toBe(true);
  });
});

describe("runAllProposedDecisions", () => {
  it("runs workflow for each proposed decision", async () => {
    storeMocks.getDecisionForWorkflow
      .mockResolvedValueOnce(makeDecision("d1"))
      .mockResolvedValueOnce(makeDecision("d2"));

    const states = await runAllProposedDecisions();

    expect(states).toHaveLength(2);
    expect(states[0]?.decision_id).toBe("d1");
    expect(states[1]?.decision_id).toBe("d2");
    expect(storeMocks.recordWorkflowRun).toHaveBeenCalledTimes(2);
  });

  it("throws when proposed decision count exceeds configured bulk limit", async () => {
    process.env.BOARDROOM_MAX_BULK_RUN_DECISIONS = "1";

    await expect(runAllProposedDecisions()).rejects.toThrow("Bulk run limit exceeded");
    expect(storeMocks.recordWorkflowRun).not.toHaveBeenCalled();
  });
});
