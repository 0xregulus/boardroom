import { describe, expect, it, vi } from "vitest";

import { createMockRequest, createMockResponse } from "../helpers/next_api";

const mocks = vi.hoisted(() => ({
  getPersistedAgentConfigs: vi.fn(),
  upsertAgentConfigs: vi.fn(),
  normalizeAgentConfigs: vi.fn(),
  buildDefaultAgentConfigs: vi.fn(),
}));

vi.mock("../../src/store/postgres", () => ({
  getPersistedAgentConfigs: mocks.getPersistedAgentConfigs,
  upsertAgentConfigs: mocks.upsertAgentConfigs,
}));

vi.mock("../../src/config/agent_config", () => ({
  normalizeAgentConfigs: mocks.normalizeAgentConfigs,
  buildDefaultAgentConfigs: mocks.buildDefaultAgentConfigs,
}));

import handler from "../../pages/api/agent-configs";

const defaultConfigs = [{ id: "ceo" }];

const normalizedConfigs = [{ id: "ceo" }, { id: "cfo" }];

describe("API /api/agent-configs", () => {
  it("returns persisted configs on GET", async () => {
    mocks.getPersistedAgentConfigs.mockResolvedValueOnce(normalizedConfigs);

    const req = createMockRequest({ method: "GET" });
    const mock = createMockResponse();

    await handler(req, mock.res);

    expect(mock.statusCode).toBe(200);
    expect(mock.body).toEqual({ agentConfigs: normalizedConfigs, persisted: true });
  });

  it("returns default configs when no persisted configs exist", async () => {
    mocks.getPersistedAgentConfigs.mockResolvedValueOnce(null);
    mocks.buildDefaultAgentConfigs.mockReturnValueOnce(defaultConfigs);

    const req = createMockRequest({ method: "GET" });
    const mock = createMockResponse();

    await handler(req, mock.res);

    expect(mock.statusCode).toBe(200);
    expect(mock.body).toEqual({ agentConfigs: defaultConfigs, persisted: false });
  });

  it("normalizes and persists configs on PUT", async () => {
    mocks.normalizeAgentConfigs.mockReturnValueOnce(normalizedConfigs);
    mocks.upsertAgentConfigs.mockResolvedValueOnce(normalizedConfigs);

    const req = createMockRequest({
      method: "PUT",
      body: {
        agentConfigs: [{ id: "ceo" }],
      },
    });
    const mock = createMockResponse();

    await handler(req, mock.res);

    expect(mocks.normalizeAgentConfigs).toHaveBeenCalledWith([{ id: "ceo" }]);
    expect(mocks.upsertAgentConfigs).toHaveBeenCalledWith(normalizedConfigs);
    expect(mock.statusCode).toBe(200);
    expect(mock.body).toEqual({ agentConfigs: normalizedConfigs, persisted: true });
  });

  it("returns 405 on unsupported methods", async () => {
    const req = createMockRequest({ method: "POST" });
    const mock = createMockResponse();

    await handler(req, mock.res);

    expect(mock.statusCode).toBe(405);
    expect(mock.headers.Allow).toBe("GET, PUT");
  });
});
