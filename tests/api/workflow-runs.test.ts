import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createMockRequest, createMockResponse } from "../helpers/next_api";

const mocks = vi.hoisted(() => ({
  listWorkflowRuns: vi.fn(),
}));

const guardMocks = vi.hoisted(() => ({
  enforceRateLimit: vi.fn(),
  enforceSensitiveRouteAccess: vi.fn(),
}));

vi.mock("../../src/store/postgres", () => ({
  listWorkflowRuns: mocks.listWorkflowRuns,
}));

vi.mock("../../src/security/request_guards", () => ({
  enforceRateLimit: guardMocks.enforceRateLimit,
  enforceSensitiveRouteAccess: guardMocks.enforceSensitiveRouteAccess,
}));

import handler from "../../pages/api/workflow/runs";

beforeEach(() => {
  mocks.listWorkflowRuns.mockReset();
  guardMocks.enforceRateLimit.mockReset().mockResolvedValue(true);
  guardMocks.enforceSensitiveRouteAccess.mockReset().mockReturnValue(true);
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("API /api/workflow/runs", () => {
  it("returns 405 for unsupported methods", async () => {
    const req = createMockRequest({ method: "POST" });
    const mock = createMockResponse();

    await handler(req, mock.res);

    expect(mock.statusCode).toBe(405);
    expect(mock.headers.Allow).toBe("GET");
  });

  it("returns early when rate limiting denies the request", async () => {
    guardMocks.enforceRateLimit.mockResolvedValueOnce(false);

    const req = createMockRequest({
      method: "GET",
      query: { decisionId: "d-1" },
    });
    const mock = createMockResponse();

    await handler(req, mock.res);

    expect(mocks.listWorkflowRuns).not.toHaveBeenCalled();
    expect(guardMocks.enforceSensitiveRouteAccess).not.toHaveBeenCalled();
  });

  it("returns early when sensitive access is denied", async () => {
    guardMocks.enforceSensitiveRouteAccess.mockReturnValueOnce(false);

    const req = createMockRequest({
      method: "GET",
      query: { decisionId: "d-1" },
    });
    const mock = createMockResponse();

    await handler(req, mock.res);

    expect(mocks.listWorkflowRuns).not.toHaveBeenCalled();
  });

  it("returns 400 when decisionId is missing", async () => {
    const req = createMockRequest({ method: "GET", query: {} });
    const mock = createMockResponse();

    await handler(req, mock.res);

    expect(mock.statusCode).toBe(400);
    expect(mock.body).toEqual({ error: "decisionId query parameter is required" });
    expect(mock.headers["Cache-Control"]).toBe("no-store, max-age=0");
  });

  it("returns 400 when decisionId is invalid", async () => {
    const req = createMockRequest({
      method: "GET",
      query: {
        decisionId: "d-1/with-slash",
      },
    });
    const mock = createMockResponse();

    await handler(req, mock.res);

    expect(mock.statusCode).toBe(400);
    expect(mock.body).toEqual({ error: "decisionId query parameter is required" });
  });

  it("returns 400 when decisionId is too long", async () => {
    const req = createMockRequest({
      method: "GET",
      query: {
        decisionId: "d".repeat(129),
      },
    });
    const mock = createMockResponse();

    await handler(req, mock.res);

    expect(mock.statusCode).toBe(400);
    expect(mock.body).toEqual({ error: "decisionId query parameter is required" });
  });

  it("returns redacted run previews scoped to a single decision", async () => {
    mocks.listWorkflowRuns.mockResolvedValueOnce([
      {
        id: 42,
        decisionId: "d-1",
        dqs: 8.7,
        gateDecision: "approved",
        workflowStatus: "PERSISTED",
        decisionName: "Decision One",
        stateStatus: "DECIDED",
        summaryLine: "Decision One is ready for execution.",
        missingSections: ["Baseline"],
        reviewStances: [
          {
            agent: "CEO",
            stance: "approved",
            score: 8,
            confidence: 0.82,
          },
        ],
        riskFindingsCount: 2,
        mitigationCount: 1,
        pendingMitigationsCount: 1,
        frictionScore: 0.4,
        createdAt: "2026-02-16T12:00:00.000Z",
      },
    ]);

    const req = createMockRequest({
      method: "GET",
      query: {
        decisionId: "d-1",
        limit: "20",
      },
    });
    const mock = createMockResponse();

    await handler(req, mock.res);

    expect(mocks.listWorkflowRuns).toHaveBeenCalledWith("d-1", 20);
    expect(mock.statusCode).toBe(200);

    const firstRun = (mock.body as any).runs[0];
    expect("state_json" in firstRun).toBe(false);
    expect(firstRun.state_preview).toMatchObject({
      decision_id: "d-1",
      decision_name: "Decision One",
      dqs: 8.7,
      status: "DECIDED",
      missing_sections: ["Baseline"],
      review_stances: [
        {
          agent: "CEO",
          stance: "approved",
          score: 8,
          confidence: 0.82,
        },
      ],
      risk_findings_count: 2,
      mitigation_count: 1,
      pending_mitigations_count: 1,
      friction_score: 0.4,
      reviews: {},
      synthesis: null,
      prd: null,
      decision_snapshot: null,
      run_id: 42,
      run_created_at: "2026-02-16T12:00:00.000Z",
    });
  });

  it("uses first decisionId value from array query param", async () => {
    mocks.listWorkflowRuns.mockResolvedValueOnce([]);

    const req = createMockRequest({
      method: "GET",
      query: {
        decisionId: ["d-2", "ignored"],
      },
    });
    const mock = createMockResponse();

    await handler(req, mock.res);

    expect(mocks.listWorkflowRuns).toHaveBeenCalledWith("d-2", 20);
    expect(mock.statusCode).toBe(200);
  });

  it("clamps limit to 100", async () => {
    mocks.listWorkflowRuns.mockResolvedValueOnce([]);

    const req = createMockRequest({
      method: "GET",
      query: {
        decisionId: "d-3",
        limit: "999",
      },
    });
    const mock = createMockResponse();

    await handler(req, mock.res);

    expect(mocks.listWorkflowRuns).toHaveBeenCalledWith("d-3", 100);
    expect(mock.statusCode).toBe(200);
  });

  it("accepts numeric string query limits", async () => {
    mocks.listWorkflowRuns.mockResolvedValueOnce([]);

    const req = createMockRequest({
      method: "GET",
      query: {
        decisionId: "d-9",
        limit: "3",
      },
    });
    const mock = createMockResponse();

    await handler(req, mock.res);

    expect(mocks.listWorkflowRuns).toHaveBeenCalledWith("d-9", 3);
    expect(mock.statusCode).toBe(200);
  });

  it("falls back to default limit when query limit is invalid", async () => {
    mocks.listWorkflowRuns.mockResolvedValueOnce([]);

    const req = createMockRequest({
      method: "GET",
      query: {
        decisionId: "d-4",
        limit: "invalid",
      },
    });
    const mock = createMockResponse();

    await handler(req, mock.res);

    expect(mocks.listWorkflowRuns).toHaveBeenCalledWith("d-4", 20);
    expect(mock.statusCode).toBe(200);
  });

  it("uses preview fallbacks when decision name and status are missing", async () => {
    mocks.listWorkflowRuns.mockResolvedValueOnce([
      {
        id: 11,
        decisionId: "decision-11",
        dqs: 6.4,
        gateDecision: "challenged",
        workflowStatus: "PERSISTED",
        decisionName: "  ",
        stateStatus: 1 as unknown as string,
        summaryLine: null,
        missingSections: ["  ", "Baseline", ""],
        reviewStances: [],
        riskFindingsCount: 0,
        mitigationCount: 0,
        pendingMitigationsCount: 0,
        frictionScore: 0,
        createdAt: "2026-02-20T00:00:00.000Z",
      },
    ]);

    const req = createMockRequest({
      method: "GET",
      query: { decisionId: "decision-11" },
    });
    const mock = createMockResponse();

    await handler(req, mock.res);

    const firstRun = (mock.body as any).runs[0];
    expect(firstRun.state_preview).toMatchObject({
      decision_name: "Decision decision-11",
      status: "PERSISTED",
      missing_sections: ["Baseline"],
    });
  });

  it("returns generic 500 errors without internal details", async () => {
    mocks.listWorkflowRuns.mockRejectedValueOnce(new Error("database exploded"));

    const req = createMockRequest({
      method: "GET",
      query: {
        decisionId: "d-1",
      },
    });
    const mock = createMockResponse();

    await handler(req, mock.res);

    expect(mock.statusCode).toBe(500);
    expect(mock.body).toEqual({ error: "Failed to load workflow runs" });
  });
});
