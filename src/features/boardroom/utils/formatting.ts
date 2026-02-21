import { CURRENCY_FORMATTER } from "../constants";

export function firstLine(text: string): string {
  return text.split(/\n+/).map((line) => line.trim()).find((line) => line.length > 0) ?? "";
}

export function formatCurrency(amount: number | null): string {
  if (amount === null || Number.isNaN(amount)) {
    return "N/A";
  }
  return CURRENCY_FORMATTER.format(amount);
}

export function formatDqs(value: number): string {
  if (!Number.isFinite(value)) {
    return "0.00";
  }
  return value.toFixed(2);
}

export function formatRunTimestamp(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "";
  }

  return parsed.toLocaleString("en-US", {
    month: "short",
    day: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
