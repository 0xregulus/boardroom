import type { NextApiRequest, NextApiResponse } from "next";

export interface MockResponse<T = unknown> {
  res: NextApiResponse<T>;
  statusCode: number;
  headers: Record<string, string>;
  body: T | undefined;
}

export function createMockRequest(
  overrides: Partial<NextApiRequest> & {
    method?: string;
    body?: unknown;
    query?: Record<string, unknown>;
  } = {},
): NextApiRequest {
  return {
    method: overrides.method ?? "GET",
    body: overrides.body,
    query: overrides.query ?? {},
    ...overrides,
  } as unknown as NextApiRequest;
}

export function createMockResponse<T = unknown>(): MockResponse<T> {
  const state: {
    statusCode: number;
    headers: Record<string, string>;
    body: T | undefined;
  } = {
    statusCode: 200,
    headers: {},
    body: undefined,
  };

  const res = {
    status(code: number) {
      state.statusCode = code;
      return this;
    },
    setHeader(name: string, value: string) {
      state.headers[name] = value;
      return this;
    },
    json(payload: T) {
      state.body = payload;
      return this;
    },
  } as unknown as NextApiResponse<T>;

  return {
    res,
    get statusCode() {
      return state.statusCode;
    },
    get headers() {
      return state.headers;
    },
    get body() {
      return state.body;
    },
  };
}
