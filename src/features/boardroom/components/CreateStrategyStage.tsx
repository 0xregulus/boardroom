import type {
  CreateStrategyDraft,
  DraftCapitalAllocation,
  DraftCoreProperties,
  DraftRiskProperties,
} from "../types";
import { CreateStrategyArtifactSections } from "./CreateStrategyArtifactSections";
import { CreateStrategyConfigPanels } from "./CreateStrategyConfigPanels";

interface CreateStrategyStageProps {
  createDraft: CreateStrategyDraft;
  isCreateReadOnly: boolean;
  isCoreCollapsed: boolean;
  isCapitalCollapsed: boolean;
  isRiskCollapsed: boolean;
  riskAdjustedValue: number;
  riskAdjustedRoi: number | null;
  weightedCapitalScore: number | null;
  riskScore: string;
  onDraftNameChange: (value: string) => void;
  onToggleCore: () => void;
  onToggleCapital: () => void;
  onToggleRisk: () => void;
  onUpdateCoreProperty: (field: keyof DraftCoreProperties, value: string) => void;
  onUpdateCapitalAllocation: (field: keyof DraftCapitalAllocation, value: string | number) => void;
  onUpdateRiskProperty: (field: keyof DraftRiskProperties, value: string) => void;
  onUpdateSection: (sectionKey: string, value: string) => void;
  onRunAnalysis: () => void;
  onCancel: () => void;
  onSave: () => void;
}

export function CreateStrategyStage({
  createDraft,
  isCreateReadOnly,
  isCoreCollapsed,
  isCapitalCollapsed,
  isRiskCollapsed,
  riskAdjustedValue,
  riskAdjustedRoi,
  weightedCapitalScore,
  riskScore,
  onDraftNameChange,
  onToggleCore,
  onToggleCapital,
  onToggleRisk,
  onUpdateCoreProperty,
  onUpdateCapitalAllocation,
  onUpdateRiskProperty,
  onUpdateSection,
  onRunAnalysis,
  onCancel,
  onSave,
}: CreateStrategyStageProps) {
  return (
    <section className="create-strategy-stage">
      <div className="create-reference-frame">
        <article className="create-reference-card">
          <div className="create-reference-body">
            <div className="create-reference-top">
              <div className="create-reference-target-wrap" aria-hidden="true">
                <span className="create-reference-target">◉</span>
              </div>
              <div className="create-reference-version">Strategic Decision / v2.4</div>
            </div>

            <section className="create-title-section">
              <label className="create-title-label">Decision Title</label>
              <input
                type="text"
                value={createDraft.name}
                onChange={(event) => onDraftNameChange(event.target.value)}
                placeholder="e.g. Market Entry"
                className="create-title-input"
                readOnly={isCreateReadOnly}
              />
            </section>

            <CreateStrategyConfigPanels
              createDraft={createDraft}
              isCreateReadOnly={isCreateReadOnly}
              isCoreCollapsed={isCoreCollapsed}
              isCapitalCollapsed={isCapitalCollapsed}
              isRiskCollapsed={isRiskCollapsed}
              riskAdjustedValue={riskAdjustedValue}
              riskAdjustedRoi={riskAdjustedRoi}
              weightedCapitalScore={weightedCapitalScore}
              riskScore={riskScore}
              onToggleCore={onToggleCore}
              onToggleCapital={onToggleCapital}
              onToggleRisk={onToggleRisk}
              onUpdateCoreProperty={onUpdateCoreProperty}
              onUpdateCapitalAllocation={onUpdateCapitalAllocation}
              onUpdateRiskProperty={onUpdateRiskProperty}
            />

            <CreateStrategyArtifactSections
              createDraft={createDraft}
              isCreateReadOnly={isCreateReadOnly}
              onUpdateSection={onUpdateSection}
            />
          </div>

          <footer className="create-strategy-footer">
            <div className="create-strategy-footer-actions">
              {isCreateReadOnly ? (
                <>
                  <button type="button" className="create-save-button" onClick={onRunAnalysis}>
                    Run Analysis Pipeline
                  </button>
                  <button type="button" className="create-cancel-button" onClick={onCancel}>
                    Back to Strategic Decisions
                  </button>
                </>
              ) : (
                <>
                  <button type="button" className="create-save-button" onClick={onSave}>
                    Save Strategy Document
                  </button>
                  <button type="button" className="create-cancel-button" onClick={onCancel}>
                    Cancel
                  </button>
                </>
              )}
            </div>
            <div className="create-strategy-footer-meta">
              <span>{isCreateReadOnly ? "Strategic Decision Details" : "Strategic Decision"}</span>
              <span className="create-strategy-footer-pill">End of Artifact</span>
            </div>
          </footer>
        </article>
      </div>
    </section>
  );
}
