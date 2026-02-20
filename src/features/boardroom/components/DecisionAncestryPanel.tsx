import { useMemo, useState } from "react";

import type { DecisionStrategy, ReportDecisionAncestryMatch, WorkflowRunStateEntry } from "../types";
import { firstLine, formatRunTimestamp, normalizeWorkflowStates } from "../utils";

interface DecisionAncestryPanelProps {
  selectedStrategy: DecisionStrategy | null;
  selectedStrategyRunHistory: WorkflowRunStateEntry[];
  isSelectedStrategyRunHistoryLoading: boolean;
  selectedStrategyRunHistoryError: string | null;
}

function similarityPercent(value: number): number | null {
  if (!Number.isFinite(value)) {
    return null;
  }
  return Math.max(1, Math.min(99, Math.round(value * 100)));
}

function dqsOutOf100(value: number | null): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }
  return Math.max(0, Math.min(100, Math.round(value * 10)));
}

function normalizeRetrievalMode(value: unknown): "vector-db" | "lexical-fallback" {
  return value === "vector-db" ? "vector-db" : "lexical-fallback";
}

function formatRetrievalTimestamp(value: string | undefined): string {
  if (!value) {
    return "No retrieval yet";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "No retrieval yet";
  }

  const now = new Date();
  const sameDay =
    parsed.getFullYear() === now.getFullYear() &&
    parsed.getMonth() === now.getMonth() &&
    parsed.getDate() === now.getDate();

  const time = parsed.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });

  if (sameDay) {
    return `Today, ${time}`;
  }

  return `${parsed.toLocaleDateString("en-US", { month: "short", day: "numeric" })}, ${time}`;
}

function filterMatches(matches: ReportDecisionAncestryMatch[], query: string): ReportDecisionAncestryMatch[] {
  const normalizedQuery = query.trim().toLowerCase();
  if (normalizedQuery.length === 0) {
    return matches;
  }

  return matches.filter((match) => {
    const haystack = [
      match.decision_name,
      match.summary,
      ...(match.lessons ?? []),
      match.outcome.final_recommendation ?? "",
      match.outcome.gate_decision ?? "",
    ]
      .join(" ")
      .toLowerCase();
    return haystack.includes(normalizedQuery);
  });
}

export function DecisionAncestryPanel({
  selectedStrategy,
  selectedStrategyRunHistory,
  isSelectedStrategyRunHistoryLoading,
  selectedStrategyRunHistoryError,
}: DecisionAncestryPanelProps) {
  const [query, setQuery] = useState("");

  const parsedRunStates = useMemo(
    () =>
      normalizeWorkflowStates({
        mode: "all_proposed",
        results: selectedStrategyRunHistory.map((entry) => entry.state),
      }),
    [selectedStrategyRunHistory],
  );
  const latestState = parsedRunStates[0] ?? null;
  const retrievalMode = normalizeRetrievalMode(latestState?.decision_ancestry_retrieval_method);
  const retrievalTimestamp = formatRetrievalTimestamp(latestState?.run_created_at ?? selectedStrategyRunHistory[0]?.createdAt);
  const ancestryMatches = useMemo(() => latestState?.decision_ancestry ?? [], [latestState]);
  const visibleMatches = useMemo(() => filterMatches(ancestryMatches, query), [ancestryMatches, query]);

  return (
    <aside className="ancestry-memory-rail" aria-label="Decision ancestry memory panel">
      <header className="ancestry-memory-header">
        <div className="ancestry-memory-title-wrap">
          <span className="ancestry-memory-icon" aria-hidden="true">
            <svg viewBox="0 0 16 16" className="ancestry-memory-icon-svg">
              <circle cx="8" cy="8" r="3.75" />
              <path d="M8 6.1v2.4l1.65 1" />
              <path d="M3 4.7A6.3 6.3 0 1 1 2.1 9.9" />
              <path d="M2.1 6.1H5v2.9" />
            </svg>
          </span>
          <h3>Decision Ancestry</h3>
        </div>
      </header>

      <section className="ancestry-memory-meta" aria-label="Memory retrieval metadata">
        <div className="ancestry-memory-last">
          <span>Last Retrieval</span>
          <strong>{retrievalTimestamp}</strong>
        </div>
        <span className={`ancestry-memory-mode ${retrievalMode === "vector-db" ? "vector" : "lexical"}`}>
          {retrievalMode === "vector-db" ? "Vector" : "Lexical"}
        </span>
      </section>

      <label className="ancestry-memory-search">
        <span className="ancestry-memory-search-icon" aria-hidden="true">
          ⌕
        </span>
        <input
          type="search"
          placeholder="Search organizational memory..."
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </label>

      <div className="ancestry-memory-list" role="list" aria-label="Retrieved decision ancestry matches">
        {selectedStrategy === null ? (
          <p className="ancestry-memory-state">Select a strategic decision to load memory ancestry.</p>
        ) : null}

        {selectedStrategy !== null && isSelectedStrategyRunHistoryLoading ? (
          <p className="ancestry-memory-state">Loading ancestry from latest workflow run...</p>
        ) : null}

        {selectedStrategy !== null && !isSelectedStrategyRunHistoryLoading && selectedStrategyRunHistoryError ? (
          <p className="ancestry-memory-state error">{selectedStrategyRunHistoryError}</p>
        ) : null}

        {selectedStrategy !== null &&
          !isSelectedStrategyRunHistoryLoading &&
          !selectedStrategyRunHistoryError &&
          ancestryMatches.length === 0 ? (
          <p className="ancestry-memory-state">No ancestry memory available yet. Run the executive pipeline to capture matches.</p>
        ) : null}

        {selectedStrategy !== null &&
          !isSelectedStrategyRunHistoryLoading &&
          !selectedStrategyRunHistoryError &&
          ancestryMatches.length > 0 &&
          visibleMatches.length === 0 ? (
          <p className="ancestry-memory-state">No ancestry matches for this search query.</p>
        ) : null}

        {visibleMatches.map((match) => {
          const dqs100 = dqsOutOf100(match.outcome.dqs);
          const similarity = similarityPercent(match.similarity);
          const runAt = formatRunTimestamp(match.outcome.run_at);
          const summary = firstLine(match.summary || match.lessons[0] || "");

          return (
            <article key={match.decision_id} className="ancestry-memory-card" role="listitem">
              <div className="ancestry-memory-card-head">
                <h4>{match.decision_name}</h4>
                {similarity !== null ? <span className="ancestry-memory-similarity">{similarity}%</span> : null}
              </div>

              <div className="ancestry-memory-card-meta">
                <span>{runAt || "No run date"}</span>
                {dqs100 !== null ? <strong>DQS:{dqs100}</strong> : <strong>DQS:N/A</strong>}
              </div>

              <p className="ancestry-memory-quote">&ldquo;{summary || "No executive summary captured."}&rdquo;</p>
            </article>
          );
        })}
      </div>

      <footer className="ancestry-memory-footer">
        <p>Historical context injection improves critique quality in strategic reviews.</p>
      </footer>
    </aside>
  );
}
