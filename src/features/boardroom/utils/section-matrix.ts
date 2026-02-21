import { MATRIX_SECTIONS, OPTIONS_MATRIX_DEFAULT, RISK_MATRIX_DEFAULT } from "../constants";
import type { MatrixSectionKey, SectionMatrix } from "../types";
import { asRecord, asStringArray } from "./parsing";

export function cloneMatrix(matrix: SectionMatrix): SectionMatrix {
  return {
    headers: [...matrix.headers],
    rows: matrix.rows.map((row) => [...row]),
  };
}

export function serializeSectionMatrix(matrix: SectionMatrix): string {
  return JSON.stringify(matrix);
}

export function defaultMatrixForSection(sectionKey: MatrixSectionKey): SectionMatrix {
  return sectionKey === "optionsEvaluated" ? cloneMatrix(OPTIONS_MATRIX_DEFAULT) : cloneMatrix(RISK_MATRIX_DEFAULT);
}

export function parseSectionMatrix(value: string, fallback: SectionMatrix): SectionMatrix {
  try {
    const parsed = JSON.parse(value) as unknown;
    const record = asRecord(parsed);
    const headers = asStringArray(record?.headers).filter((entry) => entry.trim().length > 0);
    const rows = Array.isArray(record?.rows)
      ? record.rows
        .map((entry) => (Array.isArray(entry) ? entry.filter((cell): cell is string => typeof cell === "string") : []))
        .filter((row) => row.length > 0)
      : [];

    if (headers.length === 0 || rows.length === 0) {
      return cloneMatrix(fallback);
    }

    const normalizedRows = rows.map((row) => {
      const nextRow = [...row];
      while (nextRow.length < headers.length) {
        nextRow.push("");
      }
      return nextRow.slice(0, headers.length);
    });

    return {
      headers,
      rows: normalizedRows,
    };
  } catch {
    return cloneMatrix(fallback);
  }
}

export function isSerializedSectionMatrix(value: string): boolean {
  try {
    const parsed = JSON.parse(value) as unknown;
    const record = asRecord(parsed);
    if (!record) {
      return false;
    }

    const headers = record.headers;
    const rows = record.rows;
    return Array.isArray(headers) && Array.isArray(rows);
  } catch {
    return false;
  }
}

export function isMatrixSectionKey(sectionKey: string): sectionKey is MatrixSectionKey {
  return Boolean(MATRIX_SECTIONS[sectionKey as MatrixSectionKey]);
}
