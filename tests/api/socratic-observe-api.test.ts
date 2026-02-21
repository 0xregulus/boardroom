import { beforeEach, describe, expect, it, vi } from "vitest";

import { createMockRequest, createMockResponse } from "../helpers/next_api";

const mocks = vi.hoisted(() => ({
  enforceRateLimit: vi.fn(),
  enforceSensitiveRouteAccess: vi.fn(),
  resolveProvider: vi.fn(),
  resolveModelForProvider: vi.fn(),
  buildSocraticSession: vi.fn(),
  buildStrategicDecisionDocument: vi.fn(),
  initialCreateStrategyDraft: vi.fn(),
  buildSocraticSystemPrompt: vi.fn(),
  buildSocraticAgentUserMessage: vi.fn(),
  parseSocraticAgentOutput: vi.fn(),
  applySocraticAgentOutput: vi.fn(),
  getResilientClient: vi.fn(),
  complete: vi.fn(),
}));

vi.mock("../../src/security/request_guards", () => ({
  enforceRateLimit: mocks.enforceRateLimit,
  enforceSensitiveRouteAccess: mocks.enforceSensitiveRouteAccess,
}));

vi.mock("../../src/config/llm_providers", () => ({
  resolveProvider: mocks.resolveProvider,
  resolveModelForProvider: mocks.resolveModelForProvider,
}));

vi.mock("../../src/llm/client", () => ({
  ProviderClientRegistry: class ProviderClientRegistry {
    getResilientClient(provider: unknown) {
      return mocks.getResilientClient(provider);
    }
  },
}));

vi.mock("../../src/features/boardroom/utils", () => ({
  buildSocraticSession: mocks.buildSocraticSession,
  buildStrategicDecisionDocument: mocks.buildStrategicDecisionDocument,
  initialCreateStrategyDraft: mocks.initialCreateStrategyDraft,
}));

vi.mock("../../src/features/boardroom/socratic_observer", () => ({
  applySocraticAgentOutput: mocks.applySocraticAgentOutput,
  buildSocraticAgentUserMessage: mocks.buildSocraticAgentUserMessage,
  buildSocraticSystemPrompt: mocks.buildSocraticSystemPrompt,
  parseSocraticAgentOutput: mocks.parseSocraticAgentOutput,
}));

import handler from "../../pages/api/socratic/observe";

function buildBaseDraft() {
  return {
    name: "",
    owner: "Unassigned",
    reviewDate: "",
    primaryKpi: "",
    investment: "",
    strategicObjective: "",
    confidence: "",
    coreProperties: {
      strategicObjective: "",
      primaryKpi: "",
      baseline: "",
      target: "",
      timeHorizon: "",
      decisionType: "",
    },
    capitalAllocation: {
      investmentRequired: 0,
      grossBenefit12m: 0,
      probabilityOfSuccess: "",
      strategicLeverageScore: "",
      reversibilityFactor: "",
    },
    riskProperties: {
      regulatoryRisk: "",
      technicalRisk: "",
      operationalRisk: "",
      reputationalRisk: "",
    },
    sections: {
      problemFraming: "",
      financialModel: "",
    },
  };
}

describe("API /api/socratic/observe", () => {
  beforeEach(() => {
    mocks.enforceRateLimit.mockResolvedValue(true);
    mocks.enforceSensitiveRouteAccess.mockReturnValue(true);
    mocks.resolveProvider.mockReturnValue("OpenAI");
    mocks.resolveModelForProvider.mockReturnValue("gpt-4o-mini");
    mocks.initialCreateStrategyDraft.mockImplementation(buildBaseDraft);
    mocks.buildSocraticSession.mockReturnValue({ id: "session-1" });
    mocks.buildStrategicDecisionDocument.mockReturnValue({ id: "doc-1", mode: "heuristic" });
    mocks.buildSocraticSystemPrompt.mockReturnValue("system prompt");
    mocks.buildSocraticAgentUserMessage.mockReturnValue("user prompt");
    mocks.getResilientClient.mockReturnValue({
      complete: mocks.complete,
    });
    mocks.complete.mockResolvedValue('{"ok":true}');
    mocks.parseSocraticAgentOutput.mockReturnValue(null);
    mocks.applySocraticAgentOutput.mockReturnValue({ id: "doc-1", mode: "llm" });
  });

  it("returns 405 for unsupported methods", async () => {
    const req = createMockRequest({ method: "GET" });
    const mock = createMockResponse();

    await handler(req, mock.res);

    expect(mock.statusCode).toBe(405);
    expect(mock.headers.Allow).toBe("POST");
    expect(mock.body).toEqual({ error: "Method not allowed." });
  });

  it("returns early when rate limit guard rejects request", async () => {
    mocks.enforceRateLimit.mockResolvedValueOnce(false);
    const req = createMockRequest({ method: "POST", body: {} });
    const mock = createMockResponse();

    await handler(req, mock.res);

    expect(mocks.enforceRateLimit).toHaveBeenCalledTimes(1);
    expect(mocks.enforceSensitiveRouteAccess).not.toHaveBeenCalled();
    expect(mocks.buildSocraticSession).not.toHaveBeenCalled();
  });

  it("returns early when sensitive route access is denied", async () => {
    mocks.enforceSensitiveRouteAccess.mockReturnValueOnce(false);
    const req = createMockRequest({ method: "POST", body: {} });
    const mock = createMockResponse();

    await handler(req, mock.res);

    expect(mocks.enforceSensitiveRouteAccess).toHaveBeenCalledTimes(1);
    expect(mocks.buildSocraticSession).not.toHaveBeenCalled();
  });

  it("returns 400 for invalid payload", async () => {
    const req = createMockRequest({
      method: "POST",
      body: {
        action: "simulate_red_team",
        unknownField: true,
      },
    });
    const mock = createMockResponse();

    await handler(req, mock.res);

    expect(mock.statusCode).toBe(400);
    expect(mock.body).toEqual({ error: "Invalid request payload." });
  });

  it("returns heuristic mode when parsed LLM output is null", async () => {
    const req = createMockRequest({
      method: "POST",
      body: {
        action: "verify_assumptions",
        draft: {
          name: "Decision A",
          owner: 42,
          capitalAllocation: {
            investmentRequired: "1200",
            grossBenefit12m: "bad-number",
          },
          sections: {
            problemFraming: false,
          },
        },
        researchLinksBySection: {
          problemFraming: [
            {
              title: "Source",
              url: "https://example.com",
              snippet: "evidence",
              publishedDate: null,
            },
          ],
        },
      },
    });
    const mock = createMockResponse();

    await handler(req, mock.res);

    expect(mock.statusCode).toBe(200);
    expect(mock.body).toMatchObject({
      session: { id: "session-1" },
      strategicDocument: { id: "doc-1", mode: "heuristic" },
      mode: "observer-heuristic",
    });

    const normalizedDraft = mocks.buildSocraticSession.mock.calls[0]?.[0] as {
      owner: string;
      capitalAllocation: { investmentRequired: number; grossBenefit12m: number };
      sections: { problemFraming: string };
    };

    expect(normalizedDraft.owner).toBe("Unassigned");
    expect(normalizedDraft.capitalAllocation.investmentRequired).toBe(1200);
    expect(normalizedDraft.capitalAllocation.grossBenefit12m).toBe(0);
    expect(normalizedDraft.sections.problemFraming).toBe("");
    expect(mocks.complete).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "gpt-4o-mini",
        systemMessage: "system prompt",
        userMessage: "user prompt",
        temperature: 0.15,
        maxTokens: 1000,
        requireJsonObject: true,
      }),
    );
  });

  it("returns observer-llm mode when parsed observer output is available", async () => {
    mocks.parseSocraticAgentOutput.mockReturnValueOnce({
      socratic_layer: {
        active_inquiry: "test",
        suggested_research: [],
        red_team_critique: "",
        logic_gaps: [],
        risk_pills: [],
      },
    });
    mocks.applySocraticAgentOutput.mockReturnValueOnce({ id: "doc-1", mode: "llm-applied" });

    const req = createMockRequest({ method: "POST", body: {} });
    const mock = createMockResponse();

    await handler(req, mock.res);

    expect(mocks.applySocraticAgentOutput).toHaveBeenCalledTimes(1);
    expect(mock.statusCode).toBe(200);
    expect(mock.body).toMatchObject({
      strategicDocument: { id: "doc-1", mode: "llm-applied" },
      mode: "observer-llm",
    });
  });

  it("falls back to heuristic mode when LLM completion fails", async () => {
    mocks.complete.mockRejectedValueOnce(new Error("provider down"));
    const req = createMockRequest({ method: "POST", body: {} });
    const mock = createMockResponse();

    await handler(req, mock.res);

    expect(mock.statusCode).toBe(200);
    expect(mock.body).toMatchObject({
      strategicDocument: { id: "doc-1", mode: "heuristic" },
      mode: "observer-heuristic",
    });
  });

  it("returns 500 when strategic document construction fails", async () => {
    mocks.buildStrategicDecisionDocument.mockImplementationOnce(() => {
      throw new Error("document build failed");
    });
    const req = createMockRequest({ method: "POST", body: {} });
    const mock = createMockResponse();

    await handler(req, mock.res);

    expect(mock.statusCode).toBe(500);
    expect(mock.body).toEqual({ error: "Unable to analyze this draft right now." });
  });
});
