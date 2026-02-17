import { PlusGlyph } from "./icons";
import { DecisionStrategy } from "../types";
import { strategyStatusTone } from "../utils";

interface StrategyListProps {
    strategies: DecisionStrategy[];
    isLoading: boolean;
    error: string | null;
    selectedStrategyId: string | null;
    onSelect: (strategy: DecisionStrategy) => void;
    onCreate: () => void;
}

export function StrategyList({
    strategies,
    isLoading,
    error,
    selectedStrategyId,
    onSelect,
    onCreate,
}: StrategyListProps) {
    return (
        <>
            <div className="strategy-sidebar-header">
                <div className="strategy-sidebar-title">
                    <h2>Strategic Decisions</h2>
                    <p>Select a brief to review before initiating AI analysis.</p>
                </div>
                <button
                    type="button"
                    className="strategy-add-button"
                    aria-label="Add strategy"
                    onClick={onCreate}
                >
                    <PlusGlyph />
                </button>
            </div>

            <div className="strategy-list" aria-label="Decision strategy list">
                {isLoading ? (
                    <p className="strategy-list-state">Loading strategies from Strategic Decision Log...</p>
                ) : null}

                {!isLoading && error ? (
                    <p className="strategy-list-state error">{error}</p>
                ) : null}

                {!isLoading && !error && strategies.length === 0 ? (
                    <p className="strategy-list-state">No strategies found in the Strategic Decision Log.</p>
                ) : null}

                {!isLoading &&
                    strategies.map((strategy) => {
                        const active = selectedStrategyId === strategy.id;
                        const tone = strategyStatusTone(strategy.status);

                        return (
                            <button
                                key={strategy.id}
                                type="button"
                                className={`strategy-list-item ${active ? "selected" : ""}`}
                                onClick={() => onSelect(strategy)}
                            >
                                <div className="strategy-list-head">
                                    <h3>{strategy.name}</h3>
                                    <span className={`strategy-status tone-${tone}`}>{strategy.status}</span>
                                </div>
                                <div className="strategy-list-meta">
                                    <span>{strategy.owner}</span>
                                    <span>{strategy.reviewDate}</span>
                                </div>
                            </button>
                        );
                    })}
            </div>
        </>
    );
}
