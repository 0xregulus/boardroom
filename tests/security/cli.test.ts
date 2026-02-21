import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  runSecurityAudit: vi.fn(),
  runSecurityDoctor: vi.fn(),
  formatSecurityAuditReport: vi.fn(),
}));

vi.mock("../../src/security/audit", () => ({
  runSecurityAudit: mocks.runSecurityAudit,
  formatSecurityAuditReport: mocks.formatSecurityAuditReport,
}));

vi.mock("../../src/security/doctor", () => ({
  runSecurityDoctor: mocks.runSecurityDoctor,
}));

const ORIGINAL_ARGV = [...process.argv];

async function runCliImport() {
  await import("../../src/security/cli");
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe("security/cli", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    process.argv = [...ORIGINAL_ARGV];
    process.exitCode = undefined;
    mocks.formatSecurityAuditReport.mockReturnValue("report");
  });

  afterEach(() => {
    process.argv = [...ORIGINAL_ARGV];
    process.exitCode = undefined;
  });

  it("runs audit command by default and sets failing exit code on errors", async () => {
    mocks.runSecurityAudit.mockReturnValue({ summary: { errors: 2 } });
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    await runCliImport();

    expect(mocks.runSecurityAudit).toHaveBeenCalledTimes(1);
    expect(mocks.runSecurityDoctor).not.toHaveBeenCalled();
    expect(logSpy).toHaveBeenCalledWith("report");
    expect(process.exitCode).toBe(1);
    logSpy.mockRestore();
  });

  it("runs doctor command and returns success exit code when no errors are found", async () => {
    process.argv = ["node", "cli", "doctor"];
    mocks.runSecurityDoctor.mockResolvedValue({ summary: { errors: 0 } });
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    await runCliImport();

    expect(mocks.runSecurityDoctor).toHaveBeenCalledTimes(1);
    expect(mocks.runSecurityAudit).not.toHaveBeenCalled();
    expect(logSpy).toHaveBeenCalledWith("report");
    expect(process.exitCode).toBe(0);
    logSpy.mockRestore();
  });

  it("handles command failures by logging and setting exit code 1", async () => {
    const failure = new Error("doctor unavailable");
    process.argv = ["node", "cli", "doctor"];
    mocks.runSecurityDoctor.mockRejectedValue(failure);
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    await runCliImport();

    expect(errorSpy).toHaveBeenCalledWith(failure);
    expect(process.exitCode).toBe(1);
    errorSpy.mockRestore();
  });
});
