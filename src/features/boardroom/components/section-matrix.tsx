import { useMemo } from "react";

import type { MatrixSectionKey, SectionMatrix } from "../types";
import { cloneMatrix, defaultMatrixForSection, parseSectionMatrix, serializeSectionMatrix } from "../utils";

export function SectionMatrixEditor({
  sectionKey,
  value,
  onChange,
}: {
  sectionKey: MatrixSectionKey;
  value: string;
  onChange: (nextValue: string) => void;
}) {
  const matrix = useMemo(() => parseSectionMatrix(value, defaultMatrixForSection(sectionKey)), [sectionKey, value]);
  const lockFirstColumn = sectionKey === "optionsEvaluated";
  const allowRowManagement = sectionKey === "riskMatrix";
  const allowColumnManagement = sectionKey === "optionsEvaluated";

  function commit(nextMatrix: SectionMatrix): void {
    onChange(serializeSectionMatrix(nextMatrix));
  }

  function updateCell(rowIndex: number, columnIndex: number, nextValue: string): void {
    const nextMatrix = cloneMatrix(matrix);
    nextMatrix.rows[rowIndex][columnIndex] = nextValue;
    commit(nextMatrix);
  }

  function addRow(): void {
    if (!allowRowManagement) {
      return;
    }
    const nextMatrix = cloneMatrix(matrix);
    nextMatrix.rows.push(new Array(nextMatrix.headers.length).fill(""));
    commit(nextMatrix);
  }

  function removeRow(rowIndex: number): void {
    if (!allowRowManagement || matrix.rows.length <= 1) {
      return;
    }
    const nextMatrix = cloneMatrix(matrix);
    nextMatrix.rows = nextMatrix.rows.filter((_, index) => index !== rowIndex);
    commit(nextMatrix);
  }

  function addColumn(): void {
    if (!allowColumnManagement) {
      return;
    }
    const nextMatrix = cloneMatrix(matrix);
    const nextLabel = String.fromCharCode(64 + nextMatrix.headers.length);
    nextMatrix.headers.push(`Option ${nextLabel}`);
    nextMatrix.rows = nextMatrix.rows.map((row) => [...row, ""]);
    commit(nextMatrix);
  }

  function removeColumn(columnIndex: number): void {
    if (!allowColumnManagement || columnIndex === 0 || matrix.headers.length <= 2) {
      return;
    }
    const nextMatrix = cloneMatrix(matrix);
    nextMatrix.headers = nextMatrix.headers.filter((_, index) => index !== columnIndex);
    nextMatrix.rows = nextMatrix.rows.map((row) => row.filter((_, index) => index !== columnIndex));
    commit(nextMatrix);
  }

  return (
    <div className="create-section-matrix-shell">
      <div className="create-section-matrix-wrap">
        <table className="create-section-matrix">
          <thead>
            <tr>
              {matrix.headers.map((header, columnIndex) => (
                <th key={`${sectionKey}-${header}-${columnIndex}`}>
                  <span>{header}</span>
                  {allowColumnManagement && columnIndex > 0 ? (
                    <button
                      type="button"
                      className="create-matrix-remove-column-button"
                      onClick={() => removeColumn(columnIndex)}
                      disabled={matrix.headers.length <= 2}
                      aria-label={`Remove ${header}`}
                    >
                      ×
                    </button>
                  ) : null}
                </th>
              ))}
              {allowRowManagement ? <th className="create-section-matrix-actions-head">Actions</th> : null}
            </tr>
          </thead>
          <tbody>
            {matrix.rows.map((row, rowIndex) => (
              <tr key={`${sectionKey}-row-${rowIndex}`}>
                {row.map((cell, columnIndex) => {
                  const readOnly = lockFirstColumn && columnIndex === 0;
                  return (
                    <td key={`${sectionKey}-cell-${rowIndex}-${columnIndex}`}>
                      <input
                        className={`create-matrix-input ${readOnly ? "readonly" : ""}`}
                        value={cell}
                        onChange={(event) => updateCell(rowIndex, columnIndex, event.target.value)}
                        readOnly={readOnly}
                        aria-label={`${matrix.headers[columnIndex]} row ${rowIndex + 1}`}
                      />
                    </td>
                  );
                })}
                {allowRowManagement ? (
                  <td className="create-section-matrix-action-cell">
                    <button
                      type="button"
                      className="create-matrix-remove-button"
                      onClick={() => removeRow(rowIndex)}
                      disabled={matrix.rows.length <= 1}
                    >
                      Remove
                    </button>
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {allowRowManagement || allowColumnManagement ? (
        <div className="create-section-matrix-footer">
          {allowRowManagement ? (
            <button type="button" className="create-matrix-add-button" onClick={addRow}>
              Add Risk Row
            </button>
          ) : null}
          {allowColumnManagement ? (
            <button type="button" className="create-matrix-add-button" onClick={addColumn}>
              Add Option
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function SectionMatrixView({
  sectionKey,
  value,
}: {
  sectionKey: MatrixSectionKey;
  value: string;
}) {
  const matrix = useMemo(() => parseSectionMatrix(value, defaultMatrixForSection(sectionKey)), [sectionKey, value]);

  return (
    <div className="create-section-matrix-shell">
      <div className="create-section-matrix-wrap">
        <table className="create-section-matrix">
          <thead>
            <tr>
              {matrix.headers.map((header, columnIndex) => (
                <th key={`${sectionKey}-${header}-${columnIndex}`}>
                  <span>{header}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {matrix.rows.map((row, rowIndex) => (
              <tr key={`${sectionKey}-row-${rowIndex}`}>
                {row.map((cell, columnIndex) => (
                  <td key={`${sectionKey}-cell-${rowIndex}-${columnIndex}`}>
                    <input className="create-matrix-input readonly" value={cell} readOnly aria-label={`${matrix.headers[columnIndex]} row ${rowIndex + 1}`} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
