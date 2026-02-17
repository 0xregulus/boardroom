import type { ApiResult, ReportReview, ReportWorkflowState, SnapshotMetrics } from "../types";
import { formatCurrency, formatDqs, formatRunTimestamp } from "../utils";

interface WorkflowPreviewStageProps {
  activeReport: ReportWorkflowState | null;
  activeMetrics: SnapshotMetrics | null;
  reportStates: ReportWorkflowState[];
  clampedPreviewIndex: number;
  error: string | null;
  result: ApiResult | null;
  activeRecommendation: "Approved" | "Challenged" | "Blocked" | null;
  activeRecommendationTone: "approved" | "challenged" | "blocked" | null;
  summaryLine: string;
  blockedReviewCount: number;
  missingSectionCount: number;
  activeGovernanceRows: Array<{ label: string; met: boolean }>;
  activeReviews: ReportReview[];
  onPreviewIndexChange: (index: number) => void;
}

export function WorkflowPreviewStage({
  activeReport,
  activeMetrics,
  reportStates,
  clampedPreviewIndex,
  error,
  result,
  activeRecommendation,
  activeRecommendationTone,
  summaryLine,
  blockedReviewCount,
  missingSectionCount,
  activeGovernanceRows,
  activeReviews,
  onPreviewIndexChange,
}: WorkflowPreviewStageProps) {
  const interactionRounds = activeReport?.interaction_rounds ?? [];

  return (
    <section className="preview-mode">
      {activeReport && activeMetrics ? (
        <div className="report-shell">
          {reportStates.length > 1 ? (
            <div className="report-switcher" role="tablist" aria-label="Decision report selector">
              {reportStates.map((state, index) => (
                <button
                  key={state.decision_id || index}
                  type="button"
                  role="tab"
                  aria-selected={clampedPreviewIndex === index}
                  className={clampedPreviewIndex === index ? "active" : ""}
                  onClick={() => onPreviewIndexChange(index)}
                >
                  {state.run_created_at
                    ? `Run ${index + 1} - ${formatRunTimestamp(state.run_created_at) || state.decision_name}`
                    : state.decision_name || `Decision ${index + 1}`}
                </button>
              ))}
            </div>
          ) : null}

          {error ? <div className="preview-error">{error}</div> : null}

          <article className="report-card">
            <header className={`report-hero tone-${activeRecommendationTone ?? "challenged"}`}>
              <div className="report-hero-main">
                <div className="report-meta">
                  <span className="report-tag">Strategic Decision</span>
                  <span className="report-id">ID: {activeReport.decision_id.slice(0, 16)}</span>
                  {activeReport.run_created_at ? (
                    <span className="report-id">Run: {formatRunTimestamp(activeReport.run_created_at)}</span>
                  ) : null}
                </div>
                <h2>{activeReport.decision_name}</h2>
                <p>{summaryLine || "Executive report generated from workflow results."}</p>
              </div>

              <div className="report-hero-stats">
                <span className={`report-decision-pill tone-${activeRecommendationTone ?? "challenged"}`}>{activeRecommendation}</span>
                <div className="report-dqs">
                  <span>DQS</span>
                  <strong>
                    {formatDqs(activeReport.dqs)}
                    <small>/10</small>
                  </strong>
                </div>
              </div>
            </header>

            <div className="report-content">
              <div className="report-summary-grid">
                <div className="summary-card">
                  <span>Blocked Reviews</span>
                  <strong>{blockedReviewCount}</strong>
                </div>
                <div className="summary-card">
                  <span>Missing Sections</span>
                  <strong>{missingSectionCount}</strong>
                </div>
                <div className="summary-card">
                  <span>Rebuttal Rounds</span>
                  <strong>{interactionRounds.length}</strong>
                </div>
                <div className="summary-card">
                  <span>Workflow Status</span>
                  <strong>{activeReport.status}</strong>
                </div>
                <div className="summary-card">
                  <span>Recommendation</span>
                  <strong>{activeRecommendation}</strong>
                </div>
              </div>

              <div className="report-top-grid">
                <section className="report-block">
                  <h3>Strategic Snapshot</h3>
                  <div className="snapshot-grid">
                    <div className="snapshot-item wide">
                      <span>Primary KPI</span>
                      <strong>{activeMetrics.primaryKpi}</strong>
                    </div>
                    <div className="snapshot-item">
                      <span>Investment</span>
                      <strong>{formatCurrency(activeMetrics.investment)}</strong>
                    </div>
                    <div className="snapshot-item">
                      <span>12M Benefit</span>
                      <strong>{formatCurrency(activeMetrics.benefit12m)}</strong>
                    </div>
                    <div className="snapshot-item">
                      <span>Risk-Adjusted ROI</span>
                      <strong>{activeMetrics.roi !== null ? `${activeMetrics.roi.toFixed(2)}x` : "N/A"}</strong>
                    </div>
                    <div className="snapshot-item">
                      <span>Probability</span>
                      <strong>{activeMetrics.probability}</strong>
                    </div>
                    <div className="snapshot-item">
                      <span>Time Horizon</span>
                      <strong>{activeMetrics.timeHorizon}</strong>
                    </div>
                    <div className="snapshot-item">
                      <span>Strategic Objective</span>
                      <strong>{activeMetrics.strategicObjective}</strong>
                    </div>
                    <div className="snapshot-item">
                      <span>Leverage Score</span>
                      <strong>{activeMetrics.leverageScore}</strong>
                    </div>
                  </div>
                </section>

                <section className="report-block">
                  <h3>Governance & Quality Controls</h3>
                  {activeGovernanceRows.length > 0 ? (
                    <div className="governance-grid">
                      {activeGovernanceRows.map((row) => (
                        <div key={row.label} className={`governance-row ${row.met ? "met" : "missing"}`}>
                          <span>{row.label}</span>
                          <strong>{row.met ? "Met" : "Missing"}</strong>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="empty-hint">Governance checks are not available in this payload.</p>
                  )}
                </section>
              </div>

              <section className="report-block">
                <h3>Executive Agent Feedback</h3>
                {activeReviews.length > 0 ? (
                  <div className="review-grid">
                    {activeReviews.map((review) => (
                      <article key={`${review.agent}-${review.score}`} className={`review-card ${review.blocked ? "blocked" : "open"}`}>
                        <div className="review-head">
                          <div>
                            <h4>{review.agent}</h4>
                            <p>Confidence: {Math.round(review.confidence * 100)}%</p>
                          </div>
                          <div className="review-score">
                            {review.score}
                            <small>/10</small>
                          </div>
                        </div>
                        <p className="review-thesis">{review.thesis}</p>
                        {review.blockers.length > 0 ? (
                          <div className="review-blockers">
                            <span>Critical Blockers</span>
                            <ul>
                              {review.blockers.map((blocker) => (
                                <li key={blocker}>{blocker}</li>
                              ))}
                            </ul>
                          </div>
                        ) : null}
                      </article>
                    ))}
                  </div>
                ) : (
                  <p className="empty-hint">No review objects are available for this run.</p>
                )}
              </section>

              <section className="report-block">
                <h3>Cross-Agent Rebuttal Rounds</h3>
                {interactionRounds.length > 0 ? (
                  <div className="interaction-round-grid">
                    {interactionRounds.map((round) => (
                      <article key={round.round} className="interaction-round-card">
                        <div className="interaction-round-head">
                          <h4>Round {round.round}</h4>
                          <span>{round.deltas.length} change{round.deltas.length === 1 ? "" : "s"}</span>
                        </div>
                        <p className="interaction-round-summary">{round.summary}</p>
                        {round.deltas.length > 0 ? (
                          <ul className="interaction-delta-list">
                            {round.deltas.map((delta) => (
                              <li key={`${round.round}-${delta.agent_id}`} className="interaction-delta-item">
                                <div className="interaction-delta-agent">{delta.agent_name || delta.agent_id}</div>
                                <div className="interaction-delta-metrics">
                                  <span className={`interaction-score-delta ${delta.score_delta > 0 ? "up" : delta.score_delta < 0 ? "down" : "flat"}`}>
                                    Score {delta.previous_score} {"->"} {delta.revised_score} ({delta.score_delta > 0 ? "+" : ""}
                                    {delta.score_delta})
                                  </span>
                                  <span className={`interaction-block-delta ${delta.revised_blocked ? "blocked" : "open"}`}>
                                    Gate {delta.previous_blocked ? "Blocked" : "Open"} {"->"} {delta.revised_blocked ? "Blocked" : "Open"}
                                  </span>
                                </div>
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <p className="empty-hint">No score or block-status changes in this round.</p>
                        )}
                      </article>
                    ))}
                  </div>
                ) : (
                  <p className="empty-hint">No cross-agent rebuttal rounds were executed for this run.</p>
                )}
              </section>

              <section className={`report-block report-synthesis tone-${activeRecommendationTone ?? "challenged"}`}>
                <h3>Chairperson Synthesis</h3>
                <p className="synthesis-summary">
                  {activeReport.synthesis?.executive_summary ?? "Synthesis output is not available for this run."}
                </p>
                <div className="synthesis-grid">
                  <div>
                    <h4>Blockers</h4>
                    {activeReport.synthesis?.blockers.length ? (
                      <ul>
                        {activeReport.synthesis.blockers.map((item) => (
                          <li key={item}>{item}</li>
                        ))}
                      </ul>
                    ) : (
                      <p className="empty-hint">No blockers recorded.</p>
                    )}
                  </div>
                  <div>
                    <h4>Required Revisions</h4>
                    {activeReport.synthesis?.required_revisions.length ? (
                      <ol>
                        {activeReport.synthesis.required_revisions.map((item) => (
                          <li key={item}>{item}</li>
                        ))}
                      </ol>
                    ) : (
                      <p className="empty-hint">No mandatory revisions recorded.</p>
                    )}
                  </div>
                </div>
              </section>

              {activeReport.prd ? (
                <section className="report-block">
                  <h3>PRD Briefing</h3>
                  <div className="prd-grid">
                    <article className="prd-card">
                      <h4>Scope</h4>
                      <ul>
                        {activeReport.prd.scope.map((item) => (
                          <li key={item}>{item}</li>
                        ))}
                      </ul>
                    </article>
                    <article className="prd-card">
                      <h4>Milestones</h4>
                      <ul>
                        {activeReport.prd.milestones.map((item) => (
                          <li key={item}>{item}</li>
                        ))}
                      </ul>
                    </article>
                    <article className="prd-card">
                      <h4>Telemetry</h4>
                      <ul>
                        {activeReport.prd.telemetry.map((item) => (
                          <li key={item}>{item}</li>
                        ))}
                      </ul>
                    </article>
                    <article className="prd-card">
                      <h4>Risks</h4>
                      <ul>
                        {activeReport.prd.risks.map((item) => (
                          <li key={item}>{item}</li>
                        ))}
                      </ul>
                    </article>
                  </div>
                </section>
              ) : null}

              {activeReport.decision_snapshot?.excerpt ? (
                <section className="report-block">
                  <h3>Decision Context Excerpt</h3>
                  <div className="report-excerpt">{activeReport.decision_snapshot.excerpt}</div>
                </section>
              ) : null}

              <details className="report-raw">
                <summary>Show Raw Workflow JSON</summary>
                <pre>{JSON.stringify(activeReport.raw, null, 2)}</pre>
              </details>
            </div>
          </article>
        </div>
      ) : (
        <article className="preview-card">
          <h2>No report data generated</h2>
          <p>Run the workflow in the editor to generate an executive-ready strategic decision report.</p>
          {error ? <div className="preview-error">{error}</div> : null}
          <pre>{result ? JSON.stringify(result, null, 2) : "{ }"}</pre>
        </article>
      )}
    </section>
  );
}
