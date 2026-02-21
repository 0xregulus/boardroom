import type { WorkflowState } from "../states";
import { DECISION_SOURCE_HEADINGS } from "./constants";
import { cleanLine, dedupeKeepOrder, isLabelOnlyLine } from "./text";

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
