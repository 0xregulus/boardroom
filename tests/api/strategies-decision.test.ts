import { afterEach, describe, expect, it, vi } from "vitest";

import { createMockRequest, createMockResponse } from "../helpers/next_api";

const mocks = vi.hoisted(() => ({
  listPostgresEntries: vi.fn(),
  getDecisionForWorkflow: vi.fn(),
}));

vi.mock("../../src/store/postgres", () => ({
  listStrategicDecisionLogEntries: mocks.listPostgresEntries,
  getDecisionForWorkflow: mocks.getDecisionForWorkflow,
}));

import handler from "../../pages/api/strategies/[decisionId]";

afterEach(() => {
  vi.clearAllMocks();
});

function workflowDecision() {
  return {
    id: "d-1",
    name: "Decision D1",
    createdAt: "2026-02-16T00:00:00.000Z",
    bodyText: "Executive Summary\nFallback summary\n1. Strategic Context\nContext section",
    properties: {
      "Decision Name": "Decision D1",
      Status: "Proposed",
      Owner: "Owner 1",
      "Review Date": "2026-02-16",
      "Executive Summary": "Fallback summary",
      "Primary KPI": "KPI",
      "Strategic Objective": "Growth",
      "Investment Required": "120000",
      "Confidence Level": "High",
      Baseline: 1,
      Target: 2,
      "Time Horizon": "Q2",
    },
    governanceChecks: {},
  };
}

describe("API /api/strategies/[decisionId]", () => {
  it("returns 405 on unsupported methods", async () => {
    const req = createMockRequest({ method: "POST", query: { decisionId: "d-1" } });
    const mock = createMockResponse();

    await handler(req, mock.res);

    expect(mock.statusCode).toBe(405);
    expect(mock.headers.Allow).toBe("GET");
  });

  it("returns 400 when decision id is missing", async () => {
    const req = createMockRequest({ method: "GET", query: {} });
    const mock = createMockResponse();

    await handler(req, mock.res);

    expect(mock.statusCode).toBe(400);
    expect(mock.body).toEqual({ error: "decisionId is required" });
  });

  it("returns postgres strategy when an entry exists", async () => {
    mocks.listPostgresEntries.mockResolvedValueOnce([
      {
        id: "d-1",
        name: "Postgres Strategy",
        status: "Proposed",
        owner: "Bob",
        reviewDate: "Feb 16, 2026",
        summary: "Summary",
        primaryKpi: "KPI",
        investment: "$100",
        strategicObjective: "Growth",
        confidence: "High",
      },
    ]);
    mocks.getDecisionForWorkflow.mockResolvedValueOnce(workflowDecision());

    const req = createMockRequest({ method: "GET", query: { decisionId: "d-1" } });
    const mock = createMockResponse();

    await handler(req, mock.res);

    expect(mock.statusCode).toBe(200);
    expect(mock.body).toMatchObject({
      source: "postgres",
      strategy: {
        id: "d-1",
        name: "Postgres Strategy",
      },
    });
  });

  it("falls back to workflow decision when list entry is missing", async () => {
    mocks.listPostgresEntries.mockResolvedValueOnce([]);
    mocks.getDecisionForWorkflow.mockResolvedValueOnce(workflowDecision());

    const req = createMockRequest({ method: "GET", query: { decisionId: "d-1" } });
    const mock = createMockResponse();

    await handler(req, mock.res);

    expect(mock.statusCode).toBe(200);
    expect(mock.body).toMatchObject({
      source: "postgres",
      strategy: {
        id: "d-1",
        name: "Decision D1",
      },
    });
  });

  it("returns 404 when strategy does not exist", async () => {
    mocks.listPostgresEntries.mockResolvedValueOnce([]);
    mocks.getDecisionForWorkflow.mockResolvedValueOnce(null);

    const req = createMockRequest({ method: "GET", query: { decisionId: "missing" } });
    const mock = createMockResponse();

    await handler(req, mock.res);

    expect(mock.statusCode).toBe(404);
    expect(mock.body).toMatchObject({ error: "Strategic decision not found" });
  });

  it("returns 500 when postgres lookup fails", async () => {
    mocks.listPostgresEntries.mockRejectedValueOnce(new Error("db unavailable"));
    mocks.getDecisionForWorkflow.mockRejectedValueOnce(new Error("db unavailable"));

    const req = createMockRequest({ method: "GET", query: { decisionId: "d-1" } });
    const mock = createMockResponse();

    await handler(req, mock.res);

    expect(mock.statusCode).toBe(500);
    expect(mock.body).toMatchObject({
      error: "Failed to fetch strategic decision",
    });
  });
});
