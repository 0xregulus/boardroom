import { useMemo, useState } from "react";

interface RiskPillProps {
  id: string;
  riskTitle: string;
  description: string;
  riskLevel: "Critical" | "Warning";
  resolved: boolean;
  resolvedMitigation?: string;
  onMitigate: (id: string, mitigationText: string) => Promise<string | null | undefined> | string | null | undefined;
}

export function RiskPill({ id, riskTitle, description, riskLevel, resolved, resolvedMitigation, onMitigate }: RiskPillProps) {
  const [isAddressing, setIsAddressing] = useState(false);
  const [text, setText] = useState("");
  const [validationError, setValidationError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const canSubmit = useMemo(() => text.trim().length > 0, [text]);

  if (resolved) {
    return (
      <article className="risk-pill resolved">
        <header>
          <span className="risk-pill-icon" aria-hidden="true">
            ✓
          </span>
          <h4>Mitigated: {riskTitle}</h4>
        </header>
        <p>{description}</p>
        {resolvedMitigation ? <blockquote>{resolvedMitigation}</blockquote> : null}
      </article>
    );
  }

  return (
    <article className="risk-pill">
      <header>
        <span className="risk-pill-icon" aria-hidden="true">
          !
        </span>
        <h4>Critical Failure State: {riskTitle}</h4>
        <span className={`risk-pill-level ${riskLevel === "Critical" ? "critical" : "warning"}`}>{riskLevel}</span>
      </header>
      <p>{description}</p>

      {!isAddressing ? (
        <button type="button" className="risk-pill-address" onClick={() => setIsAddressing(true)}>
          Address this risk
        </button>
      ) : (
        <div className="risk-pill-editor">
          <textarea
            rows={3}
            value={text}
            onChange={(event) => {
              setText(event.target.value);
              if (validationError) {
                setValidationError(null);
              }
            }}
            placeholder="Describe mitigation strategy or contingency plan..."
          />
          {validationError ? <p className="risk-pill-validation-error">{validationError}</p> : null}
          <footer>
            <button type="button" onClick={() => setIsAddressing(false)} disabled={isSubmitting}>
              Cancel
            </button>
            <button
              type="button"
              disabled={!canSubmit || isSubmitting}
              onClick={async () => {
                setIsSubmitting(true);
                try {
                  const validationResult = await onMitigate(id, text.trim());
                  if (validationResult) {
                    setValidationError(validationResult);
                    return;
                  }
                  setValidationError(null);
                  setText("");
                  setIsAddressing(false);
                } finally {
                  setIsSubmitting(false);
                }
              }}
            >
              {isSubmitting ? "Validating..." : "Log Mitigation"}
            </button>
          </footer>
        </div>
      )}
    </article>
  );
}
