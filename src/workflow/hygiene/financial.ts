import { parseNumber } from "./coercion";

export interface MoneyMatch {
  value: number;
  label: string;
}

interface TabularMoneyObservation {
  key: string;
  value: number;
  label: string;
}

function parseScaledNumber(raw: string, scaleHint: string | undefined): number | null {
  const numeric = Number(raw.replace(/,/g, ""));
  if (!Number.isFinite(numeric)) {
    return null;
  }

  const unit = (scaleHint ?? "").toLowerCase();
  if (unit.startsWith("b")) {
    return numeric * 1_000_000_000;
  }
  if (unit.startsWith("m")) {
    return numeric * 1_000_000;
  }
  if (unit.startsWith("k")) {
    return numeric * 1_000;
  }
  return numeric;
}

export function extractLabeledMoney(text: string, labels: string[]): MoneyMatch | null {
  if (text.trim().length === 0) {
    return null;
  }

  const pattern = labels.map((label) => label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
  const regex = new RegExp(`(?:${pattern})[^\\n\\r\\d$]{0,40}\\$?([0-9][0-9,]*(?:\\.[0-9]+)?)\\s*(billion|million|thousand|b|m|k)?`, "i");
  const match = text.match(regex);
  if (!match) {
    return null;
  }

  const parsed = parseScaledNumber(match[1] ?? "", match[2]);
  if (parsed === null) {
    return null;
  }

  return {
    value: parsed,
    label: match[0],
  };
}

function normalizeMetricLabel(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function parseMoneyFromCell(raw: string): number | null {
  const cleaned = raw
    .replace(/\$/g, "")
    .replace(/usd/gi, "")
    .replace(/[()]/g, "")
    .trim();
  const scaledMatch = cleaned.match(/([0-9][0-9,]*(?:\.[0-9]+)?)\s*(billion|million|thousand|b|m|k)\b/i);
  if (scaledMatch) {
    return parseScaledNumber(scaledMatch[1], scaledMatch[2]);
  }
  return parseNumber(cleaned);
}

function normalizeTableKey(label: string): string | null {
  const normalized = normalizeMetricLabel(label);
  if (normalized.length === 0) {
    return null;
  }

  if (
    normalized.includes("projected revenue") ||
    normalized.includes("revenue impact") ||
    normalized.includes("annual revenue") ||
    normalized.includes("gross benefit")
  ) {
    return "projected_revenue";
  }

  if (
    normalized.includes("market size") ||
    normalized.includes("tam") ||
    normalized.includes("sam") ||
    normalized.includes("som")
  ) {
    return "market_size";
  }

  if (normalized.includes("investment required") || normalized.includes("investment")) {
    return "investment";
  }

  return null;
}

function extractTabularMoneyObservations(text: string): TabularMoneyObservation[] {
  const observations: TabularMoneyObservation[] = [];
  const lines = text.split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.length === 0) {
      continue;
    }

    if (trimmed.includes("|")) {
      const cells = trimmed
        .split("|")
        .map((cell) => cell.trim())
        .filter((cell) => cell.length > 0);
      if (cells.length < 2 || cells.every((cell) => /^-+$/.test(cell))) {
        continue;
      }

      const label = cells[0];
      const key = normalizeTableKey(label);
      if (!key) {
        continue;
      }

      for (let index = 1; index < cells.length; index += 1) {
        const value = parseMoneyFromCell(cells[index]);
        if (value !== null && value > 0) {
          observations.push({ key, value, label: `${label}: ${cells[index]}` });
          break;
        }
      }
      continue;
    }

    if (trimmed.includes(",")) {
      if (!/^[a-zA-Z][a-zA-Z0-9 _-]{1,80},\s*[$(]?[0-9]/.test(trimmed)) {
        continue;
      }

      const cells = trimmed.split(",").map((cell) => cell.trim());
      if (cells.length < 2) {
        continue;
      }

      const label = cells[0];
      const key = normalizeTableKey(label);
      if (!key) {
        continue;
      }

      for (let index = 1; index < cells.length; index += 1) {
        const value = parseMoneyFromCell(cells[index]);
        if (value !== null && value > 0) {
          observations.push({ key, value, label: `${label}: ${cells[index]}` });
          break;
        }
      }
    }
  }

  return observations;
}

function selectFirstObservation(
  observations: TabularMoneyObservation[],
  key: string,
): MoneyMatch | null {
  const candidate = observations.find((entry) => entry.key === key);
  if (!candidate) {
    return null;
  }

  return {
    value: candidate.value,
    label: candidate.label,
  };
}

export function extractDocumentProbability(text: string): number | null {
  if (text.trim().length === 0) {
    return null;
  }

  const match = text.match(/(?:probability of success|success probability|chance of success)[^\n\r\d]{0,30}(\d{1,3}(?:\.\d+)?)\s*%/i);
  if (!match) {
    return null;
  }

  const parsed = Number(match[1]);
  return Number.isFinite(parsed) ? parsed : null;
}

export function extractTableMoneyPair(text: string): {
  observations: number;
  marketSize: MoneyMatch | null;
  projectedRevenue: MoneyMatch | null;
} {
  const observations = extractTabularMoneyObservations(text);
  return {
    observations: observations.length,
    marketSize: selectFirstObservation(observations, "market_size"),
    projectedRevenue: selectFirstObservation(observations, "projected_revenue"),
  };
}
