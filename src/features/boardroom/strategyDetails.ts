import type { DecisionForWorkflow } from "../../store/postgres";

export type StrategyStatus = "Proposed" | "In Review" | "Approved" | "Blocked";

type SectionKey =
  | "executiveSummary"
  | "strategicContext"
  | "problemFraming"
  | "optionsEvaluated"
  | "financialModel"
  | "riskMatrix"
  | "downsideModel"
  | "finalDecision"
  | "killCriteria"
  | "complianceMonitoring";

export interface StrategyResponseEntry {
  id: string;
  name: string;
  status: StrategyStatus;
  owner: string;
  reviewDate: string;
  summary: string;
  primaryKpi: string;
  investment: string;
  strategicObjective: string;
  confidence: string;
  detailsUrl?: string;
  artifactSections?: Record<string, string>;
}

const SECTION_HEADING_MAP: Record<SectionKey, string[]> = {
  executiveSummary: ["Executive Summary"],
  strategicContext: ["1. Strategic Context", "Strategic Context"],
  problemFraming: ["2. Problem Framing", "Problem Framing"],
  optionsEvaluated: ["3. Options Evaluated", "Options Evaluated"],
  financialModel: ["4. Financial Model", "Financial Model"],
  riskMatrix: ["5. Risk Matrix", "Risk Matrix"],
  downsideModel: ["6. Downside Model", "Downside Model"],
  finalDecision: ["7. Final Decision", "6. Final Decision", "Final Decision"],
  killCriteria: ["8. Kill Criteria", "7. Kill Criteria", "Kill Criteria"],
  complianceMonitoring: ["10. Compliance & Monitoring", "9. Compliance & Monitoring", "8. Monitoring Plan", "Compliance & Monitoring", "Monitoring Plan"],
};

const SECTION_KEYS = Object.keys(SECTION_HEADING_MAP) as SectionKey[];
const ALL_SECTION_HEADINGS = Array.from(new Set(Object.values(SECTION_HEADING_MAP).flat()));

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

export function normalizeId(value: string): string {
  return value.trim().toLowerCase().replaceAll("-", "");
}

function firstNonEmpty(values: Array<string | null | undefined>, fallback = ""): string {
  for (const value of values) {
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }
  return fallback;
}

function normalizeStatus(raw: string): StrategyStatus {
  const normalized = raw.trim().toLowerCase();
  if (normalized.includes("approved")) {
    return "Approved";
  }
  if (normalized.includes("blocked")) {
    return "Blocked";
  }
  if (normalized.includes("review") || normalized.includes("challenged") || normalized.includes("evaluation")) {
    return "In Review";
  }
  return "Proposed";
}

function formatReviewDateLabel(raw: string): string {
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) {
    return "No review date";
  }

  return parsed.toLocaleDateString("en-US", {
    month: "short",
    day: "2-digit",
    year: "numeric",
  });
}

function parseCurrencyAmount(raw: string): number {
  const parsed = Number(raw.replace(/[^0-9.-]+/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function readRichTextSegments(value: unknown): string {
  if (!Array.isArray(value)) {
    return "";
  }

  return value
    .map((entry) => {
      const record = asRecord(entry);
      if (!record) {
        return "";
      }

      if (typeof record.plain_text === "string") {
        return record.plain_text;
      }

      const text = asRecord(record.text);
      if (text && typeof text.content === "string") {
        return text.content;
      }

      if (typeof record.name === "string") {
        return record.name;
      }

      return "";
    })
    .join("")
    .trim();
}

function readPropertyText(value: unknown): string {
  if (typeof value === "string") {
    return value.trim();
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }

  if (typeof value === "boolean") {
    return value ? "Yes" : "No";
  }

  if (Array.isArray(value)) {
    return readRichTextSegments(value);
  }

  const record = asRecord(value);
  if (!record) {
    return "";
  }

  const propType = typeof record.type === "string" ? record.type : "";

  if (propType === "title") {
    return readRichTextSegments(record.title);
  }

  if (propType === "rich_text") {
    return readRichTextSegments(record.rich_text);
  }

  if (propType === "select") {
    const select = asRecord(record.select);
    return select && typeof select.name === "string" ? select.name : "";
  }

  if (propType === "status") {
    const status = asRecord(record.status);
    return status && typeof status.name === "string" ? status.name : "";
  }

  if (propType === "date") {
    const date = asRecord(record.date);
    return date && typeof date.start === "string" ? date.start : "";
  }

  if (propType === "number") {
    return typeof record.number === "number" && Number.isFinite(record.number) ? String(record.number) : "";
  }

  if (propType === "formula") {
    const formula = asRecord(record.formula);
    if (formula?.type === "string") {
      return asString(formula.string).trim();
    }
    if (formula?.type === "number" && typeof formula.number === "number" && Number.isFinite(formula.number)) {
      return String(formula.number);
    }
  }

  if (propType === "people") {
    const people = Array.isArray(record.people) ? record.people : [];
    return people
      .map((entry) => {
        const personRecord = asRecord(entry);
        if (!personRecord) {
          return "";
        }
        if (typeof personRecord.name === "string") {
          return personRecord.name;
        }
        return "";
      })
      .filter((entry) => entry.length > 0)
      .join(", ");
  }

  return firstNonEmpty([
    readRichTextSegments(record.rich_text),
    readRichTextSegments(record.title),
    asString(record.name),
    asString(record.plain_text),
  ]);
}

function readMitigations(value: unknown): Array<Record<string, string>> {
  const raw =
    typeof value === "string"
      ? (() => {
        try {
          return JSON.parse(value) as unknown;
        } catch {
          return null;
        }
      })()
      : value;

  if (!Array.isArray(raw)) {
    return [];
  }

  return raw
    .map((entry) => asRecord(entry))
    .filter((entry): entry is Record<string, unknown> => entry !== null)
    .map((entry) => ({
      id: asString(entry.id).trim(),
      sectionKey: asString(entry.sectionKey).trim(),
      riskTitle: asString(entry.riskTitle).trim(),
      description: asString(entry.description).trim(),
      mitigationText: asString(entry.mitigationText).trim(),
      resolvedAt: asString(entry.resolvedAt).trim(),
    }))
    .filter((entry) => entry.id.length > 0 && entry.mitigationText.length > 0);
}

function readPropertyNumber(value: unknown): number | null {
  const primitive = asNumber(value);
  if (primitive !== null) {
    return primitive;
  }

  const record = asRecord(value);
  if (!record) {
    return null;
  }

  const propType = typeof record.type === "string" ? record.type : "";
  if (propType === "number") {
    return typeof record.number === "number" && Number.isFinite(record.number) ? record.number : null;
  }

  if (propType === "formula") {
    const formula = asRecord(record.formula);
    if (formula?.type === "number" && typeof formula.number === "number" && Number.isFinite(formula.number)) {
      return formula.number;
    }
  }

  if (typeof record.number === "number" && Number.isFinite(record.number)) {
    return record.number;
  }

  return null;
}

function pickProperty(properties: Record<string, unknown>, keys: string[]): unknown {
  for (const key of keys) {
    if (key in properties) {
      return properties[key];
    }
  }
  return null;
}

function extractSectionFromBodyText(bodyText: string, candidateHeadings: string[]): string {
  if (bodyText.trim().length === 0) {
    return "";
  }

  const lowered = bodyText.toLowerCase();
  let markerPos = -1;
  let marker = "";

  for (const heading of candidateHeadings) {
    const idx = lowered.indexOf(heading.toLowerCase());
    if (idx !== -1 && (markerPos === -1 || idx < markerPos)) {
      markerPos = idx;
      marker = heading;
    }
  }

  if (markerPos === -1) {
    return "";
  }

  let contentStart = bodyText.indexOf("\n", markerPos);
  if (contentStart === -1) {
    contentStart = markerPos + marker.length;
  } else {
    contentStart += 1;
  }

  let contentEnd = bodyText.length;
  for (const heading of ALL_SECTION_HEADINGS) {
    const idx = lowered.indexOf(heading.toLowerCase(), contentStart);
    if (idx !== -1 && idx < contentEnd) {
      contentEnd = idx;
    }
  }

  return bodyText.slice(contentStart, contentEnd).trim();
}

function hasAnyContent(value: Record<string, string | number>): boolean {
  return Object.values(value).some((entry) => {
    if (typeof entry === "number") {
      return Number.isFinite(entry) && entry > 0;
    }
    return entry.trim().length > 0;
  });
}

export function buildArtifactSections(
  properties: Record<string, unknown>,
  bodyText: string,
  fallback: {
    summary: string;
    primaryKpi: string;
    strategicObjective: string;
    confidence: string;
    investment: string;
  },
): Record<string, string> {
  const sections: Record<string, string> = {};

  for (const sectionKey of SECTION_KEYS) {
    const extracted = extractSectionFromBodyText(bodyText, SECTION_HEADING_MAP[sectionKey]);
    if (extracted.length > 0) {
      sections[sectionKey] = extracted;
    }
  }

  if (!sections.executiveSummary && fallback.summary.trim().length > 0) {
    sections.executiveSummary = fallback.summary.trim();
  }

  if (!sections.strategicContext && bodyText.trim().length > 0) {
    sections.strategicContext = bodyText.trim();
  }

  const coreProperties = {
    strategicObjective: firstNonEmpty([
      readPropertyText(pickProperty(properties, ["Strategic Objective", "Objective", "Business Objective"])),
      fallback.strategicObjective,
    ]),
    primaryKpi: firstNonEmpty([
      readPropertyText(pickProperty(properties, ["Primary KPI", "KPI", "Success Metric", "Target KPI"])),
      fallback.primaryKpi,
    ]),
    baseline: readPropertyText(pickProperty(properties, ["Baseline"])),
    target: readPropertyText(pickProperty(properties, ["Target"])),
    timeHorizon: readPropertyText(pickProperty(properties, ["Time Horizon"])),
    decisionType: readPropertyText(pickProperty(properties, ["Decision Type"])),
  };

  if (hasAnyContent(coreProperties)) {
    sections.coreProperties = JSON.stringify(coreProperties);
  }

  const investmentRequired =
    readPropertyNumber(pickProperty(properties, ["Investment Required", "Investment", "Budget"])) ?? parseCurrencyAmount(fallback.investment);
  const capitalAllocation = {
    investmentRequired,
    grossBenefit12m: readPropertyNumber(pickProperty(properties, ["12-Month Gross Benefit", "12M Gross Benefit"])) ?? 0,
    probabilityOfSuccess: firstNonEmpty([
      readPropertyText(pickProperty(properties, ["Probability of Success", "Confidence Level", "Confidence"])),
      fallback.confidence,
    ]),
    strategicLeverageScore: readPropertyText(pickProperty(properties, ["Strategic Leverage Score", "Leverage Score"])),
    reversibilityFactor: readPropertyText(pickProperty(properties, ["Reversibility Factor"])),
  };

  if (hasAnyContent(capitalAllocation)) {
    sections.capitalAllocationModel = JSON.stringify(capitalAllocation);
  }

  const riskProperties = {
    regulatoryRisk: readPropertyText(pickProperty(properties, ["Regulatory Risk"])),
    technicalRisk: readPropertyText(pickProperty(properties, ["Technical Risk"])),
    operationalRisk: readPropertyText(pickProperty(properties, ["Operational Risk"])),
    reputationalRisk: readPropertyText(pickProperty(properties, ["Reputational Risk"])),
  };

  if (hasAnyContent(riskProperties)) {
    sections.riskProperties = JSON.stringify(riskProperties);
  }

  const mitigations = readMitigations(pickProperty(properties, ["Mitigations", "mitigations"]));
  if (mitigations.length > 0) {
    sections.mitigations = JSON.stringify(mitigations);
  }

  return sections;
}

export function buildFallbackStrategyFromWorkflow(decisionId: string, workflowDecision: DecisionForWorkflow): StrategyResponseEntry {
  const properties = workflowDecision.properties;

  const reviewDateRaw = readPropertyText(pickProperty(properties, ["Review Date"]));
  const statusRaw = readPropertyText(pickProperty(properties, ["Status"]));

  return {
    id: decisionId,
    name: firstNonEmpty([readPropertyText(pickProperty(properties, ["Decision Name"])), workflowDecision.name], `Decision ${decisionId.slice(0, 8)}`),
    status: normalizeStatus(statusRaw),
    owner: firstNonEmpty([readPropertyText(pickProperty(properties, ["Owner"]))], "Unassigned"),
    reviewDate: formatReviewDateLabel(reviewDateRaw),
    summary: firstNonEmpty([readPropertyText(pickProperty(properties, ["Executive Summary"]))], `Decision brief for ${workflowDecision.name}.`),
    primaryKpi: firstNonEmpty([readPropertyText(pickProperty(properties, ["Primary KPI"]))], "Not specified"),
    investment: firstNonEmpty([readPropertyText(pickProperty(properties, ["Investment Required"]))], "N/A"),
    strategicObjective: firstNonEmpty([readPropertyText(pickProperty(properties, ["Strategic Objective"]))], "Not specified"),
    confidence: firstNonEmpty([readPropertyText(pickProperty(properties, ["Confidence Level", "Probability of Success"]))], "N/A"),
  };
}
