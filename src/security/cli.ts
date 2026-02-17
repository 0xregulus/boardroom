import "dotenv/config";

import { formatSecurityAuditReport, runSecurityAudit } from "./audit";
import { runSecurityDoctor } from "./doctor";

type SecurityCommand = "audit" | "doctor";

function resolveCommand(raw: string | undefined): SecurityCommand {
  const normalized = (raw ?? "audit").trim().toLowerCase();
  return normalized === "doctor" ? "doctor" : "audit";
}

async function main(): Promise<void> {
  const command = resolveCommand(process.argv[2]);

  if (command === "doctor") {
    const report = await runSecurityDoctor();
    console.log(formatSecurityAuditReport(report));
    process.exitCode = report.summary.errors > 0 ? 1 : 0;
    return;
  }

  const report = runSecurityAudit();
  console.log(formatSecurityAuditReport(report));
  process.exitCode = report.summary.errors > 0 ? 1 : 0;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
