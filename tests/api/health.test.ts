import { describe, expect, it, vi } from "vitest";

import { createMockResponse } from "../helpers/next_api";

const mocks = vi.hoisted(() => ({
  checkDatabaseHealth: vi.fn(),
}));

vi.mock("../../src/store/postgres", () => ({
  checkDatabaseHealth: mocks.checkDatabaseHealth,
}));

import handler from "../../pages/api/health";

describe("API /api/health", () => {
  it("returns 200 when database health check passes", async () => {
    mocks.checkDatabaseHealth.mockResolvedValueOnce(undefined);

    const mock = createMockResponse();
    await handler({} as any, mock.res);

    expect(mock.statusCode).toBe(200);
    expect(mock.body).toEqual({ ok: true, service: "boardroom-next", database: "postgresql" });
  });

  it("returns 503 when database health check fails", async () => {
    mocks.checkDatabaseHealth.mockRejectedValueOnce(new Error("db down"));

    const mock = createMockResponse();
    await handler({} as any, mock.res);

    expect(mock.statusCode).toBe(503);
    expect(mock.body).toMatchObject({ ok: false, service: "boardroom-next", database: "postgresql" });
  });
});
