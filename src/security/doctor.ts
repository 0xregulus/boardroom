import { checkDatabaseHealth } from "../store/postgres";
import { buildSecurityAuditReport, runSecurityAudit, SecurityAuditReport, SecurityFinding } from "./audit";

function isPostgresExpected(env: NodeJS.ProcessEnv): boolean {
  const backend = (env.BOARDROOM_RATE_LIMIT_BACKEND ?? "").trim().toLowerCase();
  if (backend === "postgres") {
    return true;
  }

  if (backend === "memory") {
    return false;
  }

  return (env.POSTGRES_URL ?? "").trim().length > 0;
}

export async function runSecurityDoctor(env: NodeJS.ProcessEnv = process.env): Promise<SecurityAuditReport> {
  const baseReport = runSecurityAudit(env);
  const findings: SecurityFinding[] = [...baseReport.findings];

  if (isPostgresExpected(env)) {
    try {
      await checkDatabaseHealth();
      findings.push({
        id: "D001",
        severity: "info",
        title: "PostgreSQL health check passed",
        detail: "Database connectivity was verified successfully.",
      });
    } catch (error) {
      const message =
        error instanceof Error && error.message.trim().length > 0 ? error.message : "Unknown database error";
      findings.push({
        id: "D002",
        severity: "error",
        title: "PostgreSQL health check failed",
        detail: `Database connectivity test failed: ${message}`,
        remediation: "Verify POSTGRES_URL, network routing, and database availability.",
      });
    }
  }

  return buildSecurityAuditReport(findings);
}
