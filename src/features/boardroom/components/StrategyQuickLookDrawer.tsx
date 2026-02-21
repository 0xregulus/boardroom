import type { DecisionStrategy } from "../types";
import { DecisionPulse2D } from "./DecisionPulse2D";
import { CloseGlyph } from "./icons";

interface StrategyQuickLookDrawerProps {
  strategy: DecisionStrategy;
  dqs: number;
  pulseInfluence: number[];
  pulsePositions: Array<[number, number, number]>;
  runCount: number;
  onClose: () => void;
  onOpenReport: () => void;
  onOpenForge: () => void;
  onOpenHistory: () => void;
  onRerun: () => void;
}

export function StrategyQuickLookDrawer({
  strategy,
  dqs,
  pulseInfluence,
  pulsePositions,
  runCount,
  onClose,
  onOpenReport,
  onOpenForge,
  onOpenHistory,
  onRerun,
}: StrategyQuickLookDrawerProps) {
  return (
    <aside className="portfolio-drawer quicklook-drawer" aria-label="Strategy quick-look drawer">
      <header className="portfolio-drawer-header">
        <div>
          <h3>Decision Digest</h3>
          <p>{strategy.name}</p>
        </div>
        <button type="button" className="portfolio-drawer-close" onClick={onClose} aria-label="Close digest">
          <CloseGlyph />
        </button>
      </header>

      <div className="quicklook-pulse-wrap" aria-hidden="true">
        <div className="quicklook-pulse">
          <DecisionPulse2D
            dqs={dqs}
            isStatic={true}
            agentInfluence={pulseInfluence}
            agentPositions={pulsePositions}
          />
        </div>
        <div className="quicklook-score">
          <span>Decision Quality</span>
          <strong>{Math.round(dqs)}%</strong>
        </div>
      </div>

      <div className="quicklook-meta-grid">
        <article>
          <span>Status</span>
          <strong>{strategy.status}</strong>
        </article>
        <article>
          <span>Owner</span>
          <strong>{strategy.owner}</strong>
        </article>
        <article>
          <span>Review Date</span>
          <strong>{strategy.reviewDate}</strong>
        </article>
        <article>
          <span>Run History</span>
          <strong>{runCount}</strong>
        </article>
      </div>

      <div className="quicklook-actions">
        <button type="button" onClick={onOpenReport}>
          Open Full Report
        </button>
        <button type="button" onClick={onOpenForge}>
          Edit Document
        </button>
        <button type="button" onClick={onOpenHistory}>
          View Board Debate Logs
        </button>
        <button type="button" className="rerun" onClick={onRerun}>
          Re-Run Analysis
        </button>
      </div>
    </aside>
  );
}
