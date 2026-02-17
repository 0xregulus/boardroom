import {
  DECISION_TYPE_OPTIONS,
  GOVERNANCE_CHECKLIST_ITEMS,
  LEVERAGE_SCORE_OPTIONS,
  PROBABILITY_OPTIONS,
  REVERSIBILITY_OPTIONS,
  RISK_LEVEL_OPTIONS,
  STRATEGIC_OBJECTIVE_OPTIONS,
  TIME_HORIZON_OPTIONS,
} from "../constants";
import type {
  CreateStrategyDraft,
  DraftCapitalAllocation,
  DraftCoreProperties,
  DraftRiskProperties,
} from "../types";
import { formatCurrency } from "../utils";

interface CreateStrategyConfigPanelsProps {
  createDraft: CreateStrategyDraft;
  isCreateReadOnly: boolean;
  isCoreCollapsed: boolean;
  isCapitalCollapsed: boolean;
  isRiskCollapsed: boolean;
  riskAdjustedValue: number;
  riskAdjustedRoi: number | null;
  weightedCapitalScore: number | null;
  riskScore: string;
  onToggleCore: () => void;
  onToggleCapital: () => void;
  onToggleRisk: () => void;
  onUpdateCoreProperty: (field: keyof DraftCoreProperties, value: string) => void;
  onUpdateCapitalAllocation: (field: keyof DraftCapitalAllocation, value: string | number) => void;
  onUpdateRiskProperty: (field: keyof DraftRiskProperties, value: string) => void;
}

export function CreateStrategyConfigPanels({
  createDraft,
  isCreateReadOnly,
  isCoreCollapsed,
  isCapitalCollapsed,
  isRiskCollapsed,
  riskAdjustedValue,
  riskAdjustedRoi,
  weightedCapitalScore,
  riskScore,
  onToggleCore,
  onToggleCapital,
  onToggleRisk,
  onUpdateCoreProperty,
  onUpdateCapitalAllocation,
  onUpdateRiskProperty,
}: CreateStrategyConfigPanelsProps) {
  return (
    <>
      <section className="create-control-panel">
        <button type="button" className="create-panel-toggle" onClick={onToggleCore}>
          <div className="create-panel-toggle-left">
            <span className="create-panel-chevron">{isCoreCollapsed ? "›" : "⌄"}</span>
            <h3>Core Properties</h3>
          </div>
          <span>{isCoreCollapsed ? "Show" : "Hide"}</span>
        </button>
        {!isCoreCollapsed ? (
          <div className="create-panel-body">
            <div className="create-property-row">
              <div className="create-property-label">
                <span className="create-property-icon">▾</span>
                <span>Strategic Objective</span>
              </div>
              <select
                value={createDraft.coreProperties.strategicObjective}
                onChange={(event) => onUpdateCoreProperty("strategicObjective", event.target.value)}
                className="create-property-input"
                disabled={isCreateReadOnly}
              >
                <option value="">Empty</option>
                {STRATEGIC_OBJECTIVE_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </div>

            <div className="create-property-row">
              <div className="create-property-label">
                <span className="create-property-icon">#</span>
                <span>Primary KPI</span>
              </div>
              <input
                type="text"
                value={createDraft.coreProperties.primaryKpi}
                onChange={(event) => onUpdateCoreProperty("primaryKpi", event.target.value)}
                placeholder="Empty"
                className="create-property-input"
                readOnly={isCreateReadOnly}
              />
            </div>

            <div className="create-property-row">
              <div className="create-property-label">
                <span className="create-property-icon">#</span>
                <span>Baseline</span>
              </div>
              <input
                type="text"
                value={createDraft.coreProperties.baseline}
                onChange={(event) => onUpdateCoreProperty("baseline", event.target.value)}
                placeholder="Empty"
                className="create-property-input"
                readOnly={isCreateReadOnly}
              />
            </div>

            <div className="create-property-row">
              <div className="create-property-label">
                <span className="create-property-icon">#</span>
                <span>Target</span>
              </div>
              <input
                type="text"
                value={createDraft.coreProperties.target}
                onChange={(event) => onUpdateCoreProperty("target", event.target.value)}
                placeholder="Empty"
                className="create-property-input"
                readOnly={isCreateReadOnly}
              />
            </div>

            <div className="create-property-row">
              <div className="create-property-label">
                <span className="create-property-icon">▾</span>
                <span>Time Horizon</span>
              </div>
              <select
                value={createDraft.coreProperties.timeHorizon}
                onChange={(event) => onUpdateCoreProperty("timeHorizon", event.target.value)}
                className="create-property-input"
                disabled={isCreateReadOnly}
              >
                <option value="">Empty</option>
                {TIME_HORIZON_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </div>

            <div className="create-property-row">
              <div className="create-property-label">
                <span className="create-property-icon">▾</span>
                <span>Decision Type</span>
              </div>
              <select
                value={createDraft.coreProperties.decisionType}
                onChange={(event) => onUpdateCoreProperty("decisionType", event.target.value)}
                className="create-property-input"
                disabled={isCreateReadOnly}
              >
                <option value="">Empty</option>
                {DECISION_TYPE_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </div>
          </div>
        ) : null}
      </section>

      <section className="create-control-panel">
        <button type="button" className="create-panel-toggle" onClick={onToggleCapital}>
          <div className="create-panel-toggle-left">
            <span className="create-panel-chevron">{isCapitalCollapsed ? "›" : "⌄"}</span>
            <h3>Capital Allocation Model</h3>
          </div>
          <span>{isCapitalCollapsed ? "Show" : "Hide"}</span>
        </button>
        {!isCapitalCollapsed ? (
          <div className="create-panel-body">
            <div className="create-property-row">
              <div className="create-property-label wide">
                <span className="create-property-icon">#</span>
                <span>Investment Required</span>
              </div>
              <div className="create-property-money-input">
                <span>$</span>
                <input
                  type="number"
                  value={createDraft.capitalAllocation.investmentRequired || ""}
                  onChange={(event) => onUpdateCapitalAllocation("investmentRequired", event.target.value)}
                  placeholder="0"
                  className="create-property-input"
                  readOnly={isCreateReadOnly}
                />
              </div>
            </div>

            <div className="create-property-row">
              <div className="create-property-label wide">
                <span className="create-property-icon">#</span>
                <span>12-Month Gross Benefit</span>
              </div>
              <div className="create-property-money-input">
                <span>$</span>
                <input
                  type="number"
                  value={createDraft.capitalAllocation.grossBenefit12m || ""}
                  onChange={(event) => onUpdateCapitalAllocation("grossBenefit12m", event.target.value)}
                  placeholder="0"
                  className="create-property-input"
                  readOnly={isCreateReadOnly}
                />
              </div>
            </div>

            <div className="create-property-row">
              <div className="create-property-label wide">
                <span className="create-property-icon">▾</span>
                <span>Probability of Success</span>
              </div>
              <select
                value={createDraft.capitalAllocation.probabilityOfSuccess}
                onChange={(event) => onUpdateCapitalAllocation("probabilityOfSuccess", event.target.value)}
                className="create-property-input"
                disabled={isCreateReadOnly}
              >
                <option value="">Empty</option>
                {PROBABILITY_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </div>

            <div className="create-property-row formula">
              <div className="create-property-label wide">
                <span className="create-property-icon">Σ</span>
                <span>Risk-Adjusted Value</span>
              </div>
              <div className="create-property-formula-value">{formatCurrency(riskAdjustedValue)}</div>
            </div>

            <div className="create-property-row formula">
              <div className="create-property-label wide">
                <span className="create-property-icon">Σ</span>
                <span>Risk-Adjusted ROI</span>
              </div>
              <div className="create-property-formula-value">
                {riskAdjustedRoi !== null ? `${(riskAdjustedRoi * 100).toFixed(1)}%` : "Empty"}
              </div>
            </div>

            <div className="create-property-row">
              <div className="create-property-label wide">
                <span className="create-property-icon">▾</span>
                <span>Strategic Leverage Score</span>
              </div>
              <select
                value={createDraft.capitalAllocation.strategicLeverageScore}
                onChange={(event) => onUpdateCapitalAllocation("strategicLeverageScore", event.target.value)}
                className="create-property-input"
                disabled={isCreateReadOnly}
              >
                <option value="">Empty</option>
                {LEVERAGE_SCORE_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </div>

            <div className="create-property-row">
              <div className="create-property-label wide">
                <span className="create-property-icon">▾</span>
                <span>Reversibility Factor</span>
              </div>
              <select
                value={createDraft.capitalAllocation.reversibilityFactor}
                onChange={(event) => onUpdateCapitalAllocation("reversibilityFactor", event.target.value)}
                className="create-property-input"
                disabled={isCreateReadOnly}
              >
                <option value="">Empty</option>
                {REVERSIBILITY_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </div>

            <div className="create-property-row formula highlighted">
              <div className="create-property-label wide">
                <span className="create-property-icon">Σ</span>
                <span>Weighted Capital Score</span>
              </div>
              <div className="create-property-formula-value strong">
                {weightedCapitalScore !== null ? weightedCapitalScore : "Empty"}
              </div>
            </div>
          </div>
        ) : null}
      </section>

      <section className="create-control-panel">
        <button type="button" className="create-panel-toggle" onClick={onToggleRisk}>
          <div className="create-panel-toggle-left">
            <span className="create-panel-chevron">{isRiskCollapsed ? "›" : "⌄"}</span>
            <h3>Risk Properties</h3>
          </div>
          <span>{isRiskCollapsed ? "Show" : "Hide"}</span>
        </button>
        {!isRiskCollapsed ? (
          <div className="create-panel-body">
            <div className="create-property-row formula">
              <div className="create-property-label wide">
                <span className="create-property-icon">▾</span>
                <span>Risk Score</span>
              </div>
              <div className={`create-risk-score-pill tone-${riskScore ? riskScore.toLowerCase() : "empty"}`}>
                {riskScore || "Empty"}
              </div>
            </div>

            <div className="create-property-row">
              <div className="create-property-label wide">
                <span className="create-property-icon">▾</span>
                <span>Regulatory Risk</span>
              </div>
              <select
                value={createDraft.riskProperties.regulatoryRisk}
                onChange={(event) => onUpdateRiskProperty("regulatoryRisk", event.target.value)}
                className="create-property-input"
                disabled={isCreateReadOnly}
              >
                <option value="">Empty</option>
                {RISK_LEVEL_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </div>

            <div className="create-property-row">
              <div className="create-property-label wide">
                <span className="create-property-icon">▾</span>
                <span>Technical Risk</span>
              </div>
              <select
                value={createDraft.riskProperties.technicalRisk}
                onChange={(event) => onUpdateRiskProperty("technicalRisk", event.target.value)}
                className="create-property-input"
                disabled={isCreateReadOnly}
              >
                <option value="">Empty</option>
                {RISK_LEVEL_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </div>

            <div className="create-property-row">
              <div className="create-property-label wide">
                <span className="create-property-icon">▾</span>
                <span>Operational Risk</span>
              </div>
              <select
                value={createDraft.riskProperties.operationalRisk}
                onChange={(event) => onUpdateRiskProperty("operationalRisk", event.target.value)}
                className="create-property-input"
                disabled={isCreateReadOnly}
              >
                <option value="">Empty</option>
                {RISK_LEVEL_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </div>

            <div className="create-property-row">
              <div className="create-property-label wide">
                <span className="create-property-icon">▾</span>
                <span>Reputational Risk</span>
              </div>
              <select
                value={createDraft.riskProperties.reputationalRisk}
                onChange={(event) => onUpdateRiskProperty("reputationalRisk", event.target.value)}
                className="create-property-input"
                disabled={isCreateReadOnly}
              >
                <option value="">Empty</option>
                {RISK_LEVEL_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </div>
          </div>
        ) : null}
      </section>

      <section className="create-guidance-panel">
        <div className="create-guidance-head">
          <span className="create-guidance-dot" aria-hidden="true" />
          <h3>Agent Evaluation Criteria</h3>
        </div>
        <div className="create-guidance-grid">
          {GOVERNANCE_CHECKLIST_ITEMS.map((item) => (
            <div key={item} className="create-guidance-item">
              <span className="create-guidance-item-dot" aria-hidden="true" />
              <span>{item}</span>
            </div>
          ))}
        </div>
        <p>
          These checks are evaluated automatically by executive agents during pipeline execution to determine the
          Decision Quality Score (DQS).
        </p>
      </section>
    </>
  );
}
