import { DecisionStrategy } from "../types";
import { strategyStatusTone } from "../utils";
import { ChevronGlyph } from "./icons";

interface StrategyDetailsProps {
    selectedStrategy: DecisionStrategy | null;
    isLoadingStrategyDetails: boolean;
    isSelectedStrategyRunHistoryLoading: boolean;
    selectedStrategyRunHistoryCount: number;
    selectedStrategyRunHistoryError: string | null;
    onOpenDetails: () => void;
    onViewHistory: () => void;
    onRunAnalysis: () => void;
}

export function StrategyDetails({
    selectedStrategy,
    isLoadingStrategyDetails,
    isSelectedStrategyRunHistoryLoading,
    selectedStrategyRunHistoryCount,
    selectedStrategyRunHistoryError,
    onOpenDetails,
    onViewHistory,
    onRunAnalysis,
}: StrategyDetailsProps) {
    if (!selectedStrategy) {
        return (
            <div className="strategy-empty-state">
                <h2>Select a Strategy</h2>
                <p>Choose a decision strategy from the list to preview context, metrics, and launch the pipeline.</p>
            </div>
        );
    }

    return (
        <article className="strategy-preview-card">
            <header className="strategy-preview-header">
                <div>
                    <div className="strategy-preview-meta">
                        <span className={`strategy-status tone-${strategyStatusTone(selectedStrategy.status)}`}>
                            {selectedStrategy.status}
                        </span>
                        <span>ID: {selectedStrategy.id}</span>
                    </div>
                    <h2>{selectedStrategy.name}</h2>
                </div>
            </header>

            <p className="strategy-summary">{selectedStrategy.summary}</p>

            <div className="strategy-metrics">
                <div className="strategy-metric-card">
                    <span>Primary KPI Target</span>
                    <strong>{selectedStrategy.primaryKpi}</strong>
                </div>
                <div className="strategy-metric-card">
                    <span>Confidence</span>
                    <strong>{selectedStrategy.confidence}</strong>
                </div>
                <div className="strategy-metric-card">
                    <span>Estimated Investment</span>
                    <strong>{selectedStrategy.investment}</strong>
                </div>
                <div className="strategy-metric-card">
                    <span>Strategic Objective</span>
                    <strong>{selectedStrategy.strategicObjective}</strong>
                </div>
            </div>

            <div className="strategy-preview-actions">
                <button
                    type="button"
                    className="strategy-action-button strategy-action-secondary"
                    onClick={onOpenDetails}
                    disabled={isLoadingStrategyDetails}
                >
                    {isLoadingStrategyDetails ? "Loading Details..." : "View Details"}
                </button>

                {isSelectedStrategyRunHistoryLoading ? (
                    <button type="button" className="strategy-action-button strategy-action-history" disabled>
                        Checking Previous Runs...
                    </button>
                ) : selectedStrategyRunHistoryCount > 0 ? (
                    <button type="button" className="strategy-action-button strategy-action-history" onClick={onViewHistory}>
                        View Previous Runs ({selectedStrategyRunHistoryCount})
                    </button>
                ) : null}

                <button type="button" className="strategy-action-button strategy-run-button" onClick={onRunAnalysis}>
                    <span className="play-glyph" aria-hidden="true" />
                    Run Analysis Pipeline
                </button>
            </div>

            {selectedStrategyRunHistoryError ? (
                <p className="strategy-history-error">{selectedStrategyRunHistoryError}</p>
            ) : null}
        </article>
    );
}
