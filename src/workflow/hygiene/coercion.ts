import type { DecisionSnapshot } from "../../schemas/decision_snapshot";

export function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

export function cleanText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function parseNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const cleaned = value.replace(/[,$]/g, "").trim();
    if (cleaned.length === 0) {
      return null;
    }

    const parsed = Number(cleaned);
    return Number.isFinite(parsed) ? parsed : null;
  }

  const record = asRecord(value);
  if (!record) {
    return null;
  }

  return parseNumber(record.number ?? record.value ?? record.amount ?? null);
}

export function parsePercent(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value > 1 && value <= 100 ? value : value * 100;
  }

  if (typeof value === "string") {
    const match = value.match(/-?\d+(\.\d+)?/);
    if (!match) {
      return null;
    }

    const parsed = Number(match[0]);
    if (!Number.isFinite(parsed)) {
      return null;
    }

    return parsed > 1 && parsed <= 100 ? parsed : parsed * 100;
  }

  const record = asRecord(value);
  if (!record) {
    return null;
  }

  return parsePercent(record.select ?? record.name ?? record.value ?? null);
}

export function getSnapshotBodyText(snapshot: DecisionSnapshot | null): string {
  if (!snapshot || !Array.isArray(snapshot.section_excerpt)) {
    return "";
  }

  return snapshot.section_excerpt
    .map((item) => {
      const itemRecord = asRecord(item);
      const textRecord = asRecord(itemRecord?.text);
      return cleanText(textRecord?.content);
    })
    .join("\n")
    .trim();
}

export function includesAny(haystack: string, needle: string): boolean {
  const normalizedNeedle = needle.toLowerCase().trim();
  if (normalizedNeedle.length === 0) {
    return true;
  }

  const tokens = normalizedNeedle.split(/\s+/).filter((token) => token.length >= 3);
  if (tokens.length === 0) {
    return haystack.includes(normalizedNeedle);
  }

  return tokens.some((token) => haystack.includes(token));
}
