import { afterEach, describe, expect, it, vi } from "vitest";

const storeMocks = vi.hoisted(() => ({
  checkDatabaseHealth: vi.fn(),
}));

vi.mock("../../src/store/postgres", () => ({
  checkDatabaseHealth: storeMocks.checkDatabaseHealth,
}));

import { runSecurityDoctor } from "../../src/security/doctor";

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  storeMocks.checkDatabaseHealth.mockReset();
});

describe("runSecurityDoctor", () => {
  it("adds DB success finding when health check passes", async () => {
    process.env = {
      ...ORIGINAL_ENV,
      BOARDROOM_ADMIN_KEY: "secure-boardroom-admin-key-123456",
      BOARDROOM_RATE_LIMIT_BACKEND: "postgres",
      POSTGRES_URL: "postgresql://localhost:5432/boardroom",
      OPENAI_API_KEY: "openai-key",
    };
    storeMocks.checkDatabaseHealth.mockResolvedValueOnce(undefined);

    const report = await runSecurityDoctor(process.env);

    expect(report.findings.some((finding) => finding.id === "D001")).toBe(true);
    expect(storeMocks.checkDatabaseHealth).toHaveBeenCalledTimes(1);
  });

  it("adds DB error finding when health check fails", async () => {
    process.env = {
      ...ORIGINAL_ENV,
      BOARDROOM_ADMIN_KEY: "secure-boardroom-admin-key-123456",
      BOARDROOM_RATE_LIMIT_BACKEND: "postgres",
      POSTGRES_URL: "postgresql://localhost:5432/boardroom",
      OPENAI_API_KEY: "openai-key",
    };
    storeMocks.checkDatabaseHealth.mockRejectedValueOnce(new Error("connect ECONNREFUSED"));

    const report = await runSecurityDoctor(process.env);

    expect(report.summary.status).toBe("fail");
    expect(report.findings.some((finding) => finding.id === "D002")).toBe(true);
  });
});
