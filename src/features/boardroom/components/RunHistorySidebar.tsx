import { DecisionPulse2D } from "./DecisionPulse2D";
import { CloseGlyph } from "./icons";

export interface StrategyRunHistoryEntry {
  id: number;
  timestamp: string;
  dqs: number;
  summary: string;
  influence: number[];
  deltaFromPrevious: number | null;
}

interface RunHistorySidebarProps {
  strategyTitle: string;
  runHistory: StrategyRunHistoryEntry[];
  selectedRunId: number | null;
  onClose: () => void;
  onSelectRun: (runId: number) => void;
  onOpenReport: (runId: number) => void;
}

function formatTimestamp(iso: string): string {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) {
    return iso;
  }
  return parsed.toLocaleString("en-US", {
    month: "short",
    day: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDelta(delta: number | null): string {
  if (delta === null || !Number.isFinite(delta)) {
    return "Baseline run";
  }
  const rounded = Math.round(delta);
  if (rounded === 0) {
    return "No DQS delta";
  }
  return `${rounded > 0 ? "+" : ""}${rounded} DQS vs prior run`;
}

export function RunHistorySidebar({
  strategyTitle,
  runHistory,
  selectedRunId,
  onClose,
  onSelectRun,
  onOpenReport,
}: RunHistorySidebarProps) {
  return (
    <aside className="portfolio-drawer run-history-drawer" aria-label="Execution history drawer">
      <header className="portfolio-drawer-header">
        <div>
          <h3>Execution History</h3>
          <p>{strategyTitle}</p>
        </div>
        <button type="button" className="portfolio-drawer-close" onClick={onClose} aria-label="Close execution history">
          <CloseGlyph />
        </button>
      </header>

      <div className="run-history-track">
        {runHistory.map((run, index) => {
          const isActive = run.id === selectedRunId;
          return (
            <article key={run.id} className={`run-history-item ${isActive ? "active" : ""}`}>
              <span className={`run-history-dot ${index === 0 ? "latest" : ""}`} aria-hidden="true" />
              <button type="button" className="run-history-card" onClick={() => onSelectRun(run.id)}>
                <div className="run-history-card-head">
                  <div>
                    <strong>Run #{runHistory.length - index}</strong>
                    <p>{formatTimestamp(run.timestamp)}</p>
                  </div>
                  <span>{Math.round(run.dqs)}%</span>
                </div>
                <div className="run-history-stamp" aria-hidden="true">
                  <DecisionPulse2D dqs={run.dqs} agentInfluence={run.influence} isStatic={true} />
                </div>
                <p className="run-history-delta">{formatDelta(run.deltaFromPrevious)}</p>
                <p className="run-history-summary">{run.summary}</p>
                <span className="run-history-report-link">Time Machine: Open this report snapshot</span>
              </button>
              <button
                type="button"
                className="run-history-open"
                onClick={() => onOpenReport(run.id)}
              >
                Open Snapshot
              </button>
            </article>
          );
        })}
      </div>
    </aside>
  );
}
