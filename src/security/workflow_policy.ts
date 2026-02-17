import { timingSafeEqual } from "node:crypto";
import type { NextApiRequest, NextApiResponse } from "next";

interface WorkflowRunPolicyInput {
  hasDecisionId: boolean;
  includeExternalResearch: boolean;
  includeSensitive: boolean;
}

function firstHeaderValue(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) {
    return value[0]?.trim() || null;
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  return null;
}

function normalizeIp(value: string): string {
  if (value.startsWith("::ffff:")) {
    return value.slice("::ffff:".length);
  }
  return value;
}

function socketIp(req: NextApiRequest): string {
  const fromSocket =
    req.socket?.remoteAddress ??
    (req as unknown as { connection?: { remoteAddress?: string } }).connection?.remoteAddress ??
    "unknown";

  return normalizeIp(fromSocket);
}

function shouldTrustProxyHeaders(): boolean {
  return (process.env.BOARDROOM_TRUST_PROXY ?? "").trim().toLowerCase() === "true";
}

function clientIp(req: NextApiRequest): string {
  const directSocketIp = socketIp(req);
  if (!shouldTrustProxyHeaders()) {
    return directSocketIp;
  }

  const forwardedFor = firstHeaderValue(req.headers["x-forwarded-for"]);
  if (forwardedFor) {
    const first = forwardedFor.split(",")[0]?.trim();
    if (first && first.length > 0) {
      return normalizeIp(first);
    }
  }

  const realIp = firstHeaderValue(req.headers["x-real-ip"]);
  if (realIp) {
    return normalizeIp(realIp);
  }

  return directSocketIp;
}

function isLoopbackIp(ip: string): boolean {
  return ip === "127.0.0.1" || ip === "::1" || ip === "localhost";
}

function secureEquals(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return timingSafeEqual(leftBuffer, rightBuffer);
}

function booleanEnv(name: string, fallback: boolean): boolean {
  const raw = (process.env[name] ?? "").trim().toLowerCase();
  if (raw === "true") {
    return true;
  }
  if (raw === "false") {
    return false;
  }
  return fallback;
}

function requiresExplicitApproval(input: WorkflowRunPolicyInput): boolean {
  if (!input.hasDecisionId && booleanEnv("BOARDROOM_REQUIRE_BULK_RUN_APPROVAL", true)) {
    return true;
  }

  if (input.includeExternalResearch && booleanEnv("BOARDROOM_REQUIRE_EXTERNAL_RESEARCH_APPROVAL", true)) {
    return true;
  }

  if (input.includeSensitive && booleanEnv("BOARDROOM_REQUIRE_SENSITIVE_OUTPUT_APPROVAL", true)) {
    return true;
  }

  return false;
}

export function enforceWorkflowRunPolicy(
  req: NextApiRequest,
  res: NextApiResponse,
  input: WorkflowRunPolicyInput,
): boolean {
  if (process.env.NODE_ENV === "test") {
    return true;
  }

  if (!requiresExplicitApproval(input)) {
    return true;
  }

  const ip = clientIp(req);
  if (isLoopbackIp(ip)) {
    return true;
  }

  const expectedApprovalKey = (process.env.BOARDROOM_RUN_APPROVAL_KEY ?? "").trim();
  if (expectedApprovalKey.length === 0) {
    res.status(503).json({
      error: "Workflow approval policy is enabled but BOARDROOM_RUN_APPROVAL_KEY is not configured",
    });
    return false;
  }

  const providedApprovalKey = firstHeaderValue(req.headers["x-boardroom-run-approval"]);
  if (!providedApprovalKey || !secureEquals(providedApprovalKey, expectedApprovalKey)) {
    res.status(403).json({ error: "Workflow run requires explicit approval" });
    return false;
  }

  return true;
}
