import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { NextApiRequest, NextApiResponse } from "next";

const storeMocks = vi.hoisted(() => ({
  checkRateLimitBucket: vi.fn(),
}));

vi.mock("../../src/store/postgres", () => ({
  checkRateLimitBucket: storeMocks.checkRateLimitBucket,
}));

import { enforceRateLimit, enforceSensitiveRouteAccess } from "../../src/security/request_guards";

const ORIGINAL_ENV = { ...process.env };

function makeRequest(overrides?: Partial<NextApiRequest>): NextApiRequest {
  return {
    headers: {},
    socket: { remoteAddress: "198.51.100.10" },
    ...overrides,
  } as unknown as NextApiRequest;
}

function makeResponse(): {
  res: NextApiResponse;
  statusCode: () => number | null;
  body: () => unknown;
  headers: Record<string, string>;
} {
  const headers: Record<string, string> = {};
  let code: number | null = null;
  let payload: unknown = null;

  const res = {
    setHeader: vi.fn((name: string, value: string | number) => {
      headers[name] = String(value);
    }),
    status: vi.fn((statusCode: number) => {
      code = statusCode;
      return res;
    }),
    json: vi.fn((value: unknown) => {
      payload = value;
      return res;
    }),
  } as unknown as NextApiResponse;

  return {
    res,
    statusCode: () => code,
    body: () => payload,
    headers,
  };
}

beforeEach(() => {
  process.env = {
    ...ORIGINAL_ENV,
    NODE_ENV: "development",
    BOARDROOM_RATE_LIMIT_BACKEND: "memory",
    BOARDROOM_TRUST_PROXY: "false",
  };
  storeMocks.checkRateLimitBucket.mockReset();
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe("enforceRateLimit", () => {
  it("enforces in-memory limits and returns 429 after threshold", async () => {
    const req = makeRequest();
    const first = makeResponse();
    const second = makeResponse();

    const firstAllowed = await enforceRateLimit(req, first.res, {
      routeKey: "api/test",
      limit: 1,
      windowMs: 60_000,
    });
    const secondAllowed = await enforceRateLimit(req, second.res, {
      routeKey: "api/test",
      limit: 1,
      windowMs: 60_000,
    });

    expect(firstAllowed).toBe(true);
    expect(secondAllowed).toBe(false);
    expect(second.statusCode()).toBe(429);
    expect(second.body()).toEqual({ error: "Too many requests" });
    expect(second.headers["Retry-After"]).toBeDefined();
  });

  it("uses postgres-backed limiter when configured", async () => {
    process.env.BOARDROOM_RATE_LIMIT_BACKEND = "postgres";
    storeMocks.checkRateLimitBucket.mockResolvedValueOnce({
      allowed: false,
      count: 21,
      limit: 20,
      remaining: 0,
      resetAt: Date.now() + 60_000,
      retryAfterSeconds: 60,
    });

    const req = makeRequest();
    const out = makeResponse();

    const allowed = await enforceRateLimit(req, out.res, {
      routeKey: "api/workflow/run",
      limit: 20,
      windowMs: 60_000,
    });

    expect(allowed).toBe(false);
    expect(storeMocks.checkRateLimitBucket).toHaveBeenCalledTimes(1);
    expect(out.statusCode()).toBe(429);
    expect(out.headers["X-RateLimit-Limit"]).toBe("20");
  });

  it("falls back to memory buckets when postgres limiter throws", async () => {
    process.env.BOARDROOM_RATE_LIMIT_BACKEND = "postgres";
    storeMocks.checkRateLimitBucket.mockRejectedValue(new Error("db unavailable"));

    const req = makeRequest();
    const first = makeResponse();
    const second = makeResponse();

    const firstAllowed = await enforceRateLimit(req, first.res, {
      routeKey: "api/fallback-test",
      limit: 1,
      windowMs: 60_000,
    });
    const secondAllowed = await enforceRateLimit(req, second.res, {
      routeKey: "api/fallback-test",
      limit: 1,
      windowMs: 60_000,
    });

    expect(firstAllowed).toBe(true);
    expect(secondAllowed).toBe(false);
    expect(storeMocks.checkRateLimitBucket).toHaveBeenCalledTimes(2);
    expect(second.statusCode()).toBe(429);
  });
});

describe("enforceSensitiveRouteAccess", () => {
  it("rejects remote callers with missing/invalid admin key", () => {
    process.env.BOARDROOM_ADMIN_KEY = "a-strong-admin-key-123456";
    const req = makeRequest();
    const out = makeResponse();

    const allowed = enforceSensitiveRouteAccess(req, out.res);

    expect(allowed).toBe(false);
    expect(out.statusCode()).toBe(401);
  });

  it("allows remote callers with valid admin key", () => {
    process.env.BOARDROOM_ADMIN_KEY = "a-strong-admin-key-123456";
    const req = makeRequest({
      headers: {
        "x-boardroom-admin-key": "a-strong-admin-key-123456",
      },
    });
    const out = makeResponse();

    const allowed = enforceSensitiveRouteAccess(req, out.res);

    expect(allowed).toBe(true);
  });
});
