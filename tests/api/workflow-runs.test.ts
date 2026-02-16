import { afterEach, describe, expect, it, vi } from "vitest";

import { createMockRequest, createMockResponse } from "../helpers/next_api";

const mocks = vi.hoisted(() => ({
  listWorkflowRuns: vi.fn(),
}));

vi.mock("../../src/store/postgres", () => ({
  listWorkflowRuns: mocks.listWorkflowRuns,
}));

import handler from "../../pages/api/workflow/runs";

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
        missingSections: ["Baseline"],
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
