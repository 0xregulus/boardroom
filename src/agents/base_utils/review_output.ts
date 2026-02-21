import { reviewOutputSchema, type ReviewOutput } from "../../schemas/review_output";
import { asBoolean, asNumber, asString, firstDefined, normalizeStringArray } from "./coercion";
import { safeJsonParse } from "./parse";

function normalizeCitationUrl(value: unknown): string | null {
  const candidate = asString(value);
  if (!candidate) {
    return null;
  }

  const trimmed = candidate.trim();
  if (!/^https?:\/\//i.test(trimmed)) {
    return null;
  }

  return trimmed.slice(0, 500);
}

function normalizeCitations(value: unknown): ReviewOutput["citations"] {
  if (!Array.isArray(value)) {
    return [];
  }

  const citations: ReviewOutput["citations"] = [];

  for (const entry of value) {
    if (typeof entry === "string") {
      const url = normalizeCitationUrl(entry);
      if (!url) {
        continue;
      }

      citations.push({
        url,
        title: "",
        claim: "",
      });
      continue;
    }

    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      continue;
    }

    const item = entry as Record<string, unknown>;
    const url = normalizeCitationUrl(firstDefined(item, ["url", "link", "source"]));
    if (!url) {
      continue;
    }

    citations.push({
      url,
      title: (asString(firstDefined(item, ["title", "source_name"])) ?? "").slice(0, 220),
      claim: (asString(firstDefined(item, ["claim", "evidence", "summary", "note"])) ?? "").slice(0, 500),
    });
  }

  const deduped = new Map<string, ReviewOutput["citations"][number]>();
  for (const citation of citations) {
    if (!deduped.has(citation.url)) {
      deduped.set(citation.url, citation);
    }
  }

  return [...deduped.values()].slice(0, 8);
}

function normalizeRisks(value: unknown): ReviewOutput["risks"] {
  if (!Array.isArray(value)) {
    return [];
  }

  const risks: ReviewOutput["risks"] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      continue;
    }

    const obj = entry as Record<string, unknown>;
    const type = asString(obj.type) ?? asString(obj.category) ?? "unspecified_risk";
    const evidence = asString(obj.evidence) ?? asString(obj.reason) ?? asString(obj.description);
    if (!evidence) {
      continue;
    }

    const severityRaw = asNumber(obj.severity) ?? 5;
    const severity = Math.max(1, Math.min(10, Math.round(severityRaw)));

    risks.push({
      type,
      severity,
      evidence,
    });
  }

  return risks;
}

function normalizeGovernanceChecks(value: unknown, governanceFields: string[]): Record<string, boolean> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  const allowed = new Set(governanceFields);
  const checks: Record<string, boolean> = {};

  for (const [key, rawValue] of Object.entries(value as Record<string, unknown>)) {
    if (allowed.size > 0 && !allowed.has(key)) {
      continue;
    }

    const boolValue = asBoolean(rawValue);
    if (boolValue !== null) {
      checks[key] = boolValue;
    }
  }

  return checks;
}

function normalizeReviewObject(parsed: Record<string, unknown>, agentName: string, governanceFields: string[]): ReviewOutput {
  const blockers = normalizeStringArray(firstDefined(parsed, ["blockers", "blocking_issues"]));
  const blockedRaw = asBoolean(firstDefined(parsed, ["blocked", "is_blocked", "block"]));
  const blocked = blockedRaw ?? blockers.length > 0;

  const scoreRaw = asNumber(firstDefined(parsed, ["score", "rating", "final_score"])) ?? 1;
  const confidenceCandidate = asNumber(firstDefined(parsed, ["confidence", "certainty"])) ?? 0;
  const confidence = confidenceCandidate > 1 && confidenceCandidate <= 100 ? confidenceCandidate / 100 : confidenceCandidate;

  return {
    agent: agentName,
    thesis: asString(firstDefined(parsed, ["thesis", "summary", "assessment"])) ?? `${agentName} review generated.`,
    score: Math.max(1, Math.min(10, Math.round(scoreRaw))),
    confidence: Math.max(0, Math.min(1, confidence)),
    blocked,
    blockers,
    risks: normalizeRisks(firstDefined(parsed, ["risks", "risk_register", "risk_assessment"])),
    citations: normalizeCitations(firstDefined(parsed, ["citations", "sources", "references"])),
    required_changes: normalizeStringArray(
      firstDefined(parsed, ["required_changes", "required_revisions", "requiredChanges", "action_items"]),
    ),
    approval_conditions: normalizeStringArray(
      firstDefined(parsed, ["approval_conditions", "approvalConditions", "conditions"]),
    ),
    apga_impact_view: asString(firstDefined(parsed, ["apga_impact_view", "apgaImpactView", "impact_view"])) ?? "Not provided.",
    governance_checks_met: normalizeGovernanceChecks(
      firstDefined(parsed, ["governance_checks_met", "governanceChecksMet", "governance_checks"]),
      governanceFields,
    ),
  };
}

export function parseReviewOutput(content: string, agentName: string, governanceFields: string[]): ReviewOutput | null {
  const parsed = safeJsonParse(content);
  if (!parsed) {
    return null;
  }

  const root =
    Array.isArray(parsed) && parsed.length > 0 && parsed[0] && typeof parsed[0] === "object"
      ? (parsed[0] as Record<string, unknown>)
      : !Array.isArray(parsed) && typeof parsed === "object"
        ? (parsed as Record<string, unknown>)
        : null;

  if (!root) {
    return null;
  }

  const normalized = normalizeReviewObject(root, agentName, governanceFields);
  const validated = reviewOutputSchema.safeParse(normalized);
  return validated.success ? validated.data : null;
}

export function buildReviewJsonContractInstruction(agentName: string, governanceFields: string[]): string {
  const governanceTemplate: Record<string, boolean> = {};
  for (const field of governanceFields) {
    governanceTemplate[field] = false;
  }

  const schemaTemplate = {
    agent: agentName,
    thesis: "string",
    score: 7,
    confidence: 0.7,
    blocked: false,
    blockers: ["string"],
    risks: [{ type: "string", severity: 5, evidence: "string" }],
    citations: [{ url: "https://example.com", title: "string", claim: "string" }],
    required_changes: ["string"],
    approval_conditions: ["string"],
    apga_impact_view: "string",
    governance_checks_met: governanceTemplate,
  };

  return [
    "Return ONLY a valid JSON object.",
    "Do not include markdown fences, comments, trailing commas, or explanatory text.",
    "Use this exact top-level schema and key names:",
    JSON.stringify(schemaTemplate),
  ].join("\n");
}
