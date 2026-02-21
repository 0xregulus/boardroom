import type { ReviewOutput } from "../../schemas/review_output";
import type { StrategicDecisionLogStatus } from "./types";

const USD_FORMATTER = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

export function asString(value: unknown, fallback = ""): string {
  if (typeof value !== "string") {
    return fallback;
  }
  return value;
}

export function toNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed.length === 0) {
      return null;
    }
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

export function toIsoTimestamp(value: unknown): string {
  if (!value) {
    return "";
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (typeof value === "string") {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString();
    }
  }

  return "";
}

export function toStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((entry): entry is string => typeof entry === "string");
  }

  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value) as unknown;
      if (Array.isArray(parsed)) {
        return parsed.filter((entry): entry is string => typeof entry === "string");
      }
    } catch {
      return [];
    }
  }

  return [];
}

export function toCitationsArray(value: unknown): ReviewOutput["citations"] {
  const parsedValue = (() => {
    if (typeof value === "string") {
      try {
        return JSON.parse(value) as unknown;
      } catch {
        return null;
      }
    }
    return value;
  })();

  if (!Array.isArray(parsedValue)) {
    return [];
  }

  const citations: ReviewOutput["citations"] = [];
  for (const entry of parsedValue) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      continue;
    }

    const record = entry as Record<string, unknown>;
    const url = asString(record.url).trim();
    if (!url) {
      continue;
    }

    citations.push({
      url,
      title: asString(record.title).slice(0, 220),
      claim: asString(record.claim).slice(0, 500),
    });
  }

  return citations.slice(0, 8);
}

export function toNumberArray(value: unknown): number[] {
  if (Array.isArray(value)) {
    return value
      .map((entry) => (typeof entry === "number" && Number.isFinite(entry) ? entry : Number(entry)))
      .filter((entry): entry is number => Number.isFinite(entry));
  }

  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value) as unknown;
      if (Array.isArray(parsed)) {
        return parsed
          .map((entry) => (typeof entry === "number" && Number.isFinite(entry) ? entry : Number(entry)))
          .filter((entry): entry is number => Number.isFinite(entry));
      }
    } catch {
      return [];
    }
  }

  return [];
}

export function toBooleanMap(value: unknown): Record<string, boolean> {
  const parsedValue = (() => {
    if (typeof value === "string") {
      try {
        return JSON.parse(value) as unknown;
      } catch {
        return null;
      }
    }
    return value;
  })();

  if (!parsedValue || typeof parsedValue !== "object" || Array.isArray(parsedValue)) {
    return {};
  }

  const output: Record<string, boolean> = {};
  for (const [key, entry] of Object.entries(parsedValue as Record<string, unknown>)) {
    output[key] = Boolean(entry);
  }
  return output;
}

export function normalizeStatus(status: string): StrategicDecisionLogStatus {
  const lowered = status.toLowerCase().trim();
  if (lowered.includes("approved")) {
    return "Approved";
  }
  if (lowered.includes("blocked")) {
    return "Blocked";
  }
  if (
    lowered.includes("review") ||
    lowered.includes("evaluation") ||
    lowered.includes("challenged") ||
    lowered.includes("incomplete")
  ) {
    return "In Review";
  }
  return "Proposed";
}

export function formatReviewDate(value: unknown): { label: string; timestamp: number } {
  const iso = toIsoTimestamp(value);
  if (!iso) {
    return { label: "No review date", timestamp: Number.NEGATIVE_INFINITY };
  }

  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) {
    return { label: "No review date", timestamp: Number.NEGATIVE_INFINITY };
  }

  return {
    label: parsed.toLocaleDateString("en-US", {
      month: "short",
      day: "2-digit",
      year: "numeric",
    }),
    timestamp: parsed.getTime(),
  };
}

export function formatInvestment(value: unknown): string {
  const numeric = toNumber(value);
  if (numeric !== null) {
    return USD_FORMATTER.format(numeric);
  }
  return "N/A";
}
