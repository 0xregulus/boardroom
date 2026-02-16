import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentConfig } from "../../src/config/agent_config";

const workflowMockState = vi.hoisted(() => ({
  reviewOutputs: {
    CEO: {
      agent: "CEO",
      thesis: "CEO review",
      score: 8,
      confidence: 0.8,
      blocked: false,
      blockers: [],
      risks: [],
      required_changes: [],
      approval_conditions: [],
      apga_impact_view: "Positive",
      governance_checks_met: {},
    },
    CFO: {
      agent: "CFO",
      thesis: "CFO review",
      score: 8,
      confidence: 0.8,
      blocked: false,
      blockers: [],
      risks: [],
      required_changes: [],
      approval_conditions: [],
      apga_impact_view: "Positive",
      governance_checks_met: {},
    },
    CTO: {
      agent: "CTO",
      thesis: "CTO review",
      score: 8,
      confidence: 0.8,
      blocked: false,
      blockers: [],
      risks: [],
      required_changes: [],
      approval_conditions: [],
      apga_impact_view: "Positive",
      governance_checks_met: {},
    },
    compliance: {
      agent: "Compliance",
      thesis: "Compliance review",
      score: 8,
      confidence: 0.8,
      blocked: false,
      blockers: [],
      risks: [],
      required_changes: [],
      approval_conditions: [],
      apga_impact_view: "Positive",
      governance_checks_met: {},
    },
  } as Record<string, any>,
  synthesis: {
    executive_summary: "Synthesis",
    final_recommendation: "Approved",
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
}));

const storeMocks = vi.hoisted(() => ({
  getDecisionForWorkflow: vi.fn(),
  listProposedDecisionIds: vi.fn(),
  recordWorkflowRun: vi.fn(),
  updateDecisionStatus: vi.fn(),
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
  getDecisionForWorkflow: storeMocks.getDecisionForWorkflow,
  listProposedDecisionIds: storeMocks.listProposedDecisionIds,
  recordWorkflowRun: storeMocks.recordWorkflowRun,
  updateDecisionStatus: storeMocks.updateDecisionStatus,
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
    getClient(provider: string) {
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

    async evaluate() {
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

    async evaluate() {
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

  const cloneDefaults = () => agentConfigMocks.defaults.map((config) => ({ ...config }));
  agentConfigMocks.normalizeAgentConfigs.mockImplementation(cloneDefaults);
  agentConfigMocks.buildDefaultAgentConfigs.mockImplementation(cloneDefaults);

  storeMocks.getDecisionForWorkflow.mockResolvedValue(makeDecision("d1"));
  storeMocks.listProposedDecisionIds.mockResolvedValue(["d1", "d2"]);
  storeMocks.updateDecisionStatus.mockResolvedValue(undefined);
  storeMocks.upsertGovernanceChecks.mockResolvedValue(undefined);
  storeMocks.upsertDecisionReview.mockResolvedValue(undefined);
  storeMocks.upsertDecisionSynthesis.mockResolvedValue(undefined);
  storeMocks.upsertDecisionPrd.mockResolvedValue(undefined);
  storeMocks.recordWorkflowRun.mockResolvedValue(undefined);

  workflowMockState.reviewOutputs.CEO.score = 8;
  workflowMockState.reviewOutputs.CFO.score = 8;
  workflowMockState.reviewOutputs.CTO.score = 8;
  workflowMockState.reviewOutputs.compliance.score = 8;

  workflowMockState.reviewOutputs.CEO.blocked = false;
  workflowMockState.reviewOutputs.CFO.blocked = false;
  workflowMockState.reviewOutputs.CTO.blocked = false;
  workflowMockState.reviewOutputs.compliance.blocked = false;

  workflowMockState.synthesis = {
    executive_summary: "Synthesis",
    final_recommendation: "Approved",
    conflicts: [],
    blockers: [],
    required_revisions: [],
  };
  workflowMockState.reviewAgentRuntimeOptions = [];
  workflowMockState.complianceAgentRuntimeOptions = [];
  workflowMockState.reviewAgentRuntimeParams = [];
  workflowMockState.complianceAgentRuntimeParams = [];
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

  it("disables external research by default", async () => {
    await runDecisionWorkflow({ decisionId: "d1" });

    expect(workflowMockState.reviewAgentRuntimeOptions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ includeExternalResearch: false }),
        expect.objectContaining({ includeExternalResearch: false }),
        expect.objectContaining({ includeExternalResearch: false }),
      ]),
    );
    expect(workflowMockState.complianceAgentRuntimeOptions).toEqual([
      expect.objectContaining({ includeExternalResearch: false }),
    ]);
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
    expect(workflowMockState.complianceAgentRuntimeOptions).toEqual([
      expect.objectContaining({ includeExternalResearch: true }),
    ]);
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
    expect(workflowMockState.complianceAgentRuntimeParams).toEqual([
      expect.objectContaining({ temperature: 0, maxTokens: 8000 }),
    ]);
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
});
