import { afterEach, describe, expect, it } from "vitest";

import { formatSecurityAuditReport, runSecurityAudit } from "../../src/security/audit";

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe("runSecurityAudit", () => {
  it("reports critical findings when core security env vars are missing", () => {
    process.env = {
      ...ORIGINAL_ENV,
      BOARDROOM_ADMIN_KEY: "",
      OPENAI_API_KEY: "",
      ANTHROPIC_API_KEY: "",
      MISTRAL_API_KEY: "",
      META_API_KEY: "",
      POSTGRES_URL: "",
      BOARDROOM_RATE_LIMIT_BACKEND: "memory",
    };

    const report = runSecurityAudit(process.env);

    expect(report.summary.status).toBe("fail");
    expect(report.findings.some((finding) => finding.id === "S001")).toBe(true);
    expect(report.findings.some((finding) => finding.id === "S007")).toBe(true);
  });

  it("passes when key controls are configured", () => {
    process.env = {
      ...ORIGINAL_ENV,
      BOARDROOM_ADMIN_KEY: "secure-boardroom-admin-key-123456",
      BOARDROOM_RATE_LIMIT_BACKEND: "postgres",
      POSTGRES_URL: "postgresql://localhost:5432/boardroom",
      BOARDROOM_PROVIDER: "OpenAI",
      BOARDROOM_RUN_APPROVAL_KEY: "run-approval-key-1234567890",
      OPENAI_API_KEY: "openai-key",
      TAVILY_API_KEY: "tavily-key",
      TAVILY_ALLOWED_HOSTS: "sec.gov,investor.apple.com",
    };

    const report = runSecurityAudit(process.env);

    expect(report.summary.status).toBe("pass");
    expect(report.summary.errors).toBe(0);
    expect(report.summary.warnings).toBe(0);
  });

  it("formats report output for cli usage", () => {
    const report = runSecurityAudit({
      ...ORIGINAL_ENV,
      BOARDROOM_ADMIN_KEY: "",
      OPENAI_API_KEY: "",
      ANTHROPIC_API_KEY: "",
      MISTRAL_API_KEY: "",
      META_API_KEY: "",
    });

    const text = formatSecurityAuditReport(report);
    expect(text).toContain("Security audit");
    expect(text).toContain("S001");
  });
});
