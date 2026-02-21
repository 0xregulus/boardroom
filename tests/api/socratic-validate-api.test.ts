import { beforeEach, describe, expect, it, vi } from "vitest";

import { createMockRequest, createMockResponse } from "../helpers/next_api";

const mocks = vi.hoisted(() => ({
  enforceRateLimit: vi.fn(),
  enforceSensitiveRouteAccess: vi.fn(),
  resolveProvider: vi.fn(),
  resolveModelForProvider: vi.fn(),
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

import handler from "../../pages/api/socratic/validate";

describe("API /api/socratic/validate", () => {
  beforeEach(() => {
    mocks.enforceRateLimit.mockResolvedValue(true);
    mocks.enforceSensitiveRouteAccess.mockReturnValue(true);
    mocks.resolveProvider.mockReturnValue("OpenAI");
    mocks.resolveModelForProvider.mockReturnValue("gpt-4o-mini");
    mocks.getResilientClient.mockReturnValue({
      complete: mocks.complete,
    });
    mocks.complete.mockResolvedValue(
      JSON.stringify({
        approved: true,
        feedback: "Mitigation is concrete and directly addresses the failure state.",
      }),
    );
  });

  it("returns 405 for unsupported methods", async () => {
    const req = createMockRequest({ method: "GET" });
    const mock = createMockResponse();

    await handler(req, mock.res);

    expect(mock.statusCode).toBe(405);
    expect(mock.headers.Allow).toBe("POST");
  });

  it("returns early when rate limit fails", async () => {
    mocks.enforceRateLimit.mockResolvedValueOnce(false);
    const req = createMockRequest({ method: "POST", body: {} });
    const mock = createMockResponse();

    await handler(req, mock.res);

    expect(mocks.enforceRateLimit).toHaveBeenCalledTimes(1);
    expect(mocks.enforceSensitiveRouteAccess).not.toHaveBeenCalled();
  });

  it("returns early when sensitive access fails", async () => {
    mocks.enforceSensitiveRouteAccess.mockReturnValueOnce(false);
    const req = createMockRequest({ method: "POST", body: {} });
    const mock = createMockResponse();

    await handler(req, mock.res);

    expect(mocks.enforceSensitiveRouteAccess).toHaveBeenCalledTimes(1);
    expect(mocks.complete).not.toHaveBeenCalled();
  });

  it("returns 400 for invalid payload", async () => {
    const req = createMockRequest({
      method: "POST",
      body: {
        riskTitle: "Too short",
      },
    });
    const mock = createMockResponse();

    await handler(req, mock.res);

    expect(mock.statusCode).toBe(400);
    expect(mock.body).toEqual({ error: "Invalid mitigation validation payload." });
  });

  it("returns approval payload when model response is valid", async () => {
    const req = createMockRequest({
      method: "POST",
      body: {
        riskTitle: "Cloud cost spike",
        riskDescription: "Core ROI is invalidated if infra costs triple.",
        mitigationText: "Implement hard spend caps, owner in FinOps, and weekly budget alerts with rollback to lower-cost tier.",
        riskLevel: "Critical",
      },
    });
    const mock = createMockResponse();

    await handler(req, mock.res);

    expect(mock.statusCode).toBe(200);
    expect(mock.body).toEqual({
      approved: true,
      feedback: "Mitigation is concrete and directly addresses the failure state.",
    });
    expect(mocks.complete).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "gpt-4o-mini",
        requireJsonObject: true,
      }),
    );
  });

  it("returns approved:false fallback when model JSON is invalid", async () => {
    mocks.complete.mockResolvedValueOnce('{"ok":true}');

    const req = createMockRequest({
      method: "POST",
      body: {
        riskTitle: "Regulatory exposure",
        riskDescription: "Regulator can block launch if controls are missing.",
        mitigationText: "Define compliance owner and legal sign-off gates before launch.",
      },
    });
    const mock = createMockResponse();

    await handler(req, mock.res);

    expect(mock.statusCode).toBe(200);
    expect(mock.body).toMatchObject({
      approved: false,
    });
  });

  it("returns 500 when validation provider errors", async () => {
    mocks.complete.mockRejectedValueOnce(new Error("provider unavailable"));
    const req = createMockRequest({
      method: "POST",
      body: {
        riskTitle: "Delivery risk",
        riskDescription: "Timeline slippage invalidates competitive window.",
        mitigationText: "Allocate dedicated team, milestone gates, and fallback launch scope.",
      },
    });
    const mock = createMockResponse();

    await handler(req, mock.res);

    expect(mock.statusCode).toBe(500);
    expect(mock.body).toEqual({ error: "Validation Error" });
  });
});

