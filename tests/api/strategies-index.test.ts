import { afterEach, describe, expect, it, vi } from "vitest";

import { createMockRequest, createMockResponse } from "../helpers/next_api";

const mocks = vi.hoisted(() => ({
  listPostgresEntries: vi.fn(),
}));

vi.mock("../../src/store/postgres", () => ({
  listStrategicDecisionLogEntries: mocks.listPostgresEntries,
}));

import handler from "../../pages/api/strategies/index";

afterEach(() => {
  vi.clearAllMocks();
});

describe("API /api/strategies", () => {
  it("returns 405 on unsupported methods", async () => {
    const req = createMockRequest({ method: "POST" });
    const mock = createMockResponse();

    await handler(req, mock.res);

    expect(mock.statusCode).toBe(405);
    expect(mock.headers.Allow).toBe("GET");
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
});
