import type { ReviewOutput } from "../schemas/review_output";
import type { WorkflowState } from "./states";

const DECISION_SOURCE_HEADINGS = [
  "Executive Summary",
  "1. Strategic Context",
  "2. Problem Framing",
  "3. Options Evaluated",
  "4. Financial Model",
  "5. Risk Matrix",
  "6. Final Decision",
  "7. Kill Criteria",
  "8. Monitoring Plan",
];

export const PRD_SECTION_DEFAULTS: Record<string, string> = {
  Goals: "Define the north star: outcomes, why now, tie to OKRs.",
  Background: "Context: prior decisions, customer insights, incidents, gaps.",
  Research: "Market scans, competitive benchmarks, and evidence.",
  "User Stories": "Use: \"As a [user], I want [action], so I can [benefit].\"",
  Requirements: "Functional, non-functional, and constraints. Make them testable.",
  Telemetry: "Events, properties, funnels, KPIs, dashboards, and review cadence.",
  "UX/UI Design": "Capture UX flows, accessibility, and responsive design notes.",
  Experiment: "Hypothesis, KPIs, success/fail criteria, and sampling plan.",
  "Q&A": "Open questions, blockers, and dependencies.",
  Notes: "Assumptions, pending decisions, and implementation notes.",
};

const LABEL_ONLY_PHRASES = new Set([
  "",
  "+",
  "-",
  "objective supported",
  "kpi impact",
  "cost of inaction",
  "clear problem statement",
  "root cause",
  "affected segment",
  "quantified impact",
  "chosen option",
  "trade-offs",
  "trade offs",
  "primary metric",
  "leading indicators",
  "review cadence",
  "criteria",
  "revenue impact (12m)",
  "cost impact",
  "margin effect",
  "payback period",
  "confidence level",
  "risk",
  "impact",
  "probability",
  "mitigation",
  "we will stop or pivot if",
]);

const LINE_PREFIXES_TO_STRIP = [
  "decision requirement:",
  "executive requirement:",
  "problem framing:",
  "options evaluated:",
  "financial model:",
  "kill criterion:",
  "decision memo:",
];

function lcsLength(a: string, b: string): number {
  const dp: number[] = new Array(b.length + 1).fill(0);

  for (let i = 1; i <= a.length; i += 1) {
    let prev = 0;
    for (let j = 1; j <= b.length; j += 1) {
      const temp = dp[j];
      if (a[i - 1] === b[j - 1]) {
        dp[j] = prev + 1;
      } else {
        dp[j] = Math.max(dp[j], dp[j - 1]);
      }
      prev = temp;
    }
  }

  return dp[b.length] ?? 0;
}

function similarityRatio(a: string, b: string): number {
  if (!a && !b) {
    return 1;
  }

  const denominator = a.length + b.length;
  if (denominator === 0) {
    return 0;
  }

  return (2 * lcsLength(a, b)) / denominator;
}

export function cleanLine(text: string, maxLen = 260): string {
  let normalized = text.replaceAll("**", "").replaceAll("`", "");
  normalized = normalized.replaceAll("\t", " ").split(/\s+/).join(" ").trim();
  normalized = normalized.replace(/^[\s\-•]+|[\s\-•]+$/g, "");

  let lowered = normalized.toLowerCase();
  for (const prefix of LINE_PREFIXES_TO_STRIP) {
    if (lowered.startsWith(prefix)) {
      normalized = normalized.slice(prefix.length).trim();
      lowered = normalized.toLowerCase();
      break;
    }
  }

  const trimmed = normalized.slice(0, maxLen).trim();
  const lowerTrimmed = trimmed.toLowerCase().replace(/:$/, "");

  if (["", "+", "|", "-", "chosen option", "trade-offs", "trade offs"].includes(lowerTrimmed)) {
    return "";
  }

  return trimmed;
}

export function isLabelOnlyLine(line: string): boolean {
  const normalized = cleanLine(line, 260).toLowerCase().trim();

  if (!normalized) {
    return true;
  }
  if (LABEL_ONLY_PHRASES.has(normalized)) {
    return true;
  }
  if (normalized.startsWith("option ")) {
    return true;
  }

  if (normalized.includes(":")) {
    const tail = normalized.split(":").at(-1)?.trim() ?? "";
    if (!tail || LABEL_ONLY_PHRASES.has(tail) || tail.startsWith("option ")) {
      return true;
    }
    if (/^option\s+[a-z0-9]+(?:\s*\(.+\))?$/.test(tail)) {
      return true;
    }
  }

  if (normalized.endsWith(":")) {
    const core = normalized.slice(0, -1).trim();
    if (!core) {
      return true;
    }
    if (LABEL_ONLY_PHRASES.has(core)) {
      return true;
    }
    if (core.split(/\s+/).length <= 4) {
      return true;
    }
  }

  return false;
}

export function dedupeKeepOrder(lines: string[], limit = 8): string[] {
  const output: string[] = [];
  const seen = new Set<string>();

  for (const line of lines) {
    const cleaned = cleanLine(line);
    if (!cleaned) {
      continue;
    }

    const key = cleaned.toLowerCase();
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    output.push(cleaned);

    if (output.length >= limit) {
      break;
    }
  }

  return output;
}

export function normalizeSimilarityText(text: string): string {
  let normalized = text.toLowerCase();
  normalized = normalized.replace(/[^a-z0-9\s]/g, " ");
  normalized = normalized.replace(
    /\b(a|an|the|to|for|of|and|or|with|all|ensure|perform|conduct|develop|comprehensive|thorough|potential|required)\b/g,
    " ",
  );
  normalized = normalized.replace(/\s+/g, " ").trim();
  return normalized;
}

export function dedupeSemantic(lines: string[], limit = 8, similarity = 0.86): string[] {
  const output: string[] = [];
  const normalizedOutput: string[] = [];

  for (const line of lines) {
    const cleaned = cleanLine(line);
    if (!cleaned) {
      continue;
    }

    let normalized = normalizeSimilarityText(cleaned);
    if (!normalized) {
      normalized = cleaned.toLowerCase();
    }

    let duplicate = false;
    for (const prior of normalizedOutput) {
      if (normalized === prior || similarityRatio(normalized, prior) >= similarity) {
        duplicate = true;
        break;
      }
    }

    if (duplicate) {
      continue;
    }

    output.push(cleaned);
    normalizedOutput.push(normalized);

    if (output.length >= limit) {
      break;
    }
  }

  return output;
}

function requirementTopicKey(text: string): string {
  const lowered = text.toLowerCase();
  if (lowered.includes("downside model") || lowered.includes("downside modeling")) {
    return "downside_modeling";
  }
  if (lowered.includes("compliance review")) {
    return "compliance_review";
  }
  if (lowered.includes("risk matrix")) {
    return "risk_matrix";
  }
  return "";
}

export function propertyValue(properties: Record<string, unknown>, name: string): string {
  const raw = properties[name];
  if (typeof raw === "string") {
    return raw;
  }
  if (typeof raw === "number" && Number.isFinite(raw)) {
    return Number.isInteger(raw) ? String(Math.trunc(raw)) : String(raw);
  }
  if (typeof raw === "boolean") {
    return raw ? "Yes" : "No";
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return "";
  }
  const prop = raw as Record<string, unknown>;

  const propType = prop.type;

  if (propType === "title") {
    const title = (prop.title ?? []) as Array<Record<string, unknown>>;
    return title.map((item) => (typeof item.plain_text === "string" ? item.plain_text : "")).join("");
  }

  if (propType === "rich_text") {
    const richText = (prop.rich_text ?? []) as Array<Record<string, unknown>>;
    return richText.map((item) => (typeof item.plain_text === "string" ? item.plain_text : "")).join("");
  }

  if (propType === "number") {
    const value = prop.number;
    if (value === null || value === undefined) {
      return "";
    }
    if (typeof value === "number" && Number.isInteger(value)) {
      return String(Math.trunc(value));
    }
    return String(value);
  }

  if (propType === "select") {
    const select = prop.select as Record<string, unknown> | undefined;
    return typeof select?.name === "string" ? select.name : "";
  }

  if (propType === "status") {
    const status = prop.status as Record<string, unknown> | undefined;
    return typeof status?.name === "string" ? status.name : "";
  }

  if (propType === "checkbox") {
    return prop.checkbox ? "Yes" : "No";
  }

  if (propType === "url") {
    return typeof prop.url === "string" ? prop.url : "";
  }

  if (propType === "email") {
    return typeof prop.email === "string" ? prop.email : "";
  }

  return "";
}

export function snapshotBodyText(state: WorkflowState): string {
  const snapshot = state.decision_snapshot;
  if (!snapshot || snapshot.section_excerpt.length === 0) {
    return "";
  }

  const first = snapshot.section_excerpt[0];
  if (!first || typeof first !== "object") {
    return "";
  }

  return typeof first.text.content === "string" ? first.text.content : "";
}

export function extractDecisionSection(bodyText: string, heading: string): string {
  if (!bodyText) {
    return "";
  }

  const lowered = bodyText.toLowerCase();
  const marker = heading.toLowerCase();
  const markerPos = lowered.indexOf(marker);

  if (markerPos === -1) {
    return "";
  }

  let contentStart = bodyText.indexOf("\n", markerPos);
  if (contentStart === -1) {
    contentStart = markerPos + heading.length;
  } else {
    contentStart += 1;
  }

  let contentEnd = bodyText.length;

  for (const nextHeading of DECISION_SOURCE_HEADINGS) {
    if (nextHeading.toLowerCase() === marker) {
      continue;
    }

    const idx = lowered.indexOf(nextHeading.toLowerCase(), contentStart);
    if (idx !== -1 && idx < contentEnd) {
      contentEnd = idx;
    }
  }

  return bodyText.slice(contentStart, contentEnd).trim();
}

export function sectionLines(text: string, maxLines = 6): string[] {
  if (!text) {
    return [];
  }

  let lines = text
    .split("\n")
    .map((line) => cleanLine(line))
    .filter((line) => line.length > 0);

  if (lines.length <= 1 && lines.length > 0) {
    lines = lines[0]
      .split(/(?<=[.!?])\s+/)
      .map((line) => cleanLine(line))
      .filter((line) => line.length > 0);
  }

  lines = lines.filter((line) => !isLabelOnlyLine(line));
  return dedupeKeepOrder(lines, maxLines);
}

export function reviewsRequiredChanges(reviews: Record<string, ReviewOutput>, limit = 6): string[] {
  const lines: string[] = [];
  const seenTopics = new Set<string>();

  for (const review of Object.values(reviews)) {
    for (const change of review.required_changes) {
      const cleaned = cleanLine(change);
      if (!cleaned) {
        continue;
      }

      const topicKey = requirementTopicKey(cleaned);
      if (topicKey && seenTopics.has(topicKey)) {
        continue;
      }
      if (topicKey) {
        seenTopics.add(topicKey);
      }

      lines.push(cleaned);
    }
  }

  return dedupeSemantic(lines, limit);
}

export function reviewsRiskEvidence(reviews: Record<string, ReviewOutput>, limit = 6): string[] {
  const lines: string[] = [];

  for (const review of Object.values(reviews)) {
    for (const risk of review.risks) {
      lines.push(`${risk.type}: ${risk.evidence}`);
    }
  }

  return dedupeKeepOrder(lines, limit);
}

export function finalDecisionRequirements(finalDecisionText: string): string[] {
  if (!finalDecisionText) {
    return [];
  }

  const cleanText = finalDecisionText.replaceAll("**", "");
  const requirements: string[] = [];

  const optionMatches = [...cleanText.matchAll(/Option\s+([A-Za-z0-9]+)\s*\(([^)]+)\)/g)];

  if (optionMatches.length > 0) {
    const optionDescriptions = dedupeKeepOrder(
      optionMatches.map((match) => `Option ${match[1]} (${match[2].trim()})`),
      4,
    );

    if (optionDescriptions.length === 1) {
      requirements.push(`Implement ${optionDescriptions[0]} as the selected approach.`);
    } else {
      const joined = optionDescriptions.slice(0, 3).join(" + ");
      requirements.push(`Implement a phased rollout combining ${joined}.`);
    }
  }

  for (const line of sectionLines(cleanText, 12)) {
    const lowerLine = line.toLowerCase().replace(/:$/, "");

    if (["chosen option", "trade-offs", "trade offs", "combine", "+"].includes(lowerLine)) {
      continue;
    }

    if (line.toLowerCase().startsWith("option ")) {
      continue;
    }

    if (optionMatches.length > 0 && lowerLine.includes("combine option")) {
      continue;
    }

    if (lowerLine.includes("trade-off") || lowerLine.includes("trade off")) {
      continue;
    }

    if (line.startsWith("Prioritize ") || line.startsWith("Focus ")) {
      requirements.push(`Trade-off guardrail: ${line.replace(/[.]$/, "")}.`);
    } else if (lowerLine.includes("phased rollout") && lowerLine.includes("option")) {
      requirements.push(line.replace(/[.]$/, ""));
    }
  }

  return dedupeSemantic(requirements, 5, 0.8);
}
