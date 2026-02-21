import type { ReportWorkflowState } from "../types";

export type AuditEntryType = "PIPELINE_EXEC" | "AGENT_REASONING" | "NEGOTIATION";

export interface AuditEntry {
  id: string;
  lineNumber: string;
  type: AuditEntryType;
  timestamp: string | null;
  message: string;
}

export const EMPTY_DECISION_ANCESTRY: ReportWorkflowState["decision_ancestry"] = [];
export const EMPTY_HYGIENE_FINDINGS: ReportWorkflowState["hygiene_findings"] = [];

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function inferAuditEntryType(message: string): AuditEntryType {
  const normalized = message.toLowerCase();

  if (
    normalized.includes("cross-agent") ||
    normalized.includes("rebuttal") ||
    normalized.includes("negotiation") ||
    normalized.includes("mediating")
  ) {
    return "NEGOTIATION";
  }

  if (
    normalized.includes("review") ||
    normalized.includes("[agent") ||
    normalized.includes("red team") ||
    normalized.includes("executive")
  ) {
    return "AGENT_REASONING";
  }

  return "PIPELINE_EXEC";
}

export function buildAuditEntries(logLines: string[]): AuditEntry[] {
  return logLines.map((line, index) => {
    const match = line.match(/^(\d{1,2}:\d{2}:\d{2})\s{2,}(.*)$/);
    const timestamp = match?.[1] ?? null;
    const message = (match?.[2] ?? line).trim();

    return {
      id: `${index}-${line}`,
      lineNumber: String(index + 1).padStart(3, "0"),
      type: inferAuditEntryType(message),
      timestamp,
      message,
    };
  });
}

export function clampPercent(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.min(100, value));
}

export function formatAgentSummaryLabel(agent: string, fallbackIndex: number): string {
  const normalized = agent.trim().toLowerCase();
  if (normalized.includes("ceo")) {
    return "CEO VISION";
  }
  if (normalized.includes("cfo")) {
    return "CFO MARGIN";
  }
  if (normalized.includes("cto")) {
    return "CTO TECH";
  }
  if (normalized.includes("pre-mortem")) {
    return "PRE-MORTEM";
  }
  if (normalized.includes("resource competitor")) {
    return "RESOURCE RIVAL";
  }
  if (normalized.includes("compliance")) {
    return "COMPLIANCE";
  }
  return `${agent.trim().toUpperCase() || `REVIEW ${fallbackIndex + 1}`}`;
}

export function extractChairpersonCitations(activeReport: ReportWorkflowState): string[] {
  const synthesisCitations = Array.isArray(activeReport.synthesis?.evidence_citations)
    ? activeReport.synthesis.evidence_citations
    : [];
  if (synthesisCitations.length > 0) {
    return synthesisCitations
      .filter((entry): entry is string => typeof entry === "string")
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0)
      .slice(0, 6);
  }

  const raw = asRecord(activeReport.raw);
  if (!raw || !Array.isArray(raw.chairperson_evidence_citations)) {
    return [];
  }

  return raw.chairperson_evidence_citations
    .filter((entry): entry is string => typeof entry === "string")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0)
    .slice(0, 6);
}

export function citationText(citation: string): string {
  return citation.replace(/^\[[^\]]+\]\s*/, "");
}
