import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createMockRequest, createMockResponse } from "../helpers/next_api";

const mocks = vi.hoisted(() => ({
  listPostgresEntries: vi.fn(),
  upsertDecisionRecord: vi.fn(),
  upsertDecisionDocument: vi.fn(),
}));

const guardMocks = vi.hoisted(() => ({
  enforceRateLimit: vi.fn(),
  enforceSensitiveRouteAccess: vi.fn(),
}));

vi.mock("../../src/store/postgres", () => ({
  listStrategicDecisionLogEntries: mocks.listPostgresEntries,
  upsertDecisionRecord: mocks.upsertDecisionRecord,
  upsertDecisionDocument: mocks.upsertDecisionDocument,
}));

vi.mock("../../src/security/request_guards", () => ({
  enforceRateLimit: guardMocks.enforceRateLimit,
  enforceSensitiveRouteAccess: guardMocks.enforceSensitiveRouteAccess,
}));

import handler from "../../pages/api/strategies/index";

beforeEach(() => {
  mocks.listPostgresEntries.mockReset();
  mocks.upsertDecisionRecord.mockReset();
  mocks.upsertDecisionDocument.mockReset();
  guardMocks.enforceRateLimit.mockReset().mockResolvedValue(true);
  guardMocks.enforceSensitiveRouteAccess.mockReset().mockReturnValue(true);
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("API /api/strategies", () => {
  it("returns 405 on unsupported methods", async () => {
    const req = createMockRequest({ method: "DELETE" });
    const mock = createMockResponse();

    await handler(req, mock.res);

    expect(mock.statusCode).toBe(405);
    expect(mock.headers.Allow).toBe("GET, POST");
  });

  it("returns early when rate limiting blocks access", async () => {
    guardMocks.enforceRateLimit.mockResolvedValueOnce(false);

    const req = createMockRequest({ method: "GET" });
    const mock = createMockResponse();

    await handler(req, mock.res);

    expect(mocks.listPostgresEntries).not.toHaveBeenCalled();
    expect(guardMocks.enforceSensitiveRouteAccess).not.toHaveBeenCalled();
  });

  it("returns early when sensitive route access is denied", async () => {
    guardMocks.enforceSensitiveRouteAccess.mockReturnValueOnce(false);

    const req = createMockRequest({ method: "GET" });
    const mock = createMockResponse();

    await handler(req, mock.res);

    expect(mocks.listPostgresEntries).not.toHaveBeenCalled();
  });

  it("returns postgres strategies on success", async () => {
    mocks.listPostgresEntries.mockResolvedValue([{ id: "p1" }]);

    const req = createMockRequest({ method: "GET" });
    const mock = createMockResponse();

    await handler(req, mock.res);

    expect(mock.statusCode).toBe(200);
    expect(mock.body).toEqual({ strategies: [{ id: "p1" }], source: "postgres" });
  });

  it("returns 500 when postgres lookup fails", async () => {
    mocks.listPostgresEntries.mockRejectedValueOnce(new Error("postgres down"));

    const req = createMockRequest({ method: "GET" });
    const mock = createMockResponse();

    await handler(req, mock.res);

    expect(mock.statusCode).toBe(500);
    expect(mock.body).toMatchObject({
      error: "Failed to fetch strategic decisions from Strategic Decision Log",
    });
  });

  it("returns 400 for invalid POST payloads", async () => {
    const req = createMockRequest({
      method: "POST",
      body: {
        strategy: {
          id: "x1",
        },
      },
    });
    const mock = createMockResponse();

    await handler(req, mock.res);

    expect(mock.statusCode).toBe(400);
    expect(mock.body).toEqual({ error: "Invalid strategy payload." });
  });

  it("persists strategy via POST and returns saved entry", async () => {
    mocks.upsertDecisionRecord.mockResolvedValue(undefined);
    mocks.upsertDecisionDocument.mockResolvedValue(undefined);
    mocks.listPostgresEntries.mockResolvedValue([{ id: "s1", name: "Market Entry", status: "Proposed" }]);

    const req = createMockRequest({
      method: "POST",
      body: {
        strategy: {
          id: "s1",
          name: "Market Entry",
          status: "Proposed",
          owner: "Alice",
          reviewDate: "2026-02-21",
          summary: "Summary",
          primaryKpi: "ARR",
          investment: "$100,000",
          strategicObjective: "Expand in LATAM",
          confidence: "75%",
          artifactSections: {
            strategicContext: "- Objective: grow",
            coreProperties: JSON.stringify({
              baseline: "10",
              target: "20",
              decisionType: "Reversible",
            }),
            capitalAllocationModel: JSON.stringify({
              investmentRequired: 100000,
              grossBenefit12m: 250000,
              probabilityOfSuccess: "75%",
              strategicLeverageScore: "4",
            }),
            mitigations: JSON.stringify([
              {
                id: "risk-riskMatrix-cost-volatility",
                sectionKey: "riskMatrix",
                riskTitle: "Cost Volatility",
                description: "Cloud costs may spike.",
                mitigationText: "Set automated cost caps.",
                resolvedAt: "2026-02-21T00:00:00.000Z",
              },
            ]),
          },
        },
      },
    });
    const mock = createMockResponse();

    await handler(req, mock.res);

    expect(mocks.upsertDecisionRecord).toHaveBeenCalledTimes(1);
    expect(mocks.upsertDecisionDocument).toHaveBeenCalledTimes(1);
    expect(mocks.upsertDecisionDocument).toHaveBeenCalledWith(
      "s1",
      expect.stringContaining("1. Strategic Context\n- Objective: grow"),
    );
    expect(mock.statusCode).toBe(200);
    expect(mock.body).toMatchObject({
      source: "postgres",
      strategy: {
        id: "s1",
        name: "Market Entry",
      },
    });
  });

  it("returns 500 when strategy persistence fails", async () => {
    mocks.upsertDecisionRecord.mockRejectedValueOnce(new Error("write failed"));

    const req = createMockRequest({
      method: "POST",
      body: {
        strategy: {
          id: "s1",
          name: "Market Entry",
          artifactSections: {},
        },
      },
    });
    const mock = createMockResponse();

    await handler(req, mock.res);

    expect(mock.statusCode).toBe(500);
    expect(mock.body).toEqual({
      error: "Failed to save strategic decision",
    });
  });
});
