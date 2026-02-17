import { afterEach, describe, expect, it, vi } from "vitest";

import { createMockRequest, createMockResponse } from "../helpers/next_api";

const mocks = vi.hoisted(() => ({
  normalizeAgentConfigs: vi.fn(),
  getPersistedAgentConfigs: vi.fn(),
  runDecisionWorkflow: vi.fn(),
  runAllProposedDecisions: vi.fn(),
}));

vi.mock("../../src/config/agent_config", () => ({
  normalizeAgentConfigs: mocks.normalizeAgentConfigs,
}));

vi.mock("../../src/store/postgres", () => ({
  getPersistedAgentConfigs: mocks.getPersistedAgentConfigs,
}));

vi.mock("../../src/workflow/decision_workflow", () => ({
  runDecisionWorkflow: mocks.runDecisionWorkflow,
  runAllProposedDecisions: mocks.runAllProposedDecisions,
}));

import handler from "../../pages/api/workflow/run";

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  vi.clearAllMocks();
});

describe("API /api/workflow/run", () => {
  it("returns 405 for unsupported methods", async () => {
    const req = createMockRequest({ method: "GET" });
    const mock = createMockResponse();

    await handler(req, mock.res);

    expect(mock.statusCode).toBe(405);
    expect(mock.headers.Allow).toBe("POST");
  });

  it("runs workflow for a single decision", async () => {
    mocks.getPersistedAgentConfigs.mockResolvedValueOnce([{ id: "ceo" }]);
    mocks.normalizeAgentConfigs.mockReturnValueOnce([{ id: "ceo" }, { id: "cfo" }]);
    mocks.runDecisionWorkflow.mockResolvedValueOnce({ decision_id: "d-1" });

    const req = createMockRequest({
      method: "POST",
      body: {
        decisionId: "  d-1  ",
        modelName: "gpt-4o-mini",
      },
    });
    const mock = createMockResponse();

    await handler(req, mock.res);

    expect(mocks.runDecisionWorkflow).toHaveBeenCalledWith(
      expect.objectContaining({
        decisionId: "d-1",
        modelName: "gpt-4o-mini",
        agentConfigs: [{ id: "ceo" }, { id: "cfo" }],
        includeExternalResearch: false,
      }),
    );
    expect(mock.statusCode).toBe(200);
    expect(mock.body).toMatchObject({
      mode: "single",
      result: expect.objectContaining({
        decision_id: "d-1",
        reviews: {},
      }),
    });
  });

  it("runs all proposed decisions when no decisionId is provided", async () => {
    mocks.getPersistedAgentConfigs.mockResolvedValueOnce(null);
    mocks.normalizeAgentConfigs.mockReturnValueOnce([{ id: "ceo" }]);
    mocks.runAllProposedDecisions.mockResolvedValueOnce([{ decision_id: "d-1" }, { decision_id: "d-2" }]);

    const req = createMockRequest({ method: "POST", body: {} });
    const mock = createMockResponse();

    await handler(req, mock.res);

    expect(mocks.runAllProposedDecisions).toHaveBeenCalledWith(
      expect.objectContaining({
        agentConfigs: [{ id: "ceo" }],
        includeExternalResearch: false,
      }),
    );
    expect(mock.statusCode).toBe(200);
    expect(mock.body).toMatchObject({
      mode: "all_proposed",
      count: 2,
    });
    expect((mock.body as any).results[0]).toMatchObject({
      decision_id: "d-1",
      reviews: {},
    });
    expect((mock.body as any).results[1]).toMatchObject({
      decision_id: "d-2",
      reviews: {},
    });
  });

  it("returns 500 when execution fails", async () => {
    mocks.getPersistedAgentConfigs.mockResolvedValueOnce(null);
    mocks.normalizeAgentConfigs.mockReturnValueOnce([{ id: "ceo" }]);
    mocks.runAllProposedDecisions.mockRejectedValueOnce(new Error("boom"));

    const req = createMockRequest({ method: "POST", body: {} });
    const mock = createMockResponse();

    await handler(req, mock.res);

    expect(mock.statusCode).toBe(500);
    expect(mock.body).toMatchObject({ error: "Workflow execution failed" });
  });

  it("returns 400 when body is not an object", async () => {
    const req = createMockRequest({
      method: "POST",
      body: "not-an-object",
    });
    const mock = createMockResponse();

    await handler(req, mock.res);

    expect(mock.statusCode).toBe(400);
    expect(mock.body).toEqual({ error: "Invalid request payload" });
    expect(mocks.runDecisionWorkflow).not.toHaveBeenCalled();
  });

  it("returns 400 when payload has invalid execution bounds", async () => {
    const req = createMockRequest({
      method: "POST",
      body: {
        decisionId: "d-1",
        temperature: 1.2,
      },
    });
    const mock = createMockResponse();

    await handler(req, mock.res);

    expect(mock.statusCode).toBe(400);
    expect(mock.body).toEqual({ error: "Invalid request payload" });
    expect(mocks.runDecisionWorkflow).not.toHaveBeenCalled();
  });

  it("returns 400 for invalid decision id format", async () => {
    const req = createMockRequest({
      method: "POST",
      body: {
        decisionId: "bad/id",
      },
    });
    const mock = createMockResponse();

    await handler(req, mock.res);

    expect(mock.statusCode).toBe(400);
    expect(mock.body).toEqual({ error: "Invalid request payload" });
    expect(mocks.runDecisionWorkflow).not.toHaveBeenCalled();
  });

  it("returns 400 for invalid model name format", async () => {
    const req = createMockRequest({
      method: "POST",
      body: {
        modelName: "gpt-4o-mini with space",
      },
    });
    const mock = createMockResponse();

    await handler(req, mock.res);

    expect(mock.statusCode).toBe(400);
    expect(mock.body).toEqual({ error: "Invalid request payload" });
    expect(mocks.runDecisionWorkflow).not.toHaveBeenCalled();
  });

  it("passes includeExternalResearch=true when requested", async () => {
    mocks.getPersistedAgentConfigs.mockResolvedValueOnce([{ id: "ceo" }]);
    mocks.normalizeAgentConfigs.mockReturnValueOnce([{ id: "ceo" }]);
    mocks.runDecisionWorkflow.mockResolvedValueOnce({ decision_id: "d-1" });

    const req = createMockRequest({
      method: "POST",
      body: {
        decisionId: "d-1",
        includeExternalResearch: true,
      },
    });
    const mock = createMockResponse();

    await handler(req, mock.res);

    expect(mocks.runDecisionWorkflow).toHaveBeenCalledWith(
      expect.objectContaining({
        decisionId: "d-1",
        includeExternalResearch: true,
      }),
    );
    expect(mock.statusCode).toBe(200);
  });

  it("passes interactionRounds when provided", async () => {
    mocks.getPersistedAgentConfigs.mockResolvedValueOnce([{ id: "ceo" }]);
    mocks.normalizeAgentConfigs.mockReturnValueOnce([{ id: "ceo" }]);
    mocks.runDecisionWorkflow.mockResolvedValueOnce({ decision_id: "d-1" });

    const req = createMockRequest({
      method: "POST",
      body: {
        decisionId: "d-1",
        interactionRounds: 2,
      },
    });
    const mock = createMockResponse();

    await handler(req, mock.res);

    expect(mocks.runDecisionWorkflow).toHaveBeenCalledWith(
      expect.objectContaining({
        decisionId: "d-1",
        interactionRounds: 2,
      }),
    );
    expect(mock.statusCode).toBe(200);
  });

  it("returns full workflow state when includeSensitive=true", async () => {
    mocks.getPersistedAgentConfigs.mockResolvedValueOnce([{ id: "ceo" }]);
    mocks.normalizeAgentConfigs.mockReturnValueOnce([{ id: "ceo" }]);
    mocks.runDecisionWorkflow.mockResolvedValueOnce({
      decision_id: "d-1",
      reviews: {
        ceo: { thesis: "full" },
      },
    });

    const req = createMockRequest({
      method: "POST",
      body: {
        decisionId: "d-1",
        includeSensitive: true,
      },
    });
    const mock = createMockResponse();

    await handler(req, mock.res);

    expect(mock.statusCode).toBe(200);
    expect(mock.body).toMatchObject({
      mode: "single",
      result: {
        decision_id: "d-1",
        reviews: {
          ceo: { thesis: "full" },
        },
      },
    });
  });

  it("returns 400 when agentConfigs exceeds limit", async () => {
    const req = createMockRequest({
      method: "POST",
      body: {
        agentConfigs: new Array(33).fill({ id: "ceo" }),
      },
    });
    const mock = createMockResponse();

    await handler(req, mock.res);

    expect(mock.statusCode).toBe(400);
    expect(mock.body).toEqual({ error: "Invalid request payload" });
  });

  it("returns 400 when interactionRounds is out of bounds", async () => {
    const req = createMockRequest({
      method: "POST",
      body: {
        decisionId: "d-1",
        interactionRounds: 4,
      },
    });
    const mock = createMockResponse();

    await handler(req, mock.res);

    expect(mock.statusCode).toBe(400);
    expect(mock.body).toEqual({ error: "Invalid request payload" });
    expect(mocks.runDecisionWorkflow).not.toHaveBeenCalled();
  });

  it("rejects remote bulk runs without approval header when approval policy is enabled", async () => {
    process.env = {
      ...ORIGINAL_ENV,
      NODE_ENV: "development",
      BOARDROOM_RATE_LIMIT_BACKEND: "memory",
      BOARDROOM_ADMIN_KEY: "admin-key-1234567890",
      BOARDROOM_RUN_APPROVAL_KEY: "run-approval-key-1234567890",
      BOARDROOM_REQUIRE_BULK_RUN_APPROVAL: "true",
    };
    mocks.getPersistedAgentConfigs.mockResolvedValueOnce(null);
    mocks.normalizeAgentConfigs.mockReturnValueOnce([{ id: "ceo" }]);

    const req = createMockRequest({
      method: "POST",
      body: {},
      headers: {
        "x-boardroom-admin-key": "admin-key-1234567890",
      },
    });
    const mock = createMockResponse();

    await handler(req, mock.res);

    expect(mock.statusCode).toBe(403);
    expect(mock.body).toEqual({ error: "Workflow run requires explicit approval" });
    expect(mocks.runAllProposedDecisions).not.toHaveBeenCalled();
  });

  it("allows remote bulk runs with approval header when policy is enabled", async () => {
    process.env = {
      ...ORIGINAL_ENV,
      NODE_ENV: "development",
      BOARDROOM_RATE_LIMIT_BACKEND: "memory",
      BOARDROOM_ADMIN_KEY: "admin-key-1234567890",
      BOARDROOM_RUN_APPROVAL_KEY: "run-approval-key-1234567890",
      BOARDROOM_REQUIRE_BULK_RUN_APPROVAL: "true",
    };
    mocks.getPersistedAgentConfigs.mockResolvedValueOnce(null);
    mocks.normalizeAgentConfigs.mockReturnValueOnce([{ id: "ceo" }]);
    mocks.runAllProposedDecisions.mockResolvedValueOnce([{ decision_id: "d-1" }]);

    const req = createMockRequest({
      method: "POST",
      body: {},
      headers: {
        "x-boardroom-admin-key": "admin-key-1234567890",
        "x-boardroom-run-approval": "run-approval-key-1234567890",
      },
    });
    const mock = createMockResponse();

    await handler(req, mock.res);

    expect(mock.statusCode).toBe(200);
    expect(mocks.runAllProposedDecisions).toHaveBeenCalledTimes(1);
  });

  it("returns 400 when bulk workflow execution exceeds configured limit", async () => {
    mocks.getPersistedAgentConfigs.mockResolvedValueOnce(null);
    mocks.normalizeAgentConfigs.mockReturnValueOnce([{ id: "ceo" }]);
    mocks.runAllProposedDecisions.mockRejectedValueOnce(new Error("Bulk run limit exceeded: 80 decisions exceed limit 50"));

    const req = createMockRequest({ method: "POST", body: {} });
    const mock = createMockResponse();

    await handler(req, mock.res);

    expect(mock.statusCode).toBe(400);
    expect(mock.body).toEqual({ error: "Bulk run exceeds configured limit" });
  });
});
