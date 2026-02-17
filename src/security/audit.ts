import {
  getProviderApiKeyEnv,
  providerOptions,
  resolveProvider,
} from "../config/llm_providers";

export type SecuritySeverity = "error" | "warning" | "info";

export interface SecurityFinding {
  id: string;
  severity: SecuritySeverity;
  title: string;
  detail: string;
  remediation?: string;
}

export interface SecurityAuditReport {
  generatedAt: string;
  findings: SecurityFinding[];
  summary: {
    status: "pass" | "warn" | "fail";
    errors: number;
    warnings: number;
    infos: number;
  };
}

function severityRank(severity: SecuritySeverity): number {
  if (severity === "error") {
    return 0;
  }

  if (severity === "warning") {
    return 1;
  }

  return 2;
}

function looksWeakSecret(secret: string): boolean {
  if (secret.length < 16) {
    return true;
  }

  const normalized = secret.trim().toLowerCase();
  return ["changeme", "password", "boardroom", "admin", "test", "secret", "123456"].includes(normalized);
}

function parseRateLimitBackend(env: NodeJS.ProcessEnv): "memory" | "postgres" | "auto" {
  const raw = (env.BOARDROOM_RATE_LIMIT_BACKEND ?? "").trim().toLowerCase();
  if (raw === "memory" || raw === "postgres") {
    return raw;
  }

  return "auto";
}

function parseBooleanEnv(env: NodeJS.ProcessEnv, key: string, fallback: boolean): boolean {
  const raw = (env[key] ?? "").trim().toLowerCase();
  if (raw === "true") {
    return true;
  }
  if (raw === "false") {
    return false;
  }
  return fallback;
}

function parsePositiveIntEnv(env: NodeJS.ProcessEnv, key: string, fallback: number): number {
  const raw = (env[key] ?? "").trim();
  if (raw.length === 0) {
    return fallback;
  }

  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.max(1, Math.min(500, Math.round(parsed)));
}

function summarizeFindings(findings: SecurityFinding[]): SecurityAuditReport["summary"] {
  const errors = findings.filter((finding) => finding.severity === "error").length;
  const warnings = findings.filter((finding) => finding.severity === "warning").length;
  const infos = findings.filter((finding) => finding.severity === "info").length;
  const status = errors > 0 ? "fail" : warnings > 0 ? "warn" : "pass";

  return { status, errors, warnings, infos };
}

export function buildSecurityAuditReport(
  findings: SecurityFinding[],
  generatedAt = new Date().toISOString(),
): SecurityAuditReport {
  const sorted = [...findings].sort((left, right) => severityRank(left.severity) - severityRank(right.severity));
  return {
    generatedAt,
    findings: sorted,
    summary: summarizeFindings(sorted),
  };
}

export function runSecurityAudit(env: NodeJS.ProcessEnv = process.env): SecurityAuditReport {
  const findings: SecurityFinding[] = [];
  const adminKey = (env.BOARDROOM_ADMIN_KEY ?? "").trim();
  const trustProxy = (env.BOARDROOM_TRUST_PROXY ?? "").trim().toLowerCase() === "true";
  const hasPostgres = (env.POSTGRES_URL ?? "").trim().length > 0;
  const defaultProvider = resolveProvider(env.BOARDROOM_PROVIDER);
  const rateLimitBackend = parseRateLimitBackend(env);
  const requireBulkApproval = parseBooleanEnv(env, "BOARDROOM_REQUIRE_BULK_RUN_APPROVAL", true);
  const requireExternalApproval = parseBooleanEnv(env, "BOARDROOM_REQUIRE_EXTERNAL_RESEARCH_APPROVAL", true);
  const requireSensitiveApproval = parseBooleanEnv(env, "BOARDROOM_REQUIRE_SENSITIVE_OUTPUT_APPROVAL", true);
  const runApprovalKey = (env.BOARDROOM_RUN_APPROVAL_KEY ?? "").trim();
  const bulkRunLimit = parsePositiveIntEnv(env, "BOARDROOM_MAX_BULK_RUN_DECISIONS", 50);
  const tavilyRequireAllowedHosts = parseBooleanEnv(env, "TAVILY_REQUIRE_ALLOWED_HOSTS", true);

  if (adminKey.length === 0) {
    findings.push({
      id: "S001",
      severity: "error",
      title: "Missing BOARDROOM_ADMIN_KEY",
      detail: "Sensitive API routes are disabled for non-loopback callers when BOARDROOM_ADMIN_KEY is not set.",
      remediation: "Set BOARDROOM_ADMIN_KEY to a long random secret and pass it via x-boardroom-admin-key for remote calls.",
    });
  } else if (looksWeakSecret(adminKey)) {
    findings.push({
      id: "S002",
      severity: "warning",
      title: "Weak BOARDROOM_ADMIN_KEY",
      detail: "The configured admin key appears short or predictable.",
      remediation: "Use at least 24 random characters from a cryptographically secure generator.",
    });
  }

  if (rateLimitBackend === "postgres" && !hasPostgres) {
    findings.push({
      id: "S003",
      severity: "error",
      title: "PostgreSQL rate limiting misconfigured",
      detail: "BOARDROOM_RATE_LIMIT_BACKEND=postgres but POSTGRES_URL is missing.",
      remediation: "Set POSTGRES_URL or change BOARDROOM_RATE_LIMIT_BACKEND to memory.",
    });
  } else if (rateLimitBackend === "memory" || (rateLimitBackend === "auto" && !hasPostgres)) {
    findings.push({
      id: "S004",
      severity: "warning",
      title: "In-memory rate limiting",
      detail: "Rate limiting is process-local and can be bypassed in multi-instance deployments.",
      remediation: "Set POSTGRES_URL and BOARDROOM_RATE_LIMIT_BACKEND=postgres for shared counters.",
    });
  } else {
    findings.push({
      id: "S005",
      severity: "info",
      title: "Shared rate limiting enabled",
      detail: "PostgreSQL-backed rate limit buckets are available.",
    });
  }

  if (trustProxy) {
    findings.push({
      id: "S006",
      severity: "warning",
      title: "Proxy header trust enabled",
      detail: "BOARDROOM_TRUST_PROXY=true allows x-forwarded-for/x-real-ip to influence client IP detection.",
      remediation: "Only enable when an edge proxy strips/sets forwarding headers reliably.",
    });
  }

  if ((requireBulkApproval || requireExternalApproval || requireSensitiveApproval) && runApprovalKey.length === 0) {
    findings.push({
      id: "S012",
      severity: "warning",
      title: "Run-approval policy enabled without key",
      detail:
        "One or more workflow approval policies are enabled, but BOARDROOM_RUN_APPROVAL_KEY is unset for remote callers.",
      remediation:
        "Set BOARDROOM_RUN_APPROVAL_KEY and provide x-boardroom-run-approval when invoking protected workflow modes remotely.",
    });
  } else if (runApprovalKey.length > 0) {
    findings.push({
      id: "S013",
      severity: "info",
      title: "Workflow approval key configured",
      detail: "Remote workflow policy approval key is configured.",
    });
  }

  if (bulkRunLimit > 200) {
    findings.push({
      id: "S014",
      severity: "warning",
      title: "Large bulk-run limit",
      detail: `BOARDROOM_MAX_BULK_RUN_DECISIONS=${bulkRunLimit} may permit high-cost runs.`,
      remediation: "Use a lower cap (for example 25-100) unless larger batches are required.",
    });
  }

  const configuredProviders = providerOptions().filter((provider) => {
    const keyName = getProviderApiKeyEnv(provider);
    return (env[keyName] ?? "").trim().length > 0;
  });

  if (configuredProviders.length === 0) {
    findings.push({
      id: "S007",
      severity: "error",
      title: "No LLM provider API keys configured",
      detail: "Workflow execution cannot call any provider safely without API credentials.",
      remediation: "Configure at least one of OPENAI_API_KEY, ANTHROPIC_API_KEY, MISTRAL_API_KEY, or META_API_KEY.",
    });
  } else {
    findings.push({
      id: "S008",
      severity: "info",
      title: "LLM provider credentials detected",
      detail: `Configured providers: ${configuredProviders.join(", ")}.`,
    });
  }

  const defaultProviderKey = getProviderApiKeyEnv(defaultProvider);
  if ((env[defaultProviderKey] ?? "").trim().length === 0) {
    findings.push({
      id: "S009",
      severity: "warning",
      title: "Default provider key missing",
      detail: `BOARDROOM_PROVIDER resolves to ${defaultProvider}, but ${defaultProviderKey} is empty.`,
      remediation: "Set the default provider key or change BOARDROOM_PROVIDER to a configured provider.",
    });
  }

  const tavilyKey = (env.TAVILY_API_KEY ?? "").trim();
  const allowedHosts = (env.TAVILY_ALLOWED_HOSTS ?? "").trim();
  if (tavilyRequireAllowedHosts && tavilyKey.length > 0 && allowedHosts.length === 0) {
    findings.push({
      id: "S010",
      severity: "warning",
      title: "Tavily host allowlist not configured",
      detail: "External research retrieval is enabled, but TAVILY_ALLOWED_HOSTS is empty while strict allowlist mode is on.",
      remediation: "Set TAVILY_ALLOWED_HOSTS to a curated comma-separated host allowlist.",
    });
  }

  if (allowedHosts.includes("*")) {
    findings.push({
      id: "S011",
      severity: "warning",
      title: "Wildcard host allowlist entry",
      detail: "TAVILY_ALLOWED_HOSTS contains a wildcard-like entry, weakening URL host controls.",
      remediation: "Use explicit hostnames only in TAVILY_ALLOWED_HOSTS.",
    });
  }

  return buildSecurityAuditReport(findings);
}

export function formatSecurityAuditReport(report: SecurityAuditReport): string {
  const lines: string[] = [
    `Security audit (${report.summary.status.toUpperCase()})`,
    `Generated at: ${report.generatedAt}`,
    `Errors: ${report.summary.errors} | Warnings: ${report.summary.warnings} | Info: ${report.summary.infos}`,
  ];

  if (report.findings.length === 0) {
    lines.push("No findings.");
    return lines.join("\n");
  }

  for (const finding of report.findings) {
    lines.push("");
    lines.push(`[${finding.severity.toUpperCase()}] ${finding.id} ${finding.title}`);
    lines.push(finding.detail);
    if (finding.remediation) {
      lines.push(`Remediation: ${finding.remediation}`);
    }
  }

  return lines.join("\n");
}
