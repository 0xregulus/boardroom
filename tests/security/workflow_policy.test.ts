import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { NextApiRequest, NextApiResponse } from "next";

import { enforceWorkflowRunPolicy } from "../../src/security/workflow_policy";

const ORIGINAL_ENV = { ...process.env };

function makeRequest(overrides?: Partial<NextApiRequest>): NextApiRequest {
  return {
    headers: {},
    socket: { remoteAddress: "198.51.100.44" },
    ...overrides,
  } as unknown as NextApiRequest;
}

function makeResponse(): {
  res: NextApiResponse;
  statusCode: () => number | null;
  body: () => unknown;
} {
  let code: number | null = null;
  let payload: unknown = null;

  const res = {
    setHeader: vi.fn(),
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
  };
}

beforeEach(() => {
  process.env = {
    ...ORIGINAL_ENV,
    NODE_ENV: "development",
    BOARDROOM_REQUIRE_BULK_RUN_APPROVAL: "true",
    BOARDROOM_REQUIRE_EXTERNAL_RESEARCH_APPROVAL: "true",
    BOARDROOM_REQUIRE_SENSITIVE_OUTPUT_APPROVAL: "true",
    BOARDROOM_TRUST_PROXY: "false",
  };
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe("enforceWorkflowRunPolicy", () => {
  it("allows run when approval requirements are disabled by policy flags", () => {
    process.env.BOARDROOM_REQUIRE_BULK_RUN_APPROVAL = "false";
    process.env.BOARDROOM_REQUIRE_EXTERNAL_RESEARCH_APPROVAL = "false";
    process.env.BOARDROOM_REQUIRE_SENSITIVE_OUTPUT_APPROVAL = "false";
    const req = makeRequest();
    const out = makeResponse();

    const allowed = enforceWorkflowRunPolicy(req, out.res, {
      hasDecisionId: false,
      includeExternalResearch: true,
      includeSensitive: true,
    });

    expect(allowed).toBe(true);
    expect(out.statusCode()).toBeNull();
  });

  it("bypasses policy checks in test env", () => {
    process.env = { ...process.env, NODE_ENV: "test" };
    const req = makeRequest();
    const out = makeResponse();

    const allowed = enforceWorkflowRunPolicy(req, out.res, {
      hasDecisionId: false,
      includeExternalResearch: true,
      includeSensitive: true,
    });

    expect(allowed).toBe(true);
  });

  it("returns 503 when approval is required and key is missing", () => {
    delete process.env.BOARDROOM_RUN_APPROVAL_KEY;
    const req = makeRequest();
    const out = makeResponse();

    const allowed = enforceWorkflowRunPolicy(req, out.res, {
      hasDecisionId: false,
      includeExternalResearch: false,
      includeSensitive: false,
    });

    expect(allowed).toBe(false);
    expect(out.statusCode()).toBe(503);
  });

  it("returns 403 when provided approval key is invalid", () => {
    process.env.BOARDROOM_RUN_APPROVAL_KEY = "run-approval-key-123456";
    const req = makeRequest({
      headers: {
        "x-boardroom-run-approval": "wrong-key",
      },
    });
    const out = makeResponse();

    const allowed = enforceWorkflowRunPolicy(req, out.res, {
      hasDecisionId: false,
      includeExternalResearch: false,
      includeSensitive: false,
    });

    expect(allowed).toBe(false);
    expect(out.statusCode()).toBe(403);
    expect(out.body()).toEqual({ error: "Workflow run requires explicit approval" });
  });

  it("allows remote request with valid approval key", () => {
    process.env.BOARDROOM_RUN_APPROVAL_KEY = "run-approval-key-123456";
    const req = makeRequest({
      headers: {
        "x-boardroom-run-approval": "run-approval-key-123456",
      },
    });
    const out = makeResponse();

    const allowed = enforceWorkflowRunPolicy(req, out.res, {
      hasDecisionId: false,
      includeExternalResearch: false,
      includeSensitive: false,
    });

    expect(allowed).toBe(true);
  });

  it("allows loopback request without approval header", () => {
    const req = makeRequest({
      socket: { remoteAddress: "127.0.0.1" } as NextApiRequest["socket"],
    });
    const out = makeResponse();

    const allowed = enforceWorkflowRunPolicy(req, out.res, {
      hasDecisionId: false,
      includeExternalResearch: true,
      includeSensitive: true,
    });

    expect(allowed).toBe(true);
  });

  it("trusts forwarded-for header when proxy mode is enabled", () => {
    process.env.BOARDROOM_TRUST_PROXY = "true";
    const req = makeRequest({
      headers: {
        "x-forwarded-for": " ::ffff:127.0.0.1, 203.0.113.9 ",
      },
      socket: { remoteAddress: "198.51.100.44" } as NextApiRequest["socket"],
    });
    const out = makeResponse();

    const allowed = enforceWorkflowRunPolicy(req, out.res, {
      hasDecisionId: false,
      includeExternalResearch: true,
      includeSensitive: false,
    });

    expect(allowed).toBe(true);
  });

  it("uses x-real-ip when forwarded-for is empty and trusts array headers", () => {
    process.env.BOARDROOM_TRUST_PROXY = "true";
    const req = makeRequest({
      headers: {
        "x-forwarded-for": ["   "],
        "x-real-ip": ["::1"],
      },
      socket: { remoteAddress: "198.51.100.44" } as NextApiRequest["socket"],
    });
    const out = makeResponse();

    const allowed = enforceWorkflowRunPolicy(req, out.res, {
      hasDecisionId: false,
      includeExternalResearch: true,
      includeSensitive: false,
    });

    expect(allowed).toBe(true);
  });

  it("falls back to connection remoteAddress and normalizes localhost loopback", () => {
    const req = makeRequest({
      socket: undefined,
      connection: { remoteAddress: "localhost" },
    } as unknown as Partial<NextApiRequest>);
    const out = makeResponse();

    const allowed = enforceWorkflowRunPolicy(req, out.res, {
      hasDecisionId: false,
      includeExternalResearch: true,
      includeSensitive: true,
    });

    expect(allowed).toBe(true);
  });
});
