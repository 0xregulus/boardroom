import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createMockRequest, createMockResponse } from "../helpers/next_api";

const mocks = vi.hoisted(() => ({
  getPortfolioInsightsStats: vi.fn(),
}));

const guardMocks = vi.hoisted(() => ({
  enforceRateLimit: vi.fn(),
  enforceSensitiveRouteAccess: vi.fn(),
}));

vi.mock("../../src/store/postgres", () => ({
  getPortfolioInsightsStats: mocks.getPortfolioInsightsStats,
}));

vi.mock("../../src/security/request_guards", () => ({
  enforceRateLimit: guardMocks.enforceRateLimit,
  enforceSensitiveRouteAccess: guardMocks.enforceSensitiveRouteAccess,
}));

import handler from "../../pages/api/insights/stats";

beforeEach(() => {
  mocks.getPortfolioInsightsStats.mockReset();
  guardMocks.enforceRateLimit.mockReset().mockResolvedValue(true);
  guardMocks.enforceSensitiveRouteAccess.mockReset().mockReturnValue(true);
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("API /api/insights/stats", () => {
  it("returns 405 for unsupported methods", async () => {
    const req = createMockRequest({ method: "POST" });
    const mock = createMockResponse();

    await handler(req, mock.res);

    expect(mock.statusCode).toBe(405);
    expect(mock.headers.Allow).toBe("GET");
  });

  it("returns early when rate limit denies the request", async () => {
    guardMocks.enforceRateLimit.mockResolvedValueOnce(false);
    const req = createMockRequest({ method: "GET" });
    const mock = createMockResponse();

    await handler(req, mock.res);

    expect(mocks.getPortfolioInsightsStats).not.toHaveBeenCalled();
    expect(guardMocks.enforceSensitiveRouteAccess).not.toHaveBeenCalled();
  });

  it("returns early when sensitive access is denied", async () => {
    guardMocks.enforceSensitiveRouteAccess.mockReturnValueOnce(false);
    const req = createMockRequest({ method: "GET" });
    const mock = createMockResponse();

    await handler(req, mock.res);

    expect(mocks.getPortfolioInsightsStats).not.toHaveBeenCalled();
  });

  it("returns normalized insights payload", async () => {
    mocks.getPortfolioInsightsStats.mockResolvedValueOnce({
      summary: {
        avgPortfolioDqs: 81.3,
        totalDecisionsMade: 24,
        totalRunsConsidered: 24,
        riskMitigationRate: 78.4,
      },
      radar: [
        {
          agentName: "cfo",
          avgSentiment: 6.2,
          totalVetos: 3,
          avgInfluence: 0.88,
          totalReviews: 21,
        },
      ],
      blindspots: [
        {
          gapCategory: "capital allocation",
          frequency: 12,
        },
      ],
      mitigationVelocity: {
        averageMinutes: 142.5,
        medianMinutes: 119.2,
        unresolvedCount: 4,
        trendPercent30d: 15.4,
        resolved: [
          {
            strategyId: "s-1",
            identifiedAt: "2026-02-01T00:00:00.000Z",
            resolvedAt: "2026-02-03T00:00:00.000Z",
            minutesToMitigate: 2880,
          },
        ],
      },
    });

    const req = createMockRequest({
      method: "GET",
      query: {
        windowDays: "400",
      },
    });
    const mock = createMockResponse();

    await handler(req, mock.res);

    expect(mocks.getPortfolioInsightsStats).toHaveBeenCalledWith(365);
    expect(mock.statusCode).toBe(200);
    expect(mock.headers["Cache-Control"]).toBe("no-store, max-age=0");
    expect(mock.body).toMatchObject({
      summary: {
        avg_portfolio_dqs: 81.3,
        total_decisions_made: 24,
        total_runs_considered: 24,
        risk_mitigation_rate: 78.4,
      },
      radar: [
        {
          agent_name: "cfo",
          avg_sentiment: 6.2,
          total_vetos: 3,
          avg_influence: 0.88,
          total_reviews: 21,
        },
      ],
      blindspots: [
        {
          gap_category: "capital allocation",
          frequency: 12,
        },
      ],
      mitigation_velocity: {
        average_minutes: 142.5,
        median_minutes: 119.2,
        unresolved_count: 4,
        trend_percent_30d: 15.4,
        resolved: [
          {
            strategy_id: "s-1",
            identified_at: "2026-02-01T00:00:00.000Z",
            resolved_at: "2026-02-03T00:00:00.000Z",
            minutes_to_mitigate: 2880,
          },
        ],
      },
      window_days: 365,
    });
  });

  it("returns generic 500 errors", async () => {
    mocks.getPortfolioInsightsStats.mockRejectedValueOnce(new Error("db down"));
    const req = createMockRequest({ method: "GET" });
    const mock = createMockResponse();

    await handler(req, mock.res);

    expect(mock.statusCode).toBe(500);
    expect(mock.body).toEqual({ error: "Failed to load portfolio insights" });
  });
});
